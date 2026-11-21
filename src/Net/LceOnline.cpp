#include "Net/LceOnline.hpp"
#include "Core/Log.hpp"
namespace emerald::lce {
namespace {
constexpr const char *kSocialBaseUrl = "https://social.mclegacyedition.xyz";
constexpr const char *kAuthBaseUrl = "https://auth.mclegacyedition.xyz";
constexpr const char *kUserAgent = "MCLCE-LCEOnline/1.1";
constexpr std::uint16_t kHostGamePort = 25565;
struct RawResponse {
  long status = 0;
  std::string body;
};

RawResponse lce_request(net::HttpClient &client, const std::string &token,
                        const std::string &method, const std::string &url,
                        const std::string &body) {
  std::vector<std::pair<std::string, std::string>> headers;
  headers.emplace_back("Accept", "text/plain, application/json");
  headers.emplace_back("User-Agent", kUserAgent);
  if (!token.empty()) {
    headers.emplace_back("Authorization", "Bearer " + token);
  }
  if (!body.empty()) {
    headers.emplace_back("Content-Type", "application/json");
  }
  net::HttpResponse response;
  try {
    response = client.request(method, url, body, headers);
  } catch (const std::exception &error) {
    throw std::string("Network error when calling ") + url + ": " +
        error.what();
  }
  return RawResponse{response.status, response.body};
}

Json parse_body(const std::string &body) {
  if (body.empty()) {
    return Json::object();
  }
  try {
    return Json::parse(body);
  } catch (const std::exception &) {
    return Json(body);
  }
}

std::string error_from(long status, const std::string &body) {
  const Json data = parse_body(body);
  if (data.is_object()) {
    for (const char *key : {"message", "detail", "title", "error"}) {
      const auto found = data.find(key);
      if (found != data.end() && found->is_string() &&
          !found->get<std::string>().empty()) {
        return found->get<std::string>();
      }
    }
  }
  if (data.is_string()) {
    return data.get<std::string>();
  }
  return "HTTP " + std::to_string(status);
}

std::string require_ok(long status, const std::string &body) {
  if (status < 200 || status >= 400) {
    throw error_from(status, body);
  }
  return body;
}

std::string url_encode(const std::string &value) {
  static const char *hex = "0123456789ABCDEF";
  std::string encoded;
  encoded.reserve(value.size());
  for (const char character : value) {
    const unsigned char byte = static_cast<unsigned char>(character);
    const bool safe = (byte >= 'A' && byte <= 'Z') ||
                      (byte >= 'a' && byte <= 'z') ||
                      (byte >= '0' && byte <= '9') || byte == '-' ||
                      byte == '_' || byte == '.' || byte == '~';
    if (safe) {
      encoded.push_back(character);
    } else {
      encoded.push_back('%');
      encoded.push_back(hex[byte >> 4]);
      encoded.push_back(hex[byte & 0xF]);
    }
  }
  return encoded;
}

SocialEntry social_entry(const Json &object) {
  SocialEntry entry;
  entry.username = object.value("username", std::string{});
  entry.display_name = object.value("displayName", std::string{});
  return entry;
}

std::vector<SocialEntry> social_list(const Json &object, const char *key) {
  std::vector<SocialEntry> entries;
  if (!object.is_object()) {
    return entries;
  }
  const auto found = object.find(key);
  if (found == object.end() || !found->is_array()) {
    return entries;
  }
  for (const Json &item : *found) {
    if (item.is_object()) {
      entries.push_back(social_entry(item));
    }
  }
  return entries;
}

InviteEntry invite_entry(const Json &object) {
  InviteEntry entry;
  entry.id = object.value("inviteid", std::string{});
  const auto from = object.find("from");
  if (from != object.end() && from->is_object()) {
    entry.from_username = from->value("username", std::string{});
    entry.from_display = from->value("displayName", std::string{});
  }
  return entry;
}

std::string display_name_for(const SocialEntry &entry) {
  return entry.display_name.empty() ? entry.username : entry.display_name;
}
} // namespace

LceOnlineService::~LceOnlineService() {
  stopping_.store(true);
  job_cv_.notify_all();
  if (worker_.joinable()) {
    worker_.join();
  }
}

void LceOnlineService::configure(config::ConfigStore &config) {
  config_ = &config;
  const config::AppConfig &data = config.data();
  if (data.lceonline_token.has_value() && !data.lceonline_token->empty()) {
    LceSessionState session;
    session.signed_in = true;
    session.token = *data.lceonline_token;
    session.username = data.lceonline_username.value_or("Player");
    session.display_name =
        data.lceonline_display_name.value_or(session.username);
    std::lock_guard<std::mutex> lock(mutex_);
    session_ = session;
    session_dirty_ = false;
    snapshot_.signed_in = true;
    snapshot_.username = session.username;
    snapshot_.display_name = session.display_name;
    seen_requests_.clear();
    seen_invites_.clear();
    seeded_ = false;
  }
  if (!worker_started_.exchange(true)) {
    worker_ = std::thread([this] { run_worker(); });
  }
  if (data.lceonline_token.has_value() && !data.lceonline_token->empty()) {
    core::info("lceonline: restored session for " +
               data.lceonline_username.value_or("Player"));
    post([this] {
      refresh_now();
      last_refresh_ = std::chrono::steady_clock::now();
    });
  }
}

LceSnapshot LceOnlineService::snapshot() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return snapshot_;
}

