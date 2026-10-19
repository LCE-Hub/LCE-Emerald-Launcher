#include "Ui/Views/VersionsView.hpp"
#include "Config/ConfigSchema.hpp"
#include "Core/Fs.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Instances/ArgsSchema.hpp"
#include "Instances/Editions.hpp"
#include "Instances/InstanceManager.hpp"
#include "Launch/Servers.hpp"
#include "Ui/EditionResolver.hpp"
#include <cstdlib>
#include <utility>
#include <vector>
namespace emerald::ui {
namespace {
constexpr const char *kArgsSchemaFile = "Arguments.Schema.json";

bool has_args_schema(const instances::InstanceManager &instances,
                     const std::string &instance_id) {
  const std::optional<std::string> text =
      core::read_file(instances.working_dir(instance_id) / kArgsSchemaFile);
  if (!text.has_value()) {
    return false;
  }
  return instances::parse_schema(*text).has_value();
}

std::string state_name(instances::DownloadState state) {
  switch (state) {
  case instances::DownloadState::running:
    return "running";
  case instances::DownloadState::finished:
    return "finished";
  case instances::DownloadState::cancelled:
    return "cancelled";
  case instances::DownloadState::failed:
    return "failed";
  case instances::DownloadState::idle:
    break;
  }
  return "idle";
}

} // namespace
Json VersionsView::data(const UiServices &services) const {
  Json data = Json::object();
  data["titleImage"] = "/images/MenuTitle.png";
  data["username"] = "";
  data["profile"] = "legacy_evolved";
  data["language"] = "en";
  data["status"] = status_;
  data["editions"] = Json::array();
  data["selected"] = "legacy_evolved";
  if (services.config == nullptr) {
    return data;
  }

  const config::AppConfig &config = services.config->data();
  const std::string active_profile = config.profile.value_or("legacy_evolved");
  data["username"] = config.username;
  data["profile"] = active_profile;
  data["language"] = config.language.value_or("en");
  data["selected"] = active_profile;
  const instances::InstanceManager instance_manager(config);
  const std::vector<instances::Edition> editions =
      resolve_config_editions(config);
  for (const instances::Edition &edition : editions) {
    if (edition.id == active_profile && !edition.title_image.empty()) {
      data["titleImage"] = edition.title_image;
      break;
    }
  }

  for (const instances::Edition &edition : editions) {
    const bool installed = instance_manager.is_installed(edition.id);
    if (edition.hidden && !installed) {
      continue;
    }

    Json entry = Json::object();
    entry["id"] = edition.id;
    entry["name"] = edition.name;
    entry["desc"] = edition.desc;
    entry["logo"] = edition.logo;
    entry["category"] = edition.category;
    entry["installed"] = installed;
    entry["notInstalled"] = !installed;
    entry["selected"] = edition.id == active_profile;
    entry["rowClass"] = edition.id == active_profile ? "selected" : "";
    entry["managed"] = instance_manager.is_managed(edition.id);
    entry["comingSoon"] = edition.coming_soon;
    entry["canDownload"] = !edition.url.empty() && !edition.hidden;
    entry["showInstall"] = !installed;
    entry["hasArgsSchema"] =
        installed && has_args_schema(instance_manager, edition.id);
    entry["path"] = instance_manager.working_dir(edition.id).string();
    if (services.downloads != nullptr) {
      const instances::DownloadSnapshot download =
          services.downloads->snapshot(edition.id);
      entry["downloadState"] = state_name(download.state);
      entry["downloadPercent"] = download.percent;
      entry["downloadPercentText"] =
          std::to_string(static_cast<int>(download.percent));
      entry["downloading"] = download.active();
      if (download.active()) {
        entry["showInstall"] = false;
      }
      if (!download.message.empty() &&
          download.state != instances::DownloadState::running) {
        entry["downloadMessage"] = download.message;
      }
    } else {
      entry["downloadState"] = "idle";
      entry["downloadPercent"] = 0.0;
      entry["downloadPercentText"] = "0";
      entry["downloading"] = false;
    }

    if (services.playtime != nullptr && installed) {
      const playtime::PlaytimeResponse response =
          services.playtime->get_playtime(edition.id);
      entry["playtime"] = response.total_seconds;
      entry["playtimeWeek"] = response.week_seconds;
      entry["playtimeDay"] = response.day_seconds;
    } else {
      entry["playtime"] = 0;
      entry["playtimeWeek"] = 0;
      entry["playtimeDay"] = 0;
    }

    data["editions"].push_back(std::move(entry));
  }

  data["installedCount"] = 0;
  for (const Json &item : data["editions"]) {
    if (item.value("installed", false)) {
      data["installedCount"] = data["installedCount"].get<int>() + 1;
    }
  }

  return data;
}

bool VersionsView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }

  const std::string action(name);
  const std::size_t colon = action.find(':');
  const std::string verb =
      colon == std::string::npos ? action : action.substr(0, colon);
  const std::string argument =
      colon == std::string::npos ? std::string() : action.substr(colon + 1);
  if (verb == "versions.select") {
    services.config->data().profile = argument;
    services.config->save();
    return true;
  }
  if (verb == "versions.refresh") {
    status_.clear();
    return true;
  }

  const instances::InstanceManager instance_manager(services.config->data());
  if (verb == "versions.install" || verb == "versions.repair") {
    if (services.downloads == nullptr) {
      status_ = "Downloads are not available";
      return true;
    }
    if (services.downloads->is_active(argument)) {
      return true;
    }

    const std::vector<instances::Edition> editions =
        resolve_config_editions(services.config->data());
    const instances::Edition *edition = nullptr;
    for (const instances::Edition &candidate : editions) {
      if (candidate.id == argument) {
        edition = &candidate;
        break;
      }
    }
    if (edition == nullptr || edition->url.empty() || edition->hidden) {
      status_ = "Cannot install " + argument;
      return true;
    }

    instances::DownloadRequest request;
    request.instance_id = argument;
    request.url = instances::edition_download_url(*edition, "latest");
    request.instance_dir = instance_manager.working_dir(argument);
    request.archive_dir = core::app_data_dir() / "downloads";
    request.username = services.config->data().username;
    request.dlc_source = services.dlc_source;
    request.skin_pck = services.skin_pck;
    if (!services.downloads->start(request)) {
      status_ = "Download already running for " + argument;
      return true;
    }
    status_.clear();
    return true;
  }
  if (verb == "versions.cancel") {
    if (services.downloads != nullptr) {
      services.downloads->cancel(argument);
    }
    return true;
  }
  if (verb == "versions.dismiss") {
    if (services.downloads != nullptr) {
      services.downloads->clear(argument);
    }
    if (services.config->data().profile.value_or("") == argument) {
      status_.clear();
    }
    return true;
  }

  if (verb == "versions.delete") {
    if (!instance_manager.delete_instance(argument)) {
      status_ = "Cannot delete " + argument;
      return true;
    }
    if (services.config->data().profile.value_or("") == argument) {
      services.config->data().profile = "legacy_evolved";
      services.config->save();
    }
    status_ = "Deleted " + argument;
    return true;
  }
  return false;
}
} // namespace emerald::ui