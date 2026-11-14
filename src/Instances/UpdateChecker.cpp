#include "Instances/UpdateChecker.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Instances/InstanceManager.hpp"
#include "Net/HttpClient.hpp"
#include <algorithm>
#include <cctype>
namespace emerald::instances {
namespace {
std::vector<int> parse_version_numbers(std::string_view v) {
  std::vector<int> parts;
  if (!v.empty() && (v.front() == 'v' || v.front() == 'V')) {
    v.remove_prefix(1);
  }
  int current = 0;
  bool in_num = false;
  for (char c : v) {
    if (c >= '0' && c <= '9') {
      current = current * 10 + (c - '0');
      in_num = true;
    } else if (c == '.' || c == '-' || c == '+') {
      if (in_num) {
        parts.push_back(current);
        current = 0;
        in_num = false;
      }
      if (c != '.') {
        break;
      }
    } else {
      break;
    }
  }
  if (in_num) {
    parts.push_back(current);
  }
  return parts;
}

bool is_newer_version(std::string_view remote, std::string_view current) {
  const std::vector<int> r_parts = parse_version_numbers(remote);
  const std::vector<int> c_parts = parse_version_numbers(current);
  const std::size_t n = std::max(r_parts.size(), c_parts.size());
  for (std::size_t i = 0; i < n; ++i) {
    const int r = i < r_parts.size() ? r_parts[i] : 0;
    const int c = i < c_parts.size() ? c_parts[i] : 0;
    if (r > c) {
      return true;
    }
    if (r < c) {
      return false;
    }
  }
  return false;
}

std::string trim_string(std::string s) {
  while (!s.empty() && (s.back() == '\r' || s.back() == '\n' || s.back() == ' ' || s.back() == '\t')) {
    s.pop_back();
  }
  std::size_t start = 0;
  while (start < s.size() && (s[start] == '\r' || s[start] == '\n' || s[start] == ' ' || s[start] == '\t')) {
    ++start;
  }
  if (start > 0) {
    s.erase(0, start);
  }
  return s;
}

}

UpdateChecker::UpdateChecker() = default;
UpdateChecker::~UpdateChecker() {
  stop();
}

void UpdateChecker::start(const config::AppConfig &config,
                          const std::vector<Edition> &editions) {
  stop();
  cancelled_ = false;
  worker_ = std::thread(&UpdateChecker::run, this, config, editions);
}

void UpdateChecker::stop() {
  cancelled_ = true;
  if (worker_.joinable()) {
    worker_.join();
  }
}

bool UpdateChecker::has_update(std::string_view edition_id) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return updates_available_.find(std::string(edition_id)) != updates_available_.end();
}

void UpdateChecker::clear_update(std::string_view edition_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto it = updates_available_.find(std::string(edition_id));
  if (it != updates_available_.end()) {
    updates_available_.erase(it);
    ++revision_;
  }
}

std::vector<PendingNotification> UpdateChecker::drain_notifications() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<PendingNotification> result = std::move(pending_notifications_);
  pending_notifications_.clear();
  return result;
}

std::uint64_t UpdateChecker::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

void UpdateChecker::run(config::AppConfig config, std::vector<Edition> editions) {
  net::HttpClient client(config.http_proxy);

  {
    const net::HttpResponse resp = client.get(
        "https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/latest/download/latest.json");
    if (resp.status == 200 && !resp.body.empty() && !cancelled_) {
      try {
        const auto json = Json::parse(resp.body);
        if (json.contains("version") && json["version"].is_string()) {
          const std::string remote_version = json["version"].template get<std::string>();
          if (is_newer_version(remote_version, EMERALD_VERSION)) {
            std::lock_guard<std::mutex> lock(mutex_);
            PendingNotification notif;
            notif.title_key = "download.updateAvailable";
            notif.default_title = "Update Available!";
            notif.message = "Update " + remote_version + " is available!";
            notif.variant = lazuli::ToastVariant::Update;
            notif.on_click =
                "open:https://github.com/LCE-Hub/LCE-Emerald-Launcher/releases/latest";
            pending_notifications_.push_back(std::move(notif));
            ++revision_;
          }
        }
      } catch (...) {
      }
    }
  }

  if (cancelled_) {
    return;
  }

  InstanceManager instance_manager(config);
  std::vector<std::string> updated_names;
  std::set<std::string> new_updates;
  for (const Edition &edition : editions) {
    if (cancelled_) {
      return;
    }
    if (!instance_manager.is_installed(edition.id)) {
      continue;
    }
    if (edition.url.empty() ||
        edition.url == "emerald://PLEASE_IM_TIRED_OF_ALL_THIS" ||
        (edition.url.rfind("http://", 0) != 0 &&
         edition.url.rfind("https://", 0) != 0)) {
      continue;
    }

    const std::filesystem::path working_dir =
        instance_manager.working_dir(edition.id);
    const std::filesystem::path timestamp_file =
        working_dir / "update_timestamp.txt";
    const std::optional<std::string> local_content =
        core::read_file(timestamp_file);
    const std::string local_timestamp = trim_string(local_content.value_or(""));
    bool update_available = false;
    if (local_timestamp.empty()) {
      update_available = true;
    } else {
      const net::HttpResponse resp = client.head(edition.url);
      if (resp.last_modified.has_value()) {
        const std::string remote_timestamp = trim_string(*resp.last_modified);
        if (!remote_timestamp.empty() && remote_timestamp != local_timestamp) {
          update_available = true;
        }
      } else {update_available = false;}
    }

    if (update_available) {
      new_updates.insert(edition.id);
      updated_names.push_back(edition.name);
    }
  }

  if (cancelled_) {
    return;
  }

  if (!new_updates.empty()) {
    std::lock_guard<std::mutex> lock(mutex_);
    updates_available_ = std::move(new_updates);
    PendingNotification notif;
    notif.title_key = "download.gameUpdateAvailable";
    notif.default_title = "Game Update Available!";
    if (updated_names.size() == 1) {
      notif.message = "An update is available for " + updated_names.front() + "!";
    } else {
      notif.message = "Updates are available for " +
                      std::to_string(updated_names.size()) + " versions!";
    }
    notif.variant = lazuli::ToastVariant::Update;
    notif.on_click = "go:versions";
    pending_notifications_.push_back(std::move(notif));
    ++revision_;
  }
}
}