std::uint64_t LceOnlineService::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

std::vector<LceNotification> LceOnlineService::drain_notifications() {
  std::lock_guard<std::mutex> lock(mutex_);
  return std::move(pending_notifications_);
}

std::optional<LceSessionState> LceOnlineService::consume_session() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!session_dirty_) {
    return std::nullopt;
  }
  session_dirty_ = false;
  return session_;
}

void LceOnlineService::kick() {
  {
    std::lock_guard<std::mutex> lock(job_mutex_);
    last_refresh_.reset();
  }
  job_cv_.notify_all();
}

void LceOnlineService::post(std::function<void()> job) {
  {
    std::lock_guard<std::mutex> lock(job_mutex_);
    jobs_.push_back(std::move(job));
  }
  job_cv_.notify_all();
}

void LceOnlineService::post_busy(std::function<void()> job) {
  post([this, job = std::move(job)] {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      snapshot_.busy = true;
      snapshot_.error.clear();
      ++revision_;
    }
    try {
      job();
    } catch (const std::string &message) {
      core::error("lceonline: " + message);
      set_error(message);
    } catch (const std::exception &error) {
      core::error(std::string("lceonline: ") + error.what());
      set_error(error.what());
    }
    {
      std::lock_guard<std::mutex> lock(mutex_);
      snapshot_.busy = false;
      ++revision_;
    }
  });
}

void LceOnlineService::run_worker() {
  while (!stopping_.load()) {
    std::function<void()> job;
    bool do_refresh = false;
    {
      std::unique_lock<std::mutex> lock(job_mutex_);
      job_cv_.wait_for(lock, std::chrono::seconds(3), [this] {
        return stopping_.load() || !jobs_.empty();
      });
      if (stopping_.load()) {
        break;
      }
      if (!jobs_.empty()) {
        job = std::move(jobs_.front());
        jobs_.pop_front();
      } else {
        bool signed_in = false;
        {
          std::lock_guard<std::mutex> state_lock(mutex_);
          signed_in = snapshot_.signed_in;
        }
        const auto now = std::chrono::steady_clock::now();
        if (signed_in && (!last_refresh_.has_value() ||
                          now - *last_refresh_ >= std::chrono::seconds(3))) {
          do_refresh = true;
          last_refresh_ = now;
        }
      }
    }
    if (job) {
      job();
    } else if (do_refresh) {
      refresh_now();
    }
  }
}

void LceOnlineService::set_error(const std::string &message) {
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.error = message;
  ++revision_;
}

void LceOnlineService::dismiss_error() {
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.error.clear();
  ++revision_;
}

void LceOnlineService::bump() {
  std::lock_guard<std::mutex> lock(mutex_);
  ++revision_;
}

void LceOnlineService::apply_session(const LceSessionState &session) {
  std::lock_guard<std::mutex> lock(mutex_);
  session_ = session;
  session_dirty_ = true;
  snapshot_.signed_in = session.signed_in;
  snapshot_.username = session.username;
  snapshot_.display_name = session.display_name;
  if (!session.signed_in) {
    snapshot_.friends.clear();
    snapshot_.requests.clear();
    snapshot_.invites.clear();
    snapshot_.accepted_invite.reset();
  }
  seen_requests_.clear();
  seen_invites_.clear();
  seeded_ = false;
  ++revision_;
}

