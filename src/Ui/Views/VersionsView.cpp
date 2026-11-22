#include "Ui/Views/VersionsView.hpp"
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigSchema.hpp"
#include "Core/Fs.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Instances/ArgsSchema.hpp"
#include "Instances/Editions.hpp"
#include "Instances/InstanceManager.hpp"
#include "Instances/UpdateChecker.hpp"
#include "Launch/Servers.hpp"
#include "Platform/Platform.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/EditionResolver.hpp"
#include "lazuli/I18n.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <optional>
#include <utility>
#include <vector>
namespace emerald::ui {
namespace {
constexpr const char *kArgsSchemaFile = "Arguments.Schema.json";
constexpr const char *kGearMenuScope = "gear-menu";
constexpr const char *kDeleteModalScope = "delete-modal";
constexpr const char *kImportModalScope = "versions-import-modal";
constexpr const char *kEditionRowPrefix = "edition-";
constexpr const char *kAddInstanceId = "add-instance";
constexpr int kMenuFirstRowTop = 244;
constexpr int kMenuRowStep = 76;
constexpr int kMenuMinTop = 220;
constexpr int kMenuMaxTop = 380;
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

std::optional<std::string> g_import_folder_pick;
void SDLCALL import_folder_callback(void *, const char *const *filelist, int) {
  if (filelist == nullptr || filelist[0] == nullptr) {
    return;
  }
  g_import_folder_pick = std::string(filelist[0]);
}

} // namespace

std::string VersionsView::translate(const UiServices &services,
                                    std::string_view key,
                                    const char *fallback) const {
  if (services.config != nullptr &&
      services.config->data().bedrock_enabled.value() == true) {
    return "Marketplace";
  }
  return services.i18n != nullptr
             ? services.i18n->translate(key, fallback)
             : std::string(fallback);
}

Json VersionsView::data(const UiServices &services) const {
  Json data = Json::object();
  data["titleImage"] = "/images/MenuTitle.png";
  data["username"] = "";
  data["profile"] = "legacy_evolved";
  data["language"] = "en";
  data["status"] = status_;
  data["editions"] = Json::array();
  data["selected"] = "legacy_evolved";
  data["selectedDesc"] = "";
  data["deleteModal"] = !delete_pending_id_.empty();
  data["deleteTitle"] = "";
  data["settingsMenu"] = !open_menu_id_.empty();
  data["menuId"] = open_menu_id_;
  data["menuTitle"] = "";
  data["menuDeleteLabel"] = "";
  data["menuTop"] = kMenuFirstRowTop;
  data["importModal"] = import_modal_;
  data["importTitle"] =
      import_editing_
          ? translate(services, "modals.customTu.editTitle", "Edit Custom TU")
          : translate(services, "modals.customTu.importTitle",
                      "Import Custom TU");
  data["importSubmitLabel"] =
      import_editing_ ? translate(services, "modals.customTu.save", "Save")
                      : translate(services, "modals.customTu.import", "Import");
  data["importName"] = import_name_;
  data["importDesc"] = import_desc_;
  data["importUrl"] = import_url_;
  data["importPath"] = import_path_;
  data["importError"] = import_error_;
  Json items = Json::array();
  Json danger_items = Json::array();
  data["menuItems"] = Json::array();
  data["menuDangerItems"] = Json::array();
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
    if (config.bedrock_enabled.value() == true) data["titleImage"] = "/images/marketplacetitle.png";
  }

  int menu_row_index = -1;
  int visible_index = 0;
  for (const instances::Edition &edition : editions) {
    const bool installed = instance_manager.is_installed(edition.id);
    if (edition.hidden && !installed) {
      continue;
    }
    if (edition.id == open_menu_id_) {
      menu_row_index = visible_index;
    }
    ++visible_index;

    Json entry = Json::object();
    entry["isEdition"] = true;
    entry["id"] = edition.id;
    entry["rowId"] = std::string(kEditionRowPrefix) + edition.id;
    entry["rowAction"] = "versions.select:" + edition.id;
    entry["rowAlign"] = "stretch";
    entry["name"] = !config.bedrock_enabled.value() == true ? edition.name : "Marketplace";
    entry["desc"] = !config.bedrock_enabled.value() == true ? edition.desc : "Marketplace";
    entry["logo"] = edition.logo;
    entry["category"] = edition.category;
    entry["installed"] = installed;
    entry["notInstalled"] = !installed;
    entry["isCustom"] = edition.id.rfind("custom_", 0) == 0;
    entry["selected"] = edition.id == active_profile;
    entry["rowClass"] = edition.id == active_profile ? "selected" : "";
    entry["gearClass"] = edition.id == open_menu_id_ ? "gear-btn-open" : "";
    entry["managed"] = instance_manager.is_managed(edition.id);
    entry["comingSoon"] = edition.coming_soon;
    entry["canDownload"] = !edition.url.empty() && !edition.hidden;
    entry["showInstall"] = !installed;
    const bool has_update =
        services.updates != nullptr && services.updates->has_update(edition.id);
    entry["showGear"] = !has_update;
    entry["updateAvailable"] = has_update;
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

    if (edition.id == active_profile) {
      data["selectedDesc"] = edition.desc;
    }

    data["editions"].push_back(std::move(entry));
  }

