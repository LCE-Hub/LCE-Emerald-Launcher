#include "Ui/Views/LceOnlineView.hpp"
#include "Instances/InstanceManager.hpp"
#include "Ui/EditionResolver.hpp"
#include "lazuli/I18n.hpp"
#include <algorithm>
namespace emerald::ui {
namespace {
std::string translate(const UiServices &services, const std::string &key,
                      const std::string &fallback) {
  return services.i18n != nullptr ? services.i18n->translate(key) : fallback;
}

std::vector<std::string> split_action(const std::string &action) {
  std::vector<std::string> parts;
  std::size_t cursor = 0;
  while (true) {
    const std::size_t colon = action.find(':', cursor);
    if (colon == std::string::npos) {
      parts.push_back(action.substr(cursor));
      break;
    }
    parts.push_back(action.substr(cursor, colon - cursor));
    cursor = colon + 1;
  }
  return parts;
}
} // namespace

Json LceOnlineView::data(const UiServices &services) const {
  Json data = Json::object();
  lce::LceSnapshot snapshot;
  if (services.lce_online != nullptr) {
    snapshot = services.lce_online->snapshot();
  }
  data["signedIn"] = snapshot.signed_in;
  data["signedOut"] = !snapshot.signed_in;
  data["busy"] = snapshot.busy;
  data["hosting"] = snapshot.hosting;
  data["error"] = snapshot.error;
  data["displayName"] = snapshot.display_name.empty()
                            ? snapshot.username
                            : snapshot.display_name;
  if (snapshot.accepted_invite.has_value() && !joining_) {
    join_open_ = true;
    joining_ = false;
    join_host_ = snapshot.accepted_invite->from;
    join_session_ = snapshot.accepted_invite->session;
    selected_instance_.clear();
    if (services.lce_online != nullptr) {
      services.lce_online->clear_accepted_invite();
    }
  }
  data["tab"] = tab_;
  data["tabFriends"] = tab_ == "friends";
  data["tabRequests"] = tab_ == "requests";
  data["tabInvites"] = tab_ == "invites";
  data["notHosting"] = !snapshot.hosting;
  data["friendsTabClass"] = tab_ == "friends" ? "lce-tab-active" : "lce-tab";
  data["requestsTabClass"] = tab_ == "requests" ? "lce-tab-active" : "lce-tab";
  data["invitesTabClass"] = tab_ == "invites" ? "lce-tab-active" : "lce-tab";
  Json friends = Json::array();
  for (const lce::SocialEntry &entry : snapshot.friends) {
    Json item = Json::object();
    item["name"] =
        entry.display_name.empty() ? entry.username : entry.display_name;
    item["username"] = entry.username;
    item["action"] = "lceonline.remove:" + entry.username;
    if (snapshot.hosting) {
      item["inviteAction"] = "lceonline.invite:" + entry.username;
      item["noInviteAction"] = false;
    } else {
      item["noInviteAction"] = true;
    }
    friends.push_back(std::move(item));
  }
  data["friends"] = friends;
  data["friendsEmpty"] = friends.empty();
  data["friendCount"] = friends.size();
  Json requests = Json::array();
  for (const lce::SocialEntry &entry : snapshot.requests) {
    Json item = Json::object();
    item["name"] =
        entry.display_name.empty() ? entry.username : entry.display_name;
    item["username"] = entry.username;
    item["acceptAction"] = "lceonline.acceptReq:" + entry.username;
    item["declineAction"] = "lceonline.declineReq:" + entry.username;
    requests.push_back(std::move(item));
  }
  data["requests"] = requests;
  data["requestsEmpty"] = requests.empty();
  data["requestCount"] = requests.size();
  Json invites = Json::array();
  for (const lce::InviteEntry &entry : snapshot.invites) {
    Json item = Json::object();
    item["name"] =
        entry.from_display.empty() ? entry.from_username : entry.from_display;
    item["username"] = entry.from_username;
    item["joinAction"] =
        "lceonline.acceptInvite:" + entry.id + ":" + entry.from_username;
    item["declineAction"] = "lceonline.declineInvite:" + entry.from_username;
    invites.push_back(std::move(item));
  }
  data["invites"] = invites;
  data["invitesEmpty"] = invites.empty();
  data["inviteCount"] = invites.size();
  data["addFriendOpen"] = add_friend_open_;
  data["authIsLogin"] = auth_mode_ == "login";
  data["authLoginClass"] = auth_mode_ == "login" ? "lce-tab-active" : "lce-tab";
  data["authRegisterClass"] =
      auth_mode_ == "register" ? "lce-tab-active" : "lce-tab";
  data["authUsername"] = auth_username_;
  data["authError"] = auth_error_;
  data["authSubmitLabel"] = translate(
      services, auth_mode_ == "login" ? "lceOnline.signIn"
                                      : "lceOnline.register",
      auth_mode_ == "login" ? "Sign In" : "Register");
  data["authBusyClass"] = snapshot.busy ? "main-button-disabled" : "";
  data["joinOpen"] = join_open_;
  data["joining"] = joining_;
  data["joinHost"] = join_host_;
  std::string prompt = translate(
      services, "modals.chooseInstance.joinPrompt",
      "Joining {{name}}'s game. Choose an instance:");
  const std::size_t name_start = prompt.find("{{name}}");
  if (name_start != std::string::npos) {
    prompt.replace(name_start, 8, join_host_);
  }
  data["joinPrompt"] = prompt;
  Json instances = Json::array();
  if (services.config != nullptr) {
    const instances::InstanceManager manager(services.config->data());
    for (const instances::Edition &edition :
         resolve_config_editions(services.config->data())) {
      if (!manager.is_installed(edition.id)) {
        continue;
      }
      Json item = Json::object();
      item["id"] = edition.id;
      item["name"] = edition.name;
      item["logo"] = edition.logo;
      item["selected"] = edition.id == selected_instance_;
      item["selectedClass"] =
          edition.id == selected_instance_ ? "selected" : "";
      instances.push_back(std::move(item));
    }
  }
  if (selected_instance_.empty() && !instances.empty()) {
    selected_instance_ = instances[0]["id"].get<std::string>();
    instances[0]["selected"] = true;
    instances[0]["selectedClass"] = "selected";
  }
  data["instances"] = instances;
  data["hasInstances"] = !instances.empty();
  data["noInstances"] = instances.empty();
  data["selectedInstance"] = selected_instance_;
  return data;
}

void LceOnlineView::on_enter() {
  tab_ = "friends";
  add_friend_open_ = false;
  auth_error_.clear();
  join_open_ = false;
  joining_ = false;
  join_session_.clear();
  selected_instance_.clear();
}

bool LceOnlineView::action(std::string_view name, UiServices &services) {
  if (services.lce_online == nullptr) {
    return false;
  }
  const std::string action(name);
  const std::vector<std::string> parts = split_action(action);
  const std::string &verb = parts[0];
  if (verb == "lceonline.tab" && parts.size() >= 2) {
    if (parts[1] == "friends" || parts[1] == "requests" ||
        parts[1] == "invites") {
      tab_ = parts[1];
      services.lce_online->kick();
    }
    return true;
  }
  if (verb == "lceonline.host") {
    services.lce_online->start_hosting();
    return true;
  }
  if (verb == "lceonline.stopHost") {
    services.lce_online->stop_hosting();
    return true;
  }
  if (verb == "lceonline.logout") {
    services.lce_online->logout();
    auth_error_.clear();
    return true;
  }
  if (verb == "lceonline.addFriend.open") {
    add_friend_open_ = true;
    services.focus_element("lceonline-add-friend");
    return true;
  }
  if (verb == "lceonline.addFriend.cancel") {
    add_friend_open_ = false;
    return true;
  }
  if (verb == "lceonline.addFriend.submit") {
    const std::string target = services.read_text_input();
    add_friend_open_ = false;
    if (!target.empty()) {
      services.lce_online->send_request(target);
    }
    return true;
  }
  if (verb == "lceonline.remove" && parts.size() >= 2) {
    services.lce_online->remove_friend(parts[1]);
    return true;
  }
  if (verb == "lceonline.invite" && parts.size() >= 2) {
    services.lce_online->send_invite(parts[1]);
    return true;
  }
  if (verb == "lceonline.acceptReq" && parts.size() >= 2) {
    services.lce_online->accept_request(parts[1]);
    return true;
  }
  if (verb == "lceonline.declineReq" && parts.size() >= 2) {
    services.lce_online->decline_request(parts[1]);
    return true;
  }
  if (verb == "lceonline.acceptInvite" && parts.size() >= 3) {
    services.lce_online->accept_invite(parts[2], parts[1]);
    return true;
  }
  if (verb == "lceonline.declineInvite" && parts.size() >= 2) {
    services.lce_online->decline_invite(parts[1]);
    return true;
  }
  if (verb == "lceonline.error.ok") {
    services.lce_online->dismiss_error();
    return true;
  }
  if (verb == "lceonline.auth.login") {
    auth_mode_ = "login";
    auth_error_.clear();
    return true;
  }
  if (verb == "lceonline.auth.register") {
    auth_mode_ = "register";
    auth_error_.clear();
    return true;
  }
  if (verb == "lceonline.auth.username") {
    auth_username_ = services.read_text_input();
    services.focus_element("lceonline-password");
    return true;
  }
  if (verb == "lceonline.auth.password" || verb == "lceonline.auth.submit") {
    if (services.text_edited != nullptr && services.text_edited()) {
      auth_password_ = services.read_text_input();
    }
    if (auth_username_.empty() || auth_password_.empty()) {
      auth_error_ = translate(services, "lceOnline.enterCredentials",
                              "Enter a username and password");
      return true;
    }
    auth_error_.clear();
    if (auth_mode_ == "login") {
      services.lce_online->login(auth_username_, auth_password_);
    } else {
      services.lce_online->register_account(auth_username_, auth_password_);
    }
    auth_password_.clear();
    return true;
  }
  if (verb == "lceonline.join.select" && parts.size() >= 2) {
    selected_instance_ = parts[1];
    return true;
  }
  if (verb == "lceonline.join.confirm") {
    if (joining_ || join_session_.empty() || selected_instance_.empty()) {
      return true;
    }
    if (services.launch == nullptr) {
      return false;
    }
    joining_ = true;
    std::string relay_error;
    if (!services.lce_online->start_join(join_session_, relay_error)) {
      joining_ = false;
      if (services.notify != nullptr) {
        services.notify(
            translate(services, "lceOnline.error", "Error"),
            relay_error.empty()
                ? translate(services, "lceOnline.anErrorOccurred",
                            "An error occurred")
                : relay_error,
            ToastVariant::Error, "");
      }
      return true;
    }
    const std::vector<config::McServer> servers{
        config::McServer{"LCEOnline Game", "127.0.0.1", 61000}};
    const std::vector<std::string> extra_args{"-ip", "127.0.0.1", "-port",
                                              "61000", "-quitondisconnect"};
    const bool launched =
        services.launch->start(selected_instance_, servers, extra_args);
    joining_ = false;
    if (launched) {
      join_open_ = false;
      join_session_.clear();
    } else {
      services.lce_online->relay().stop_all();
      if (services.notify != nullptr) {
        services.notify(
            translate(services, "lceOnline.error", "Error"),
            services.launch->snapshot().message.empty()
                ? translate(services, "lceOnline.failedToStartHosting",
                            "Failed to start hosting")
                : services.launch->snapshot().message,
            ToastVariant::Error, "");
      }
    }
    return true;
  }
  if (verb == "lceonline.join.close") {
    if (!joining_) {
      join_open_ = false;
      join_session_.clear();
    }
    return true;
  }
  return false;
}
} // namespace emerald::ui