void LceOnlineService::login(const std::string &username,
                             const std::string &password) {
  post_busy([this, username, password] {
    const Json payload = Json{{"username", username}, {"password", password}};
    const RawResponse response =
        lce_request(client_, "", "POST",
                    std::string(kAuthBaseUrl) + "/login", payload.dump());
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (!data.is_object()) {
      throw std::string("Login failed");
    }
    const std::string token = data.value("token", std::string{});
    if (token.empty()) {
      for (const char *key : {"message", "detail", "title", "error"}) {
        const auto found = data.find(key);
        if (found != data.end() && found->is_string() &&
            !found->get<std::string>().empty()) {
          throw found->get<std::string>();
        }
      }
      throw std::string("Login failed");
    }
    std::string user = data.value("username", username);
    if (user.empty()) {
      user = "Player";
    }
    const std::string display_name = data.value("displayName", user);
    apply_session(LceSessionState{true, token, user, display_name});
    refresh_now();
    last_refresh_ = std::chrono::steady_clock::now();
    core::info("lceonline: signed in as " + user);
    job_cv_.notify_all();
  });
}

void LceOnlineService::register_account(const std::string &username,
                                        const std::string &password) {
  post_busy([this, username, password] {
    const Json payload = Json{{"username", username}, {"password", password}};
    const RawResponse response =
        lce_request(client_, "", "POST",
                    std::string(kAuthBaseUrl) + "/register", payload.dump());
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (!data.is_object()) {
      throw std::string("Registration failed");
    }
    const std::string token = data.value("token", std::string{});
    if (token.empty()) {
      for (const char *key : {"message", "detail", "title", "error"}) {
        const auto found = data.find(key);
        if (found != data.end() && found->is_string() &&
            !found->get<std::string>().empty()) {
          throw found->get<std::string>();
        }
      }
      throw std::string("Registration failed");
    }
    std::string user = data.value("username", username);
    if (user.empty()) {
      user = "Player";
    }
    const std::string display_name = data.value("displayName", user);
    apply_session(LceSessionState{true, token, user, display_name});
    refresh_now();
    last_refresh_ = std::chrono::steady_clock::now();
    core::info("lceonline: registered account " + user);
    job_cv_.notify_all();
  });
}

void LceOnlineService::logout() {
  post_busy([this] {
    relay_.stop_all();
    apply_session(LceSessionState{});
    last_refresh_.reset();
    core::info("lceonline: signed out");
  });
}

void LceOnlineService::refresh_now() {
  std::string token;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!snapshot_.signed_in || !session_.signed_in) {
      return;
    }
    token = session_.token;
  }
  Json lists;
  try {
    const RawResponse response =
        lce_request(client_, token, "GET",
                    std::string(kSocialBaseUrl) + "/getSocialLists", "");
    lists = parse_body(require_ok(response.status, response.body));
  } catch (const std::string &message) {
    core::warn("lceonline: social refresh failed: " + message);
    return;
  }
  std::vector<InviteEntry> invites;
  try {
    const RawResponse response =
        lce_request(client_, token, "GET",
                    std::string(kSocialBaseUrl) + "/getinvites", "");
    const Json data =
        parse_body(require_ok(response.status, response.body));
    if (data.is_array()) {
      for (const Json &item : data) {
        if (item.is_object()) {
          invites.push_back(invite_entry(item));
        }
      }
    }
  } catch (const std::string &message) {
    core::warn("lceonline: invite refresh failed: " + message);
  }
  if (lists.is_string()) {
    core::warn("lceonline: social refresh failed: " + lists.get<std::string>());
    return;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.friends = social_list(lists, "friends");
  snapshot_.requests = social_list(lists, "friendRequests");
  snapshot_.invites = invites;
  core::debug("lceonline: refreshed friends=" +
              std::to_string(snapshot_.friends.size()) + " requests=" +
              std::to_string(snapshot_.requests.size()) + " invites=" +
              std::to_string(snapshot_.invites.size()));
  if (seeded_) {
    for (const SocialEntry &entry : snapshot_.requests) {
      if (seen_requests_.insert(entry.username).second) {
        LceNotification notification;
        notification.kind = LceNotification::Kind::FriendRequest;
        notification.name = display_name_for(entry);
        pending_notifications_.push_back(std::move(notification));
        core::info("lceonline: new friend request from " +
                   display_name_for(entry));
      }
    }
    for (const InviteEntry &entry : snapshot_.invites) {
      if (seen_invites_.insert(entry.id).second) {
        LceNotification notification;
        notification.kind = LceNotification::Kind::Invite;
        notification.name =
            entry.from_display.empty() ? entry.from_username
                                       : entry.from_display;
        pending_notifications_.push_back(std::move(notification));
        core::info("lceonline: new invite from " + notification.name);
      }
    }
  } else {
    for (const SocialEntry &entry : snapshot_.requests) {
      seen_requests_.insert(entry.username);
    }
    for (const InviteEntry &entry : snapshot_.invites) {
      seen_invites_.insert(entry.id);
    }
    seeded_ = true;
  }
  ++revision_;
}