  Json add_entry = Json::object();
  add_entry["id"] = kAddInstanceId;
  add_entry["isAdd"] = true;
  add_entry["rowId"] = kAddInstanceId;
  add_entry["rowAction"] = "versions.import.open";
  add_entry["rowAlign"] = "center";
  add_entry["rowJustify"] = "center";
  add_entry["addRowClass"] = "add-instance-btn";
  data["editions"].push_back(std::move(add_entry));
  data["installedCount"] = 0;
  for (const Json &item : data["editions"]) {
    if (item.value("installed", false)) {
      data["installedCount"] = data["installedCount"].get<int>() + 1;
    }
  }

  if (!open_menu_id_.empty()) {
    const instances::Edition *menu_edition = nullptr;
    for (const instances::Edition &ed : editions) {
      if (ed.id == open_menu_id_) {
        menu_edition = &ed;
        break;
      }
    }
    if (menu_edition != nullptr) { // neo: sadly i couldnt do it in xml (because
                                   // im lazy) so i did it in c++ instead
      const bool installed = instance_manager.is_installed(open_menu_id_);
      const bool is_custom = open_menu_id_.rfind("custom_", 0) == 0;
      data["menuTitle"] = menu_edition->name;
      if (menu_row_index >= 0) {
        const int top = kMenuFirstRowTop + menu_row_index * kMenuRowStep;
        data["menuTop"] = std::clamp(top, kMenuMinTop, kMenuMaxTop);
      }
      const auto translate = [&services](const char *key,
                                         const char *fallback) {
        if (services.config->data().bedrock_enabled.value() == true) {return(std::string("Marketplace"));}
        return services.i18n != nullptr ? services.i18n->translate(key)
                                        : std::string(fallback);
      };
      data["menuDeleteLabel"] =
          is_custom ? translate("versions.removeCustom", "Remove Custom")
                    : translate("versions.uninstall", "Uninstall");
      const auto add_item = [&items,
                             &danger_items](const char *icon, std::string label,
                                            std::string action, bool danger) {
        Json item = Json::object();
        item["icon"] = icon;
        item["label"] = std::move(label);
        item["action"] = std::move(action);
        item["itemClass"] = danger ? "gear-menu-item-danger" : "";
        if (danger) {
          danger_items.push_back(std::move(item));
        } else {
          items.push_back(std::move(item));
        }
      };
      const std::string &id = open_menu_id_;
      if (installed) {
        const bool has_update =
            services.updates != nullptr && services.updates->has_update(id);
        add_item("/images/Update_Icon.png",
                 translate(has_update ? "versions.updateAvailable"
                                      : "versions.repair",
                           has_update ? "Update Available" : "Repair"),
                 "versions.repair:" + id, false);
      }
      if (installed) {
        add_item("/images/Folder_Icon.png",
                 translate("versions.openFolder", "Open Folder"),
                 "versions.folder:" + id, false);
      }
      add_item("/images/steam.png",
               translate("versions.addToSteam", "Add to Steam"),
               "versions.steam:" + id, false);
      if (installed) {
        add_item("/images/Download_Icon.png",
                 translate("versions.importWorld", "Import World"),
                 "versions.importWorld:" + id, false);
      }
      if (installed) {
        add_item("/images/Layer_Icon.png",
                 translate("versions.backup", "Backup"),
                 "versions.backup:" + id, false);
      }
      add_item("/images/lock_icon.png", translate("versions.setUid", "Set UID"),
               "versions.setUid:" + id, false);
      if (is_custom) {
        add_item("/images/Change_Skin_Icon.png",
                 translate("versions.editCustom", "Edit Custom"),
                 "versions.editCustom:" + id, false);
      }
      add_item("/images/Trash_Bin_Icon.png",
               data["menuDeleteLabel"].get<std::string>(),
               "versions.delete:" + id, true);
    }
  }

