#include "Ui/Views/HomeView.hpp"
#include "Core/Log.hpp"
#include "Instances/InstanceManager.hpp"
#include "Launch/Servers.hpp"
#include "Ui/EditionResolver.hpp"
namespace emerald::ui {
Json HomeView::data(const UiServices &services) const {
  bool installed = false;
  std::string profile = "legacy_evolved";
  Json data = Json::object();
  data["titleImage"] = "/images/MenuTitle.png";
  data["username"] = "";
  data["profile"] = "legacy_evolved";
  data["language"] = "en";
  if (services.config != nullptr) {
    const config::AppConfig &config = services.config->data();
    const instances::InstanceManager instance_manager(config);
    profile = config.profile.value_or("legacy_evolved");
    installed = instance_manager.is_installed(profile);
    data["username"] = config.username;
    data["profile"] = profile;
    data["language"] = config.language.value_or("en");
    const std::optional<instances::Edition> edition =
        find_config_edition(config, profile);
    if (edition.has_value() && !edition->title_image.empty()) {
      data["titleImage"] = edition->title_image;
    }
  }
  std::string running_id;
  if (services.launch != nullptr) {
    const launch::LaunchSnapshot snapshot = services.launch->snapshot();
    data["gameRunning"] = snapshot.running;
    data["runningId"] = snapshot.instance_id;
    data["gameError"] = snapshot.message;
    data["showLog"] = services.launch->show_log();
    data["hasLog"] = services.launch->has_log();
    data["gameLog"] = services.launch->last_log();
    if (snapshot.running) {
      running_id = snapshot.instance_id;
    }
  }
  data["showPlay"] = installed && !(running_id == profile);
  data["showStop"] = (running_id == profile);
  return data;
}

bool HomeView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }

  const std::string action(name);
  const std::size_t colon = action.find(':');
  const std::string verb =
      colon == std::string::npos ? action : action.substr(0, colon);
  const std::string argument =
      colon == std::string::npos ? std::string() : action.substr(colon + 1);
  if (name == "quit") {
    if (services.quit) {
      services.quit();
    }
    return true;
  }
  if (verb == "versions.launch") {
    if (services.launch == nullptr) {
      return false;
    }
    if (services.launch->start(argument, launch::partnership_servers())) {
      status_.clear();
    } else {
      status_ = services.launch->snapshot().message;
    }
    return true;
  }
  if (verb == "versions.stop") {
    if (services.launch != nullptr) {
      services.launch->stop();
    }
    return true;
  }
  return false;
}
} // namespace emerald::ui