void LceOnlineService::send_request(const std::string &target) {
  post_busy([this, target] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response = lce_request(
        client_, token, "GET",
        std::string(kSocialBaseUrl) + "/sendrequest?target=" +
            url_encode(target),
        "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (data.is_string() &&
        data.get<std::string>() != "Successfully Sent Friend Request") {
      throw data.get<std::string>();
    }
    core::info("lceonline: sent friend request to " + target);
    refresh_now();
  });
}

void LceOnlineService::accept_request(const std::string &from) {
  post_busy([this, from] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response = lce_request(
        client_, token, "GET",
        std::string(kSocialBaseUrl) + "/acceptrequest?from=" + url_encode(from),
        "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (data.is_string() && data.get<std::string>() != "1") {
      throw data.get<std::string>();
    }
    core::info("lceonline: accepted friend request from " + from);
    refresh_now();
  });
}

void LceOnlineService::decline_request(const std::string &from) {
  post_busy([this, from] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response = lce_request(
        client_, token, "GET",
        std::string(kSocialBaseUrl) + "/declinerequest?from=" + url_encode(from),
        "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (data.is_string() && data.get<std::string>() != "1") {
      throw data.get<std::string>();
    }
    core::info("lceonline: declined friend request from " + from);
    refresh_now();
  });
}

void LceOnlineService::remove_friend(const std::string &from) {
  post_busy([this, from] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response = lce_request(
        client_, token, "GET",
        std::string(kSocialBaseUrl) + "/removefriend?from=" + url_encode(from),
        "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (data.is_string()) {
      throw data.get<std::string>();
    }
    core::info("lceonline: removed friend " + from);
    refresh_now();
  });
}

void LceOnlineService::send_invite(const std::string &target) {
  post_busy([this, target] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response =
        lce_request(client_, token, "GET",
                    std::string(kSocialBaseUrl) + "/invite?target=" +
                        url_encode(target),
                    "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (data.is_string() &&
        data.get<std::string>() != "Successfully Sent Invite") {
      throw data.get<std::string>();
    }
    core::info("lceonline: sent invite to " + target);
  });
}

void LceOnlineService::accept_invite(const std::string &from,
                                     const std::string &invite_id) {
  post_busy([this, from, invite_id] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response =
        lce_request(client_, token, "GET",
                    std::string(kSocialBaseUrl) + "/acceptinvite?from=" +
                        url_encode(from),
                    "");
    const std::string body = require_ok(response.status, response.body);
    const Json data = parse_body(body);
    if (!data.is_string()) {
      throw std::string("Failed to accept invite");
    }
    AcceptedInvite accepted;
    accepted.invite_id = invite_id;
    accepted.from = from;
    accepted.session = data.get<std::string>();
    std::lock_guard<std::mutex> lock(mutex_);
    snapshot_.accepted_invite = std::move(accepted);
    ++revision_;
    core::info("lceonline: accepted invite from " + from);
  });
}

void LceOnlineService::decline_invite(const std::string &from) {
  post_busy([this, from] {
    std::string token;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      token = session_.token;
    }
    const RawResponse response =
        lce_request(client_, token, "GET",
                    std::string(kSocialBaseUrl) + "/declineinvite?from=" +
                        url_encode(from),
                    "");
    if (response.status >= 400 &&
        response.body != "Successfully Declined Invite") {
      throw error_from(response.status, response.body);
    }
    core::info("lceonline: declined invite from " + from);
    refresh_now();
  });
}

void LceOnlineService::clear_accepted_invite() {
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.accepted_invite.reset();
  ++revision_;
}

void LceOnlineService::start_hosting() {
  std::string token;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!snapshot_.signed_in) {
      return;
    }
    token = session_.token;
  }
  if (token.empty()) {
    set_error("Not signed in");
    return;
  }
  relay_.start_host(token, kHostGamePort);
  core::info("lceonline: hosting on port " + std::to_string(kHostGamePort));
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.hosting = true;
  ++revision_;
}

void LceOnlineService::stop_hosting() {
  relay_.stop_all();
  core::info("lceonline: stopped hosting");
  std::lock_guard<std::mutex> lock(mutex_);
  snapshot_.hosting = false;
  ++revision_;
}

bool LceOnlineService::start_join(const std::string &target_session,
                                  std::string &error) {
  std::string token;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    token = session_.token;
  }
  if (token.empty()) {
    error = "Not signed in";
    return false;
  }
  if (!relay_.start_join(token, target_session, error)) {
    core::warn("lceonline: relay join failed: " + error);
    return false;
  }
  return true;
}
} // namespace emerald::lce