  data["menuItems"] = std::move(items);
  data["menuDangerItems"] = std::move(danger_items);
  if (!delete_pending_id_.empty()) {
    std::string delete_name = delete_pending_id_;
    for (const Json &item : data["editions"]) {
      if (item.value("id", "") == delete_pending_id_) {
        delete_name = item.value("name", delete_pending_id_);
        break;
      }
    }
    std::string delete_title_template =
        services.i18n != nullptr
            ? services.i18n->translate("versions.deleteTitle")
            : std::string("versions.deleteTitle");
    const std::string placeholder = "{{name}}";
    const std::size_t pos = delete_title_template.find(placeholder);
    if (pos != std::string::npos) {
      delete_title_template.replace(pos, placeholder.size(), delete_name);
    }
    data["deleteTitle"] = std::move(delete_title_template);
  }

  if (!open_menu_id_.empty() || !delete_pending_id_.empty() || import_modal_) {
    Json tooltips = Json::array(); // neo: thats how you do it manually :3
    Json select = Json::object();
    select["icon"] = "A";
    select["label"] = services.i18n != nullptr
                          ? services.i18n->translate("common.select")
                          : std::string("Select");
    Json close = Json::object();
    close["icon"] = "B";
    close["label"] = services.i18n != nullptr
                         ? services.i18n->translate("common.close")
                         : std::string("Close");
    tooltips.push_back(std::move(select));
    tooltips.push_back(std::move(close));
    data["tooltips"] = std::move(tooltips);
  }

  return data;
}

void VersionsView::open_menu(std::string id, UiServices &services) {
  open_menu_id_ = std::move(id);
  if (services.focus_scope) {
    services.focus_scope(kGearMenuScope);
  }
}

void VersionsView::close_menu(UiServices &services) {
  if (open_menu_id_.empty()) {
    return;
  }
  const std::string id = open_menu_id_;
  open_menu_id_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::close_delete_modal(UiServices &services) {
  if (delete_pending_id_.empty()) {
    return;
  }
  const std::string id = delete_pending_id_;
  delete_pending_id_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::open_import_modal(const std::string &id,
                                     UiServices &services) {
  if (import_modal_) {
    return;
  }
  close_menu(services);
  delete_pending_id_.clear();
  import_modal_ = true;
  import_editing_ = !id.empty();
  import_error_.clear();
  import_id_.clear();
  import_name_.clear();
  import_desc_.clear();
  import_url_.clear();
  import_path_.clear();
  import_return_focus_id_ =
      id.empty() ? kAddInstanceId : std::string(kEditionRowPrefix) + id;
  if (!id.empty()) {
    import_id_ = id;
    const auto &custom_editions = services.config->data().custom_editions;
    if (custom_editions.has_value()) {
      for (const config::CustomEdition &candidate : *custom_editions) {
        if (candidate.id != id) {
          continue;
        }
        import_name_ = candidate.name;
        import_desc_ = candidate.desc;
        import_url_ = candidate.url;
        import_path_ = candidate.path.value_or("");
        break;
      }
    }
  }
  if (services.focus_scope) {
    services.focus_scope(kImportModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-import-name");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::close_import_modal(UiServices &services) {
  if (!import_modal_) {
    return;
  }
  import_modal_ = false;
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (services.focus_element) {
    services.focus_element(import_return_focus_id_);
  }
}

bool VersionsView::save_import_modal(UiServices &services) {
  if (import_name_.empty()) {
    import_error_ = translate(services, "modals.customTu.nameRequired",
                              "Name is required");
    return true;
  }
  if (import_url_.empty() && import_path_.empty()) {
    import_error_ = translate(services, "modals.customTu.urlOrPathRequired",
                              "URL or Path is required");
    return true;
  }
  if (!import_url_.empty() && import_url_.rfind("http", 0) != 0) {
    import_error_ =
        translate(services, "modals.customTu.invalidUrl", "Invalid URL");
    return true;
  }
  std::error_code path_error;
  if (!import_path_.empty() &&
      !std::filesystem::is_directory(import_path_, path_error)) {
    import_error_ = translate(services, "versions.invalidDirectory",
                              "Invalid Directory");
    return true;
  }
  import_error_.clear();
  const std::string id =
      import_editing_ && !import_id_.empty()
          ? import_id_
          : "custom_" + std::to_string(SDL_GetTicks());
  config::CustomEdition edition;
  edition.id = id;
  edition.name = import_name_;
  edition.desc = import_desc_.empty()
                     ? translate(services, "modals.customTu.defaultDesc",
                                 "Custom imported TU")
                     : import_desc_;
  edition.url = import_url_;
  if (!import_path_.empty()) {
    edition.path = import_path_;
  }
  auto &custom_editions = services.config->data().custom_editions;
  if (!custom_editions.has_value()) {
    custom_editions = std::vector<config::CustomEdition>{};
  }
  if (import_editing_) {
    bool replaced = false;
    for (config::CustomEdition &existing : *custom_editions) {
      if (existing.id != id) {
        continue;
      }
      existing = std::move(edition);
      replaced = true;
      break;
    }
    if (!replaced) {
      custom_editions->push_back(std::move(edition));
    }
  } else {
    custom_editions->push_back(std::move(edition));
    services.config->data().profile = id;
    skins::SkinUiState::instance().sync_needed = true;
  }
  services.config->save();
  close_import_modal(services);
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  return true;
}

void VersionsView::open_folder_picker() {
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_ShowOpenFolderDialog(import_folder_callback, nullptr, window, nullptr,
                           false);
  SDL_free(windows);
}

bool VersionsView::consume_folder_pick() {
  if (!g_import_folder_pick.has_value()) {
    return false;
  }
  import_path_ = *g_import_folder_pick;
  g_import_folder_pick.reset();
  import_error_.clear();
  return true;
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
    skins::SkinUiState::instance().sync_needed = true;
    close_menu(services);
    return true;
  }
  if (verb == "versions.refresh") {
    status_.clear();
    return true;
  }

  if (action == "versions.menu.close") {
    close_menu(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }

  if (verb == "versions.settings") {
    if (open_menu_id_ == argument) {
      close_menu(services);
    } else {
      open_menu(argument, services);
      if (services.audio != nullptr) {
        services.audio->play_press();
      }
    }
    return true;
  }

  const instances::InstanceManager instance_manager(services.config->data());
  if (verb == "versions.install" || verb == "versions.repair") {
    close_menu(services);
    if (services.updates != nullptr) {
      services.updates->clear_update(argument);
    }
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
    request.url = edition->url;
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

  if (verb == "versions.folder") {
    close_menu(services);
    platform::open_directory(instance_manager.working_dir(argument));
    return true;
  }

  if (verb == "versions.steam" || verb == "versions.importWorld" ||
      verb == "versions.backup" || verb == "versions.setUid") {
    close_menu(services);
    return true;
  }

  if (verb == "versions.editCustom" || verb == "versions.import.open") {
    open_import_modal(argument, services);
    return true;
  }

  if (action == "versions.import.name") {
    if (services.read_text_input) {
      import_name_ = services.read_text_input();
    }
    if (services.focus_element) {
      services.focus_element("versions-import-desc");
    }
    return true;
  }

  if (action == "versions.import.desc") {
    if (services.read_text_input) {
      import_desc_ = services.read_text_input();
    }
    if (services.focus_element) {
      services.focus_element("versions-import-url");
    }
    return true;
  }

  if (action == "versions.import.url") {
    if (services.read_text_input) {
      import_url_ = services.read_text_input();
    }
    if (services.focus_element) {
      services.focus_element("versions-import-submit");
    }
    return true;
  }

  if (action == "versions.import.browse") {
    open_folder_picker();
    return true;
  }

  if (action == "versions.import.block") {
    return true;
  }

  if (action == "versions.import.cancel") {
    close_import_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }

  if (action == "versions.import.submit") {
    return save_import_modal(services);
  }

  if (verb == "versions.delete") {
    close_menu(services);
    delete_pending_id_ = argument;
    if (services.focus_scope) {
      services.focus_scope(kDeleteModalScope);
    }
    return true;
  }

  if (action == "versions.delete.cancel") {
    close_delete_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }

  if (action == "versions.delete.confirm") {
    const std::string pending = delete_pending_id_;
    close_delete_modal(services);
    if (pending.empty()) {
      return true;
    }
    if (!instance_manager.delete_instance(pending)) {
      status_ = "Cannot delete " + pending;
      return true;
    }
    if (services.config->data().profile.value_or("") == pending) {
      services.config->data().profile = "legacy_evolved";
      services.config->save();
      skins::SkinUiState::instance().sync_needed = true;
    }
    status_ = "Deleted " + pending;
    return true;
  }

  return false;
}

bool VersionsView::on_escape(UiServices &services) {
  if (import_modal_) {
    close_import_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (!open_menu_id_.empty()) {
    close_menu(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (!delete_pending_id_.empty()) {
    close_delete_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (services.audio != nullptr) {
    services.audio->play_back();
  }
  if (services.navigate) {
    services.navigate("home");
  }
  return true;
}
} // namespace emerald::ui
