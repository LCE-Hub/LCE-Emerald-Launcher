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
#include "Integrations/SteamShortcuts.hpp"
#include "Launch/Servers.hpp"
#include "Net/HttpClient.hpp"
#include "Platform/Platform.hpp"
#include "Skins/SkinAssets.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/EditionResolver.hpp"
#include "Instances/Backup.hpp"
#include "Instances/Dlc.hpp"
#include "lazuli/I18n.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <optional>
#include <thread>
#include <utility>
#include <vector>
namespace emerald::ui {
namespace {
constexpr const char *kArgsSchemaFile = "Arguments.Schema.json";
constexpr const char *kGearMenuScope = "gear-menu";
constexpr const char *kDeleteModalScope = "versions-delete-modal";
constexpr const char *kImportModalScope = "versions-import-modal";
constexpr const char *kLinkAddModalScope = "versions-link-add-modal";
constexpr const char *kSetUidModalScope = "versions-set-uid-modal";
constexpr const char *kImportWorldModalScope = "versions-import-world-modal";
constexpr const char *kOptionsModalScope = "versions-options-modal";
constexpr const char *kDlcModalScope = "versions-dlc-modal";
constexpr const char *kChannelModalScope = "versions-channel-modal";
constexpr const char *kCustomizeModalScope = "versions-customize-modal";
constexpr const char *kPlaytimeModalScope = "versions-playtime-modal";
constexpr const char *kInvalidDirectoryModalScope =
    "versions-invalid-directory-modal";
constexpr const char *kDefaultUid = "0xFF02F0C87E8AC1F2";
constexpr const char *kEditionRowPrefix = "edition-";
constexpr const char *kAddInstanceId = "add-instance";
constexpr const char *kOfficialDlcRepo =
    "main:https://git.neolegacy.dev/neoStudiosLCE/DLCs";
constexpr int kMenuFirstRowTop = 190;
constexpr int kMenuRowStep = 52;
constexpr int kMenuMinTop = 140;
constexpr int kMenuMaxTop = 250;
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

std::optional<std::string> g_world_file_pick;
void SDLCALL world_file_callback(void *, const char *const *filelist, int) {
  g_world_file_pick = filelist != nullptr && filelist[0] != nullptr
                          ? std::string(filelist[0])
                          : std::string();
}

std::optional<std::string> g_backup_file_pick;
void SDLCALL backup_save_callback(void *, const char *const *filelist, int) {
  g_backup_file_pick = filelist != nullptr && filelist[0] != nullptr
                           ? std::string(filelist[0])
                           : std::string();
}

std::optional<std::string> g_custom_path_pick;
void SDLCALL custom_path_callback(void *, const char *const *filelist, int) {
  g_custom_path_pick = filelist != nullptr && filelist[0] != nullptr
                           ? std::string(filelist[0])
                           : std::string();
}

std::optional<std::string> g_restore_file_pick;
void SDLCALL restore_file_callback(void *, const char *const *filelist, int) {
  g_restore_file_pick = filelist != nullptr && filelist[0] != nullptr
                            ? std::string(filelist[0])
                            : std::string();
}

std::optional<std::string> g_customize_file_pick;
std::string g_customize_field;
void SDLCALL customize_file_callback(void *, const char *const *filelist, int) {
  g_customize_file_pick = filelist != nullptr && filelist[0] != nullptr
                              ? std::string(filelist[0])
                              : std::string();
}

std::string read_uid(const instances::InstanceManager &instances,
                     const std::string &id) {
  const std::optional<std::string> contents =
      core::read_file(instances.working_dir(id) / "uid.dat");
  if (contents.has_value() && !contents->empty()) {
    return *contents;
  }
  return kDefaultUid;
}

std::string sanitize_world_name(const std::filesystem::path &source) {
  std::string name = source.filename().string();
  for (char &character : name) {
    const bool allowed =
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9') || character == '_' ||
        character == '-' || character == ' ';
    if (!allowed) {
      character = '_';
    }
  }
  if (name.size() > 64) {
    name.resize(64);
  }
  return name.empty() ? std::string("ImportedWorld") : name;
}

std::string interpolation(std::string text, const std::string &placeholder,
                          const std::string &value) {
  const std::size_t position = text.find(placeholder);
  if (position != std::string::npos) {
    text.replace(position, placeholder.size(), value);
  }
  return text;
}

std::string official_dlc_repo(const std::string &id) {
  return id == "legacy_evolved" ? kOfficialDlcRepo : std::string();
}

std::string base_edition_id(const std::string &id) {
  for (const instances::Edition &edition : instances::base_editions()) {
    if (id == edition.id) {
      return edition.id;
    }
  }
  for (const instances::Edition &edition : instances::base_editions()) {
    const std::string prefix = edition.id + "_";
    if (id.rfind(prefix, 0) == 0) {
      return edition.id;
    }
  }
  return {};
}

std::string format_time(std::uint64_t seconds) {
  const std::uint64_t hours = seconds / 3600;
  const std::uint64_t minutes = (seconds % 3600) / 60;
  const std::uint64_t remainder = seconds % 60;
  if (hours > 0) {
    return std::to_string(hours) + "h " + std::to_string(minutes) + "m " +
           std::to_string(remainder) + "s";
  }
  if (minutes > 0) {
    return std::to_string(minutes) + "m " + std::to_string(remainder) + "s";
  }
  return std::to_string(remainder) + "s";
}

std::string lowercase(std::string value) {
  for (char &character : value) {
    character = static_cast<char>(
        std::tolower(static_cast<unsigned char>(character)));
  }
  return value;
}

std::string file_data_url(const std::filesystem::path &path) {
  const std::optional<std::string> bytes = core::read_file(path);
  if (!bytes.has_value()) {
    return {};
  }
  std::string extension = lowercase(path.extension().string());
  if (!extension.empty() && extension.front() == '.') {
    extension.erase(extension.begin());
  }
  std::string mime = "image/png";
  if (extension == "jpg" || extension == "jpeg") {
    mime = "image/jpeg";
  } else if (extension == "bmp") {
    mime = "image/bmp";
  } else if (extension == "gif") {
    mime = "image/gif";
  } else if (extension == "webp") {
    mime = "image/webp";
  }
  const std::optional<std::string> encoded = skins::base64_encode(
      reinterpret_cast<const std::uint8_t *>(bytes->data()), bytes->size());
  if (!encoded.has_value()) {
    return {};
  }
  return "data:" + mime + ";base64," + *encoded;
}

bool directory_empty(const std::filesystem::path &path) {
  std::error_code error;
  for (std::filesystem::directory_iterator iterator(path, error),
       end;
       iterator != end; iterator.increment(error)) {
    return false;
  }
  return !error;
}

Json option_value_from_string(const instances::SchemaOption &option,
                              const std::string &text) {
  switch (option.type) {
  case instances::OptionType::Boolean:
    return Json(lowercase(text) == "true" || text == "1");
  case instances::OptionType::Int:
  case instances::OptionType::Number: {
    try {
      double number = std::stod(text);
      if (option.min.has_value()) {
        number = std::max(number, *option.min);
      }
      if (option.max.has_value()) {
        number = std::min(number, *option.max);
      }
      return Json(number);
    } catch (...) {
      return Json(0);
    }
  }
  case instances::OptionType::String:
  case instances::OptionType::Choice:
  default:
    return Json(text);
  }
}

std::vector<std::uint8_t> load_artwork(
    const std::filesystem::path &public_root, const std::string &source) {
  if (source.empty()) {
    return {};
  }
  const std::filesystem::path path =
      source.front() == '/' ? public_root / source.substr(1)
                            : std::filesystem::path(source);
  const std::optional<std::string> bytes = core::read_file(path);
  if (!bytes.has_value()) {
    return {};
  }
  return std::vector<std::uint8_t>(bytes->begin(), bytes->end());
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

std::string VersionsView::ui_text(const UiServices &services,
                                  std::string_view key,
                                  const char *fallback) const {
  return services.i18n != nullptr ? services.i18n->translate(key, fallback)
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
  data["linkAddModal"] = link_add_modal_;
  data["linkAddTitle"] =
      translate(services, "versions.addLinkTitle", "Add custom version?");
  data["linkAddConfirmLabel"] =
      translate(services, "versions.addLinkConfirm", "Add");
  const std::string link_name =
      link_add_edition_.has_value() ? link_add_edition_->name : std::string();
  const std::string link_id =
      link_add_edition_.has_value() ? link_add_edition_->id : std::string();
  const std::string link_url =
      link_add_edition_.has_value() ? link_add_edition_->url : std::string();
  data["linkAddNameLabel"] =
      translate(services, "modals.customTu.tuName", "TU Name") + ": " +
      link_name;
  data["linkAddIdLabel"] = "ID: " + link_id;
  data["setUidModal"] = set_uid_modal_;
  data["setUidManual"] = set_uid_manual_;
  data["setUidCopy"] = !set_uid_manual_;
  data["setUidValue"] = set_uid_value_;
  data["setUidError"] = set_uid_error_;
  data["setUidTargetName"] = "";
  data["setUidSourceName"] = "";
  data["setUidNoInstances"] = true;
  data["setUidInstances"] = Json::array();
  data["importWorldModal"] = import_world_modal_;
  data["importWorldName"] = import_world_target_name_;
  data["importWorldTitle"] = ui_text(services, "modals.importWorld.title",
                                     "Import World");
  data["importWorldInto"] = "";
  data["importWorldStatus"] = import_world_status_;
  data["importWorldError"] = import_world_error_;
  data["importWorldIdle"] = import_world_status_.empty();
  data["isDesktop"] = platform::current_os() != platform::Os::Android;
  data["invalidDirectoryModal"] = invalid_directory_modal_;
  data["invalidDirectoryTitle"] =
      ui_text(services, "versions.invalidDirectory", "Invalid Directory");
  data["invalidDirectoryMessage"] = invalid_directory_message_;
  data["invalidDirectoryOk"] = ui_text(services, "common.ok", "OK");
  data["optionsModal"] = options_modal_;
  data["optionsTitle"] =
      ui_text(services, "modals.options.title", "Options");
  data["optionsName"] = options_target_name_;
  data["optionsError"] = options_error_;
  data["optionsRows"] = Json::array();
  data["optionsHasRows"] = false;
  data["optionsGeneral"] =
      ui_text(services, "modals.options.general", "General");
  data["optionsReset"] = ui_text(services, "modals.options.reset", "Reset");
  data["optionsCancel"] =
      ui_text(services, "modals.options.cancel", "Cancel");
  data["optionsSave"] = ui_text(services, "modals.options.save", "Save");
  if (options_modal_ && options_error_.empty()) {
    const std::optional<instances::ArgsSchema> schema =
        instances::parse_schema(options_raw_);
    if (schema.has_value()) {
      const Json values = instances::merge_values(*schema, options_values_);
      const auto effects = instances::compute_effects(*schema, values);
      Json rows = Json::array();
      for (const instances::SchemaOption &option : schema->options) {
        const auto effect = effects.find(option.id);
        if (effect != effects.end() && effect->second.hidden) {
          continue;
        }
        const Json current = values.contains(option.id)
                                 ? values[option.id]
                                 : instances::option_default(option);
        Json row = Json::object();
        row["id"] = option.id;
        row["title"] = option.title.empty() ? option.id : option.title;
        row["description"] = option.description.value_or("");
        row["group"] = option.group.value_or("");
        row["isBoolean"] = option.type == instances::OptionType::Boolean;
        row["isText"] = option.type == instances::OptionType::Int ||
                        option.type == instances::OptionType::Number ||
                        option.type == instances::OptionType::String;
        row["isChoice"] = option.type == instances::OptionType::Choice;
        row["disabled"] = effect != effects.end() && effect->second.disabled;
        row["value"] = instances::display_value(option, current);
        row["checked"] = current.is_boolean() && current.get<bool>() ? "X" : " ";
        row["toggleAction"] = "versions.options.toggle:" + option.id;
        row["valueAction"] = "versions.options.value:" + option.id;
        row["inputId"] = "versions-option-" + option.id;
        Json choices = Json::array();
        for (const instances::SchemaChoice &choice : option.choices) {
          Json entry = Json::object();
          entry["label"] =
              choice.label.empty() ? choice.value : choice.label;
          entry["action"] =
              "versions.options.choice:" + option.id + "|" + choice.value;
          entry["selected"] = current.is_string() &&
                              current.get<std::string>() == choice.value;
          choices.push_back(std::move(entry));
        }
        row["choices"] = std::move(choices);
        rows.push_back(std::move(row));
      }
      data["optionsHasRows"] = !rows.empty();
      data["optionsRows"] = std::move(rows);
    }
  }
  data["dlcModal"] = dlc_modal_;
  data["dlcTitle"] =
      ui_text(services, "modals.downloadDlc.title", "Download DLC");
  data["dlcName"] = dlc_target_name_;
  data["dlcLoading"] = dlc_status_;
  data["dlcError"] = dlc_error_;
  data["dlcAll"] = ui_text(services, "modals.downloadDlc.all", "All");
  data["dlcNone"] = ui_text(services, "modals.downloadDlc.none", "None");
  data["dlcDone"] = ui_text(services, "modals.downloadDlc.done", "Done");
  data["dlcClose"] = ui_text(services, "modals.downloadDlc.close", "Close");
  data["dlcNoneFound"] = ui_text(services, "modals.downloadDlc.noneFound",
                                 "No DLC folders found in the repository.");
  std::size_t dlc_selected = 0;
  for (const DlcEntry &entry : dlc_entries_) {
    if (entry.selected) {
      ++dlc_selected;
    }
  }
  data["dlcCanAllNone"] = !dlc_downloading_ && !dlc_entries_.empty();
  data["dlcCanDownload"] = !dlc_downloading_ && dlc_selected > 0;
  data["dlcCanClose"] = !dlc_downloading_;
  data["dlcAvailableText"] = interpolation(
      ui_text(services, "modals.downloadDlc.available", "{{count}} available"),
      "{{count}}", std::to_string(dlc_entries_.size()));
  data["dlcDownloadText"] = interpolation(
      ui_text(services, "modals.downloadDlc.download", "Download ({{count}})"),
      "{{count}}", std::to_string(dlc_selected));
  data["dlcDownloadedText"] = interpolation(
      interpolation(ui_text(services, "modals.downloadDlc.downloaded",
                            "Downloaded {{downloaded}}/{{selected}}"),
                    "{{downloaded}}", std::to_string(dlc_selected)),
      "{{selected}}", std::to_string(dlc_selected));
  data["dlcDownloading"] = dlc_downloading_;
  data["dlcShowNoneFound"] = !dlc_downloading_ && dlc_status_.empty() &&
                             dlc_error_.empty() && dlc_entries_.empty();
  Json dlc_rows = Json::array();
  for (const DlcEntry &entry : dlc_entries_) {
    Json row = Json::object();
    row["name"] = entry.name;
    row["selected"] = entry.selected;
    row["done"] = entry.done;
    row["progressText"] = std::to_string(entry.progress) + "%";
    row["mark"] = entry.selected ? "X" : " ";
    row["action"] = "versions.dlc.toggle:" + entry.name;
    row["itemClass"] = entry.selected ? "dlc-entry-selected" : "";
    dlc_rows.push_back(std::move(row));
  }
  data["dlcEntries"] = std::move(dlc_rows);
  data["channelModal"] = channel_modal_;
  data["channelTitle"] = ui_text(services, "versions.channel", "Channel");
  data["channelName"] = channel_target_name_;
  data["channelClose"] = ui_text(services, "common.close", "Close");
  Json channel_rows = Json::array();
  for (const ChannelEntry &entry : channel_entries_) {
    Json row = Json::object();
    row["label"] = entry.label;
    row["value"] = entry.value;
    row["action"] = entry.action;
    row["itemClass"] = entry.selected ? "channel-entry-selected" : "";
    channel_rows.push_back(std::move(row));
  }
  data["channelEntries"] = std::move(channel_rows);
  data["customizeModal"] = customize_modal_;
  data["customizeTitle"] =
      ui_text(services, "modals.customize.title", "Customize");
  data["customizeName"] = customize_target_name_;
  data["customizeTitleImageLabel"] =
      ui_text(services, "modals.customize.titleImage", "Title Image");
  data["customizePanoramaLabel"] =
      ui_text(services, "modals.customize.panoramaBackground",
              "Panorama Background");
  data["customizeChange"] =
      ui_text(services, "modals.customize.changeImage", "Change Image");
  data["customizePick"] =
      ui_text(services, "modals.customize.pickImage", "Pick Image");
  data["customizeReset"] =
      ui_text(services, "modals.customize.reset", "Reset");
  data["customizeCancel"] =
      ui_text(services, "modals.customize.cancel", "Cancel");
  data["customizeSave"] =
      ui_text(services, "modals.customize.save", "Save");
  data["customizeHasTitle"] = !customize_title_.empty();
  data["customizeHasPanorama"] = !customize_panorama_.empty();
  data["customizeTitleButton"] =
      customize_title_.empty() ? data["customizePick"].get<std::string>()
                               : data["customizeChange"].get<std::string>();
  data["customizePanoramaButton"] =
      customize_panorama_.empty() ? data["customizePick"].get<std::string>()
                                  : data["customizeChange"].get<std::string>();
  data["customizeTitleValue"] = customize_title_;
  data["customizePanoramaValue"] = customize_panorama_;
  data["customizeError"] = customize_error_;
  data["playtimeModal"] = playtime_modal_;
  data["playtimeTitle"] =
      ui_text(services, "modals.playtime.title", "Playtime");
  data["playtimeName"] = playtime_target_name_;
  data["playtimeLoading"] =
      ui_text(services, "modals.playtime.loading", "Loading...");
  data["playtimeTotalLabel"] =
      ui_text(services, "modals.playtime.total", "Total");
  data["playtimeWeekLabel"] =
      ui_text(services, "modals.playtime.thisWeek", "This Week");
  data["playtimeTodayLabel"] =
      ui_text(services, "modals.playtime.today", "Today");
  data["playtimeFailed"] = ui_text(services, "modals.playtime.failedToLoad",
                                   "Failed to load playtime data.");
  data["playtimeClose"] =
      ui_text(services, "modals.playtime.close", "Close");
  data["playtimeLoadingVisible"] = playtime_loading_;
  data["playtimeFailedVisible"] = playtime_failed_;
  data["playtimeLoaded"] = !playtime_loading_ && !playtime_failed_;
  data["playtimeTotal"] = format_time(playtime_total_);
  data["playtimeWeek"] = format_time(playtime_week_);
  data["playtimeToday"] = format_time(playtime_day_);
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

  Json uid_instances = Json::array();
  for (const instances::Edition &edition : editions) {
    if (edition.id == set_uid_target_id_ ||
        !instance_manager.is_installed(edition.id)) {
      continue;
    }
    Json candidate = Json::object();
    candidate["id"] = edition.id;
    candidate["label"] = edition.name;
    candidate["action"] = "versions.setUid.pick:" + edition.id;
    uid_instances.push_back(std::move(candidate));
  }
  if (!uid_instances.empty()) {
    data["setUidNoInstances"] = false;
  }
  if (!set_uid_source_id_.empty()) {
    for (const instances::Edition &edition : editions) {
      if (edition.id == set_uid_source_id_) {
        data["setUidSourceName"] = edition.name;
        break;
      }
    }
  }
  if (!set_uid_target_id_.empty()) {
    for (const instances::Edition &edition : editions) {
      if (edition.id == set_uid_target_id_) {
        data["setUidTargetName"] = edition.name;
        break;
      }
    }
  }
  data["setUidInstances"] = std::move(uid_instances);
  if (!import_world_status_.empty()) {
    data["importWorldTitle"] = ui_text(
        services, "modals.importWorld.importingTitle", "Importing World");
  }
  const std::string import_into =
      ui_text(services, "modals.importWorld.importInto", "Import into:");
  data["importWorldInto"] = import_into + " " + import_world_target_name_;
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
      if (menu_edition != nullptr) {
        data["setUidTargetName"] = menu_edition->name;
      }
      const bool is_desktop =
          platform::current_os() != platform::Os::Android;
      if (installed) {
        const bool has_update =
            services.updates != nullptr && services.updates->has_update(id);
        add_item("/images/Update_Icon.png",
                 translate(has_update ? "versions.updateAvailable"
                                      : "versions.repair",
                           has_update ? "Update Available" : "Repair"),
                 "versions.repair:" + id, false);
      }
      if (!installed && is_desktop && !menu_edition->url.empty()) {
        add_item("/images/Download_Icon.png",
                 ui_text(services, "versions.downloadToCustomPath",
                         "Download to custom path"),
                 "versions.customPath:" + id, false);
      }
      if (installed && !official_dlc_repo(id).empty()) {
        add_item("/images/Download_Icon.png",
                 ui_text(services, "versions.downloadDlc", "Download DLC"),
                 "versions.dlc:" + id, false);
      }
      if (installed && has_args_schema(instance_manager, id)) {
        add_item("/images/Change_Skin_Icon.png",
                 ui_text(services, "versions.options", "Options"),
                 "versions.options:" + id, false);
      }
      if (installed) {
        std::string playtime_label =
            ui_text(services, "versions.viewPlaytime", "View playtime");
        if (services.playtime != nullptr) {
          const playtime::PlaytimeResponse response =
              services.playtime->get_playtime(id);
          if (response.total_seconds > 0) {
            playtime_label = format_time(response.total_seconds);
          }
        }
        add_item("/images/Clock_Icon.png", playtime_label,
                 "versions.playtime:" + id, false);
      }
      if (!base_edition_id(id).empty()) {
        std::string branch = ui_text(services, "versions.latest", "Latest");
        if (config.channel_selections.has_value()) {
          const auto found = config.channel_selections->find(base_edition_id(id));
          if (found != config.channel_selections->end() &&
              !found->second.empty() && found->second != "Stable") {
            branch = found->second;
          }
        }
        add_item("/images/Layer_Icon.png",
                 ui_text(services, "versions.channel", "Channel") + ": " +
                     branch,
                 "versions.channel:" + id, false);
      }
      if (installed) {
        add_item("/images/Folder_Icon.png",
                 translate("versions.openFolder", "Open Folder"),
                 "versions.folder:" + id, false);
      }
      if (is_desktop) {
        add_item("/images/steam.png",
                 translate("versions.addToSteam", "Add to Steam"),
                  "versions.steam:" + id, false);
      }
      if (installed && is_desktop) {
        add_item("/images/Download_Icon.png",
                 translate("versions.importWorld", "Import World"),
                 "versions.importWorld:" + id, false);
      }
      if (installed && is_desktop) {
        add_item("/images/Layer_Icon.png",
                 translate("versions.backup", "Backup"),
                 "versions.backup:" + id, false);
      }
      if (is_desktop) {
        add_item("/images/Update_Icon.png",
                 ui_text(services, "versions.restore", "Restore"),
                 "versions.restore:" + id, false);
      }
      if (is_desktop) {
        add_item("/images/Change_Skin_Icon.png",
                 ui_text(services, "versions.customize", "Customize"),
                 "versions.customize:" + id, false);
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

  if (!open_menu_id_.empty() || !delete_pending_id_.empty() ||
      import_modal_ || invalid_directory_modal_ || options_modal_ ||
      dlc_modal_ || channel_modal_ || customize_modal_ || playtime_modal_) {
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

void VersionsView::close_link_add_modal(UiServices &services) {
  if (!link_add_modal_) {
    return;
  }
  link_add_modal_ = false;
  link_add_edition_.reset();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (services.focus_element) {
    services.focus_element(kAddInstanceId);
  }
}

bool VersionsView::commit_custom_edition(UiServices &services,
                                         const config::CustomEdition &edition,
                                         bool set_profile) {
  if (services.config == nullptr || edition.id.empty() || edition.name.empty()) {
    return false;
  }
  auto &custom_editions = services.config->data().custom_editions;
  if (!custom_editions.has_value()) {
    custom_editions = std::vector<config::CustomEdition>{};
  }
  bool replaced = false;
  for (config::CustomEdition &existing : *custom_editions) {
    if (existing.id != edition.id) {
      continue;
    }
    existing = edition;
    replaced = true;
    break;
  }
  if (!replaced) {
    custom_editions->push_back(edition);
  }
  if (set_profile) {
    services.config->data().profile = edition.id;
    skins::SkinUiState::instance().sync_needed = true;
  }
  services.config->save();
  return true;
}

void VersionsView::request_add_from_link(UiServices &services,
                                         const config::CustomEdition &edition) {
  close_menu(services);
  close_delete_modal(services);
  close_import_modal(services);
  link_add_edition_ = edition;
  link_add_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kLinkAddModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-link-add-confirm");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
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
  if (!commit_custom_edition(services, edition, !import_editing_)) {
    return true;
  }
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

void VersionsView::open_set_uid_modal(const std::string &id,
                                      UiServices &services) {
  if (set_uid_modal_) {
    return;
  }
  close_menu(services);
  close_delete_modal(services);
  const instances::InstanceManager instance_manager(services.config->data());
  set_uid_modal_ = true;
  set_uid_target_id_ = id;
  set_uid_source_id_.clear();
  set_uid_manual_ = true;
  set_uid_value_ = read_uid(instance_manager, id);
  set_uid_error_.clear();
  if (services.focus_scope) {
    services.focus_scope(kSetUidModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-set-uid-value");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::close_set_uid_modal(UiServices &services) {
  if (!set_uid_modal_) {
    return;
  }
  const std::string id = set_uid_target_id_;
  set_uid_modal_ = false;
  set_uid_target_id_.clear();
  set_uid_source_id_.clear();
  set_uid_error_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::open_import_world_modal(const std::string &id,
                                           UiServices &services) {
  if (import_world_modal_) {
    return;
  }
  close_menu(services);
  close_delete_modal(services);
  import_world_modal_ = true;
  import_world_target_id_ = id;
  import_world_target_name_ = id;
  import_world_status_.clear();
  import_world_error_.clear();
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      import_world_target_name_ = edition.name;
      break;
    }
  }
  if (services.focus_scope) {
    services.focus_scope(kImportWorldModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-import-world-ms");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::close_import_world_modal(UiServices &services) {
  if (!import_world_modal_) {
    return;
  }
  const std::string id = import_world_target_id_;
  import_world_modal_ = false;
  import_world_target_id_.clear();
  import_world_target_name_.clear();
  import_world_status_.clear();
  import_world_error_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::open_world_file_picker() {
  SDL_DialogFileFilter filters[] = {{"Minecraft save file", "ms"}};
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_ShowOpenFileDialog(world_file_callback, nullptr, window, filters, 1,
                         nullptr, false);
  SDL_free(windows);
}

void VersionsView::open_backup_save_dialog(const std::string &id) {
  backup_pending_id_ = id;
  SDL_DialogFileFilter filters[] = {{"Tar Gzip Archive", "tar.gz"}};
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  const std::string default_name = id + "_backup.tar.gz";
  SDL_ShowSaveFileDialog(backup_save_callback, nullptr, window, filters, 1,
                         default_name.c_str());
  SDL_free(windows);
}

bool VersionsView::add_to_steam(const std::string &id, UiServices &services) {
  close_menu(services);
  const config::AppConfig &config = services.config->data();
  const instances::Edition *edition = nullptr;
  for (const instances::Edition &candidate :
       resolve_config_editions(config)) {
    if (candidate.id == id) {
      edition = &candidate;
      break;
    }
  }
  if (edition == nullptr) {
    if (services.notify) {
      services.notify(ui_text(services, "versions.addToSteam", "Add to Steam"),
                      "Version not found: " + id, ToastVariant::Error, "");
    }
    return true;
  }
  const std::string panorama_profiles[] = {"legacy_evolved", "vanilla_tu19",
                                           "360revived", "vanilla_tu24"};
  std::string panorama_id = "vanilla_tu19";
  for (const std::string &profile : panorama_profiles) {
    if (profile == id) {
      panorama_id = id;
      break;
    }
  }
  const std::string daytime = config.daytime.value_or(true) ? "Day" : "Night";
  const std::string panorama_path = "/panorama/" + panorama_id +
                                    "_Panorama_Background_" + daytime + ".png";
  integrations::SteamArtwork artwork;
  artwork.panorama = load_artwork(services.public_root, panorama_path);
  artwork.title = load_artwork(services.public_root, edition->title_image);
  std::string error;
  if (!integrations::add_instance_shortcut(id, edition->name, artwork, error)) {
    if (services.notify) {
      services.notify(ui_text(services, "versions.addToSteam", "Add to Steam"),
                      error.empty() ? "Failed to add to Steam" : error,
                      ToastVariant::Error, "");
    }
    return true;
  }
  if (services.notify) {
    const std::string message = interpolation(
        ui_text(services, "versions.steamSuccess",
                "Added {{name}} to Steam! (Restart Steam to see it)"),
        "{{name}}", edition->name);
    services.notify(ui_text(services, "versions.addToSteam", "Add to Steam"),
                    message, ToastVariant::Steam, "");
  }
  return true;
}

bool VersionsView::consume_world_pick(UiServices &services) {
  if (!g_world_file_pick.has_value()) {
    return false;
  }
  const std::string picked = std::move(*g_world_file_pick);
  g_world_file_pick.reset();
  if (picked.empty() || import_world_target_id_.empty()) {
    import_world_status_.clear();
    return true;
  }
  const instances::InstanceManager instance_manager(services.config->data());
  const std::filesystem::path destination =
      instance_manager.working_dir(import_world_target_id_) / "Windows64" /
      "GameHDD" / sanitize_world_name(picked) / "saveData.ms";
  import_world_status_ = ui_text(services, "modals.importWorld.copyingLceSave",
                                 "Copying LCE save...");
  import_world_error_.clear();
  if (!core::copy_file(picked, destination)) {
    import_world_status_.clear();
    import_world_error_ =
        ui_text(services, "modals.importWorld.failed", "Failed to import save");
    return true;
  }
  import_world_status_ = interpolation(
      ui_text(services, "modals.importWorld.worldImported",
              "World imported into \"{{name}}\"!"),
      "{{name}}", import_world_target_name_);
  return true;
}

bool VersionsView::consume_backup_pick(UiServices &services) {
  if (!g_backup_file_pick.has_value()) {
    return false;
  }
  const std::string picked = std::move(*g_backup_file_pick);
  g_backup_file_pick.reset();
  const std::string id = backup_pending_id_;
  backup_pending_id_.clear();
  if (picked.empty() || id.empty()) {
    return true;
  }
  const instances::InstanceManager instance_manager(services.config->data());
  std::string error;
  const bool ok = instances::create_instance_backup(
      instance_manager.working_dir(id), picked, error);
  if (services.notify) {
    services.notify(ui_text(services, "versions.backup", "Backup"),
                    ok ? "Backup created: " +
                             std::filesystem::path(picked).filename().string()
                       : (error.empty() ? "Failed to create backup" : error),
                    ok ? ToastVariant::Steam : ToastVariant::Error, "");
  }
  return true;
}

void VersionsView::open_custom_path_picker(const std::string &id) {
  custom_path_pending_id_ = id;
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_ShowOpenFolderDialog(custom_path_callback, nullptr, window, nullptr,
                           false);
  SDL_free(windows);
}

bool VersionsView::consume_custom_path_pick(UiServices &services) {
  if (!g_custom_path_pick.has_value()) {
    return false;
  }
  const std::string picked = std::move(*g_custom_path_pick);
  g_custom_path_pick.reset();
  const std::string id = custom_path_pending_id_;
  custom_path_pending_id_.clear();
  if (picked.empty() || id.empty()) {
    return true;
  }
  std::error_code error;
  if (!std::filesystem::is_directory(picked, error) ||
      !directory_empty(picked)) {
    invalid_directory_message_ =
        ui_text(services, "versions.selectEmptyDirectory",
                "Please select an empty directory for installation.");
    invalid_directory_modal_ = true;
    if (services.focus_scope) {
      services.focus_scope(kInvalidDirectoryModalScope);
    }
    if (services.focus_element) {
      services.focus_element("versions-invalid-directory-ok");
    }
    return true;
  }
  if (!services.config->data().custom_paths.has_value()) {
    services.config->data().custom_paths =
        std::unordered_map<std::string, std::string>{};
  }
  (*services.config->data().custom_paths)[id] = picked;
  services.config->save();
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  action("versions.install:" + id, services);
  return true;
}

void VersionsView::open_restore_dialog() {
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_DialogFileFilter filters[] = {{"Tar Gzip Archive", "tar.gz"},
                                    {"Zip Archive", "zip"}};
  SDL_ShowOpenFileDialog(restore_file_callback, nullptr, window, filters, 2,
                         nullptr, false);
  SDL_free(windows);
}

bool VersionsView::consume_restore_pick(UiServices &services) {
  if (!g_restore_file_pick.has_value()) {
    return false;
  }
  const std::string picked = std::move(*g_restore_file_pick);
  g_restore_file_pick.reset();
  if (picked.empty()) {
    return true;
  }
  std::string error;
  const std::optional<std::string> restored = instances::restore_instance_backup(
      picked, core::instances_dir(), error);
  const bool ok = restored.has_value();
  if (services.notify) {
    services.notify(ui_text(services, "versions.restore", "Restore"),
                    ok ? ui_text(services, "common.ok", "OK")
                       : (error.empty()
                              ? std::string("Failed to restore backup")
                              : error),
                    ok ? ToastVariant::Steam : ToastVariant::Error, "");
  }
  return true;
}

void VersionsView::open_customize_file_picker(const std::string &field) {
  g_customize_field = field;
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_DialogFileFilter filters[] = {{"Image", "png;jpg;jpeg;bmp"}};
  SDL_ShowOpenFileDialog(customize_file_callback, nullptr, window, filters, 1,
                         nullptr, false);
  SDL_free(windows);
}

bool VersionsView::consume_customize_pick() {
  if (!g_customize_file_pick.has_value()) {
    return false;
  }
  const std::string picked = std::move(*g_customize_file_pick);
  g_customize_file_pick.reset();
  const std::string field = g_customize_field;
  g_customize_field.clear();
  if (picked.empty()) {
    return true;
  }
  if (field == "panorama") {
    customize_panorama_ = picked;
  } else {
    customize_title_ = picked;
  }
  customize_error_.clear();
  return true;
}

void VersionsView::open_options_modal(const std::string &id,
                                      UiServices &services) {
  close_menu(services);
  close_delete_modal(services);
  options_target_id_ = id;
  options_target_name_ = id;
  options_error_.clear();
  options_raw_.clear();
  options_values_ = Json::object();
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      options_target_name_ = edition.name;
      break;
    }
  }
  const std::optional<std::string> raw = core::read_file(
      instances::InstanceManager(services.config->data()).working_dir(id) /
      kArgsSchemaFile);
  if (!raw.has_value()) {
    options_error_ =
        ui_text(services, "modals.options.noSchema",
                "This instance does not provide a launch options schema.");
  } else {
    const std::optional<instances::ArgsSchema> schema =
        instances::parse_schema(*raw);
    if (!schema.has_value()) {
      options_error_ =
          ui_text(services, "modals.options.invalidSchema",
                  "The launch options schema is invalid or unsupported.");
    } else {
      options_raw_ = *raw;
      Json saved = Json::object();
      if (services.config->data().instance_launch_args.has_value()) {
        const auto found = services.config->data().instance_launch_args->find(id);
        if (found != services.config->data().instance_launch_args->end()) {
          saved = found->second.values;
        }
      }
      options_values_ = instances::merge_values(*schema, saved);
    }
  }
  options_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kOptionsModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-options-save");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::close_options_modal(UiServices &services) {
  if (!options_modal_) {
    return;
  }
  const std::string id = options_target_id_;
  options_modal_ = false;
  options_target_id_.clear();
  options_error_.clear();
  options_raw_.clear();
  options_values_ = Json::object();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::open_dlc_modal(const std::string &id,
                                  UiServices &services) {
  close_menu(services);
  close_delete_modal(services);
  dlc_target_id_ = id;
  dlc_target_name_ = id;
  dlc_entries_.clear();
  dlc_status_.clear();
  dlc_error_.clear();
  dlc_downloading_ = false;
  const std::string official = official_dlc_repo(id);
  const std::size_t colon = official.find(':');
  dlc_branch_ = colon == std::string::npos ? std::string("main")
                                           : official.substr(0, colon);
  dlc_repo_url_ = colon == std::string::npos ? official
                                             : official.substr(colon + 1);
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      dlc_target_name_ = edition.name;
      break;
    }
  }
  dlc_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kDlcModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-dlc-download");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  fetch_dlc_entries(services);
}

void VersionsView::close_dlc_modal(UiServices &services) {
  if (!dlc_modal_) {
    return;
  }
  const std::string id = dlc_target_id_;
  dlc_modal_ = false;
  dlc_target_id_.clear();
  dlc_entries_.clear();
  dlc_status_.clear();
  dlc_error_.clear();
  dlc_downloading_ = false;
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::fetch_dlc_entries(UiServices &services) {
  if (dlc_repo_url_.empty()) {
    return;
  }
  dlc_status_ = ui_text(services, "modals.downloadDlc.loading",
                        "Loading available DLCs...");
  dlc_error_.clear();
  const instances::InstanceManager instance_manager(services.config->data());
  net::HttpClient client(services.config->data().http_proxy);
  instances::DlcService service(instance_manager, client);
  std::vector<instances::GitEntry> entries;
  std::string error;
  if (!service.list_directory(dlc_repo_url_, dlc_branch_, "", entries, error)) {
    dlc_status_.clear();
    dlc_error_ = error.empty() ? std::string("Failed to list DLCs") : error;
    return;
  }
  std::vector<std::string> installed;
  const std::filesystem::path dlc_dir =
      instance_manager.working_dir(dlc_target_id_) / "Windows64Media" / "DLC";
  std::error_code path_error;
  for (std::filesystem::directory_iterator iterator(dlc_dir, path_error), end;
       !path_error && iterator != end; iterator.increment(path_error)) {
    if (iterator->is_directory()) {
      installed.push_back(iterator->path().filename().string());
    }
  }
  std::vector<std::string> names;
  for (const instances::GitEntry &entry : entries) {
    if (!entry.is_dir ||
        std::find(installed.begin(), installed.end(), entry.name) !=
            installed.end()) {
      continue;
    }
    names.push_back(entry.name);
  }
  std::sort(names.begin(), names.end());
  dlc_entries_.clear();
  for (const std::string &name : names) {
    dlc_entries_.push_back(DlcEntry{name, false, false, 0});
  }
  dlc_status_.clear();
}

void VersionsView::download_dlc_entries(UiServices &services) {
  if (dlc_downloading_ || dlc_target_id_.empty()) {
    return;
  }
  std::vector<std::size_t> selected;
  for (std::size_t index = 0; index < dlc_entries_.size(); ++index) {
    if (dlc_entries_[index].selected) {
      selected.push_back(index);
    }
  }
  if (selected.empty()) {
    return;
  }
  dlc_downloading_ = true;
  dlc_error_.clear();
  const std::shared_ptr<DlcDownloadState> state =
      std::make_shared<DlcDownloadState>();
  {
    std::lock_guard<std::mutex> lock(state->mutex);
    state->entries = dlc_entries_;
    state->downloading = true;
  }
  dlc_download_state_ = state;
  dlc_state_revision_ = 0;
  const config::AppConfig config_copy = services.config->data();
  const auto proxy = config_copy.http_proxy;
  const std::string target_id = dlc_target_id_;
  const std::string repo_url = dlc_repo_url_;
  const std::string branch = dlc_branch_;
  std::thread worker([state, selected, config_copy, proxy, target_id, repo_url,
                      branch]() {
    const instances::InstanceManager instance_manager(config_copy);
    net::HttpClient client(proxy);
    instances::DlcService service(instance_manager, client);
    net::CancelToken token;
    for (const std::size_t current : selected) {
      std::string folder;
      {
        std::lock_guard<std::mutex> lock(state->mutex);
        if (current >= state->entries.size()) {
          continue;
        }
        folder = state->entries[current].name;
        state->entries[current].progress = 0;
        ++state->revision;
      }
      std::string error;
      const bool ok = service.download_folder(
          target_id, repo_url, branch, folder, token,
          [state, current](double percent) {
            std::lock_guard<std::mutex> lock(state->mutex);
            if (current < state->entries.size()) {
              state->entries[current].progress = static_cast<int>(percent);
              ++state->revision;
            }
          },
          error);
      {
        std::lock_guard<std::mutex> lock(state->mutex);
        if (current < state->entries.size()) {
          state->entries[current].done = ok;
          state->entries[current].progress =
              ok ? 100 : state->entries[current].progress;
        }
        if (!ok) {
          state->error_name = folder;
          state->error_reason = error.empty() ? std::string("failed") : error;
        }
        ++state->revision;
      }
      if (!ok) {
        break;
      }
    }
    {
      std::lock_guard<std::mutex> lock(state->mutex);
      state->downloading = false;
      ++state->revision;
    }
  });
  worker.detach();
}

bool VersionsView::consume_dlc_download(UiServices &services) {
  const std::shared_ptr<DlcDownloadState> state = dlc_download_state_;
  if (!state) {
    return false;
  }
  std::vector<DlcEntry> entries;
  std::string error_name;
  std::string error_reason;
  bool downloading = false;
  std::uint64_t revision = 0;
  {
    std::lock_guard<std::mutex> lock(state->mutex);
    if (state->revision <= dlc_state_revision_) {
      return false;
    }
    entries = state->entries;
    error_name = state->error_name;
    error_reason = state->error_reason;
    downloading = state->downloading;
    revision = state->revision;
  }
  dlc_entries_ = std::move(entries);
  dlc_downloading_ = downloading;
  dlc_state_revision_ = revision;
  if (!error_name.empty()) {
    const std::string template_text =
        ui_text(services, "modals.downloadDlc.failedToDownload",
                "Failed to download {{name}}: {{reason}}");
    dlc_error_ = interpolation(
        interpolation(template_text, "{{name}}", error_name), "{{reason}}",
        error_reason.empty() ? std::string("failed") : error_reason);
  }
  if (!downloading && services.audio != nullptr) {
    services.audio->play_press();
  }
  return true;
}

void VersionsView::open_channel_modal(const std::string &id,
                                      UiServices &services) {
  close_menu(services);
  close_delete_modal(services);
  channel_target_id_ = id;
  channel_target_name_ = id;
  channel_base_id_ = base_edition_id(id);
  channel_entries_.clear();
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      channel_target_name_ = edition.name;
      break;
    }
  }
  channel_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kChannelModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-channel-close");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  fetch_channels(services);
}

void VersionsView::close_channel_modal(UiServices &services) {
  if (!channel_modal_) {
    return;
  }
  const std::string id = channel_target_id_;
  channel_modal_ = false;
  channel_target_id_.clear();
  channel_entries_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::fetch_channels(UiServices &services) {
  if (channel_base_id_.empty()) {
    return;
  }
  const instances::Edition *base = nullptr;
  for (const instances::Edition &edition : instances::base_editions()) {
    if (edition.id == channel_base_id_) {
      base = &edition;
      break;
    }
  }
  if (base == nullptr) {
    return;
  }
  std::string api_base;
  const std::string &url = base->url;
  const std::size_t scheme = url.find("://");
  const std::size_t marker = url.find("/releases/download/");
  if (scheme == std::string::npos || marker == std::string::npos ||
      marker <= scheme + 3) {
    return;
  }
  const std::size_t host_start = scheme + 3;
  const std::size_t path_start = url.find('/', host_start);
  if (path_start == std::string::npos || path_start >= marker) {
    return;
  }
  const std::string scheme_text = url.substr(0, scheme + 3);
  const std::string host = url.substr(host_start, path_start - host_start);
  const std::string path = url.substr(path_start, marker - path_start);
  std::vector<std::string> segments;
  std::size_t start = 0;
  while (start <= path.size()) {
    const std::size_t slash = path.find('/', start);
    const std::string segment =
        path.substr(start, slash == std::string::npos ? std::string::npos
                                                      : slash - start);
    if (!segment.empty()) {
      segments.push_back(segment);
    }
    if (slash == std::string::npos) {
      break;
    }
    start = slash + 1;
  }
  if (segments.size() < 2) {
    return;
  }
  if (host == "github.com" || host == "raw.githubusercontent.com") {
    api_base = "https://api.github.com/repos/" + segments[0] + "/" +
               segments[1];
  } else {
    api_base = scheme_text + host + "/api/v1/repos/" + segments[0] + "/" +
               segments[1];
  }
  net::HttpClient client(services.config->data().http_proxy);
  const net::HttpResponse response = client.get(api_base + "/releases", false);
  std::vector<std::string> tags;
  if (response.status >= 200 && response.status < 300) {
    try {
      const Json releases = Json::parse(response.body);
      if (releases.is_array()) {
        for (const Json &release : releases) {
          const std::string tag =
              release.value("tag_name", std::string());
          if (tag.empty() ||
              lowercase(tag).find("server") != std::string::npos) {
            continue;
          }
          if (std::find(tags.begin(), tags.end(), tag) == tags.end()) {
            tags.push_back(tag);
          }
        }
      }
    } catch (...) {
    }
  }
  std::sort(tags.begin(), tags.end());
  tags.insert(tags.begin(), "Stable");
  std::string selected = "Stable";
  if (services.config->data().channel_selections.has_value()) {
    const auto found =
        services.config->data().channel_selections->find(channel_base_id_);
    if (found != services.config->data().channel_selections->end() &&
        !found->second.empty()) {
      selected = found->second;
    }
  }
  channel_entries_.clear();
  for (const std::string &tag : tags) {
    ChannelEntry entry;
    entry.value = tag;
    entry.label = tag == "Stable" ? ui_text(services, "versions.latest",
                                            "Latest")
                                  : tag;
    entry.action = "versions.channel.pick:" + channel_base_id_ + "|" + tag;
    entry.selected = tag == selected;
    channel_entries_.push_back(std::move(entry));
  }
}

void VersionsView::apply_channel(const std::string &base_id,
                                 const std::string &branch,
                                 UiServices &services) {
  if (base_id.empty() || branch.empty()) {
    return;
  }
  if (!services.config->data().channel_selections.has_value()) {
    services.config->data().channel_selections =
        std::unordered_map<std::string, std::string>{};
  }
  (*services.config->data().channel_selections)[base_id] = branch;
  const std::string current_id = channel_target_id_;
  const std::string next_id =
      branch == "Stable" ? base_id : base_id + "_" + branch;
  if (services.config->data().profile.value_or("") == current_id) {
    services.config->data().profile = next_id;
    skins::SkinUiState::instance().sync_needed = true;
  }
  services.config->save();
  close_channel_modal(services);
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::open_customize_modal(const std::string &id,
                                        UiServices &services) {
  close_menu(services);
  close_delete_modal(services);
  customize_target_id_ = id;
  customize_target_name_ = id;
  customize_title_.clear();
  customize_panorama_.clear();
  customize_error_.clear();
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      customize_target_name_ = edition.name;
      customize_title_ = edition.title_image;
      customize_panorama_ = edition.panorama;
      break;
    }
  }
  customize_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kCustomizeModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-customize-title-pick");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
}

void VersionsView::close_customize_modal(UiServices &services) {
  if (!customize_modal_) {
    return;
  }
  const std::string id = customize_target_id_;
  customize_modal_ = false;
  customize_target_id_.clear();
  customize_error_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::open_playtime_modal(const std::string &id,
                                       UiServices &services) {
  close_menu(services);
  close_delete_modal(services);
  playtime_target_id_ = id;
  playtime_target_name_ = id;
  for (const instances::Edition &edition :
       resolve_config_editions(services.config->data())) {
    if (edition.id == id) {
      playtime_target_name_ = edition.name;
      break;
    }
  }
  playtime_modal_ = true;
  if (services.focus_scope) {
    services.focus_scope(kPlaytimeModalScope);
  }
  if (services.focus_element) {
    services.focus_element("versions-playtime-close");
  }
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  load_playtime(services);
}

void VersionsView::close_playtime_modal(UiServices &services) {
  if (!playtime_modal_) {
    return;
  }
  const std::string id = playtime_target_id_;
  playtime_modal_ = false;
  playtime_target_id_.clear();
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (!id.empty() && services.focus_element) {
    services.focus_element(std::string(kEditionRowPrefix) + id);
  }
}

void VersionsView::load_playtime(UiServices &services) {
  playtime_loading_ = true;
  playtime_failed_ = false;
  if (services.playtime == nullptr || playtime_target_id_.empty()) {
    playtime_loading_ = false;
    playtime_failed_ = true;
    return;
  }
  const playtime::PlaytimeResponse response =
      services.playtime->get_playtime(playtime_target_id_);
  playtime_total_ = response.total_seconds;
  playtime_week_ = response.week_seconds;
  playtime_day_ = response.day_seconds;
  playtime_loading_ = false;
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

  if (verb == "versions.steam") {
    return add_to_steam(argument, services);
  }
  if (verb == "versions.importWorld") {
    open_import_world_modal(argument, services);
    return true;
  }
  if (verb == "versions.backup") {
    close_menu(services);
    open_backup_save_dialog(argument);
    return true;
  }
  if (verb == "versions.customPath") {
    close_menu(services);
    open_custom_path_picker(argument);
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (verb == "versions.restore") {
    close_menu(services);
    open_restore_dialog();
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (verb == "versions.dlc") {
    open_dlc_modal(argument, services);
    return true;
  }
  if (verb == "versions.options") {
    open_options_modal(argument, services);
    return true;
  }
  if (verb == "versions.channel") {
    open_channel_modal(argument, services);
    return true;
  }
  if (verb == "versions.customize") {
    open_customize_modal(argument, services);
    return true;
  }
  if (verb == "versions.playtime") {
    open_playtime_modal(argument, services);
    return true;
  }
  if (action == "versions.invalidDirectory.ok") {
    invalid_directory_modal_ = false;
    invalid_directory_message_.clear();
    if (services.focus_scope) {
      services.focus_scope("");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (action == "versions.channel.close") {
    close_channel_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (verb == "versions.channel.pick") {
    if (!channel_modal_) {
      return true;
    }
    const std::size_t separator = argument.find('|');
    if (separator == std::string::npos) {
      return true;
    }
    apply_channel(argument.substr(0, separator),
                  argument.substr(separator + 1), services);
    return true;
  }
  if (verb == "versions.dlc.toggle") {
    if (dlc_downloading_) {
      return true;
    }
    for (DlcEntry &entry : dlc_entries_) {
      if (entry.name == argument) {
        entry.selected = !entry.selected;
        break;
      }
    }
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.dlc.all" || action == "versions.dlc.none") {
    if (dlc_downloading_) {
      return true;
    }
    const bool selected = action == "versions.dlc.all";
    for (DlcEntry &entry : dlc_entries_) {
      entry.selected = selected;
    }
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.dlc.download") {
    download_dlc_entries(services);
    return true;
  }
  if (action == "versions.dlc.close") {
    if (dlc_downloading_) {
      return true;
    }
    close_dlc_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (options_modal_ &&
      (verb == "versions.options.toggle" || verb == "versions.options.value" ||
       verb == "versions.options.choice" || action == "versions.options.reset" ||
       action == "versions.options.save")) {
    const std::optional<instances::ArgsSchema> schema =
        instances::parse_schema(options_raw_);
    if (!schema.has_value()) {
      return true;
    }
    if (action == "versions.options.reset") {
      for (const instances::SchemaOption &option : schema->options) {
        options_values_[option.id] = instances::option_default(option);
      }
      if (services.audio != nullptr) {
        services.audio->play_press();
      }
      return true;
    }
    if (action == "versions.options.save") {
      const auto effects = instances::compute_effects(*schema, options_values_);
      const std::vector<std::string> args =
          instances::build_args(*schema, options_values_, effects);
      if (!services.config->data().instance_launch_args.has_value()) {
        services.config->data().instance_launch_args =
            std::unordered_map<std::string, config::InstanceLaunchArgs>{};
      }
      (*services.config->data()
            .instance_launch_args)[options_target_id_] =
          config::InstanceLaunchArgs{options_values_, args};
      services.config->save();
      close_options_modal(services);
      if (services.audio != nullptr) {
        services.audio->play_press();
      }
      return true;
    }
    const instances::SchemaOption *target = nullptr;
    for (const instances::SchemaOption &option : schema->options) {
      if (option.id == argument) {
        target = &option;
        break;
      }
    }
    if (target == nullptr) {
      return true;
    }
    const auto effects = instances::compute_effects(*schema, options_values_);
    const auto effect = effects.find(target->id);
    if (effect != effects.end() && effect->second.disabled) {
      return true;
    }
    if (verb == "versions.options.toggle") {
      if (target->type == instances::OptionType::Boolean) {
        const Json current = options_values_.value(
            target->id, instances::option_default(*target));
        options_values_[target->id] =
            Json(!(current.is_boolean() && current.get<bool>()));
      }
    } else if (verb == "versions.options.choice") {
      const std::size_t separator = argument.find('|');
      if (separator == std::string::npos) {
        return true;
      }
      options_values_[target->id] = Json(argument.substr(separator + 1));
    } else if (services.text_edited != nullptr && services.text_edited() &&
               services.read_text_input != nullptr) {
      options_values_[target->id] =
          option_value_from_string(*target, services.read_text_input());
    }
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.options.cancel") {
    close_options_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (verb == "versions.customize.pick") {
    open_customize_file_picker(argument);
    return true;
  }
  if (action == "versions.customize.reset.title") {
    customize_title_.clear();
    customize_error_.clear();
    return true;
  }
  if (action == "versions.customize.reset.panorama") {
    customize_panorama_.clear();
    customize_error_.clear();
    return true;
  }
  if (action == "versions.customize.save") {
    const auto resolve = [](const std::string &value) -> std::optional<std::string> {
      if (value.empty()) {
        return std::nullopt;
      }
      if (value.rfind("/", 0) == 0 && value.rfind("/images/", 0) != 0 &&
          value.rfind("/panorama/", 0) != 0) {
        const std::string resolved = file_data_url(value);
        return resolved.empty() ? std::optional<std::string>(value)
                                : std::optional<std::string>(resolved);
      }
      return std::optional<std::string>(value);
    };
    config::CustomizationEntry entry;
    entry.title_image = resolve(customize_title_);
    entry.panorama = resolve(customize_panorama_);
    if (!services.config->data().customizations.has_value()) {
      services.config->data().customizations =
          std::unordered_map<std::string, config::CustomizationEntry>{};
    }
    (*services.config->data().customizations)[customize_target_id_] = entry;
    services.config->save();
    skins::SkinUiState::instance().sync_needed = true;
    close_customize_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.customize.cancel") {
    close_customize_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (action == "versions.playtime.close") {
    close_playtime_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (verb == "versions.setUid") {
    open_set_uid_modal(argument, services);
    return true;
  }
  if (verb == "versions.setUid.mode") {
    if (!set_uid_modal_) {
      return true;
    }
    set_uid_manual_ = argument != "copy";
    set_uid_error_.clear();
    if (services.focus_element) {
      services.focus_element(set_uid_manual_ ? "versions-set-uid-value"
                                             : "versions-set-uid-copy");
    }
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (verb == "versions.setUid.pick") {
    if (!set_uid_modal_) {
      return true;
    }
    set_uid_source_id_ = argument;
    set_uid_error_.clear();
    if (services.focus_element) {
      services.focus_element("versions-set-uid-save");
    }
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.setUid.value") {
    if (services.text_edited && services.text_edited() &&
        services.read_text_input) {
      set_uid_value_ = services.read_text_input();
    }
    return true;
  }
  if (action == "versions.setUid.save") {
    if (services.text_edited && services.text_edited() &&
        services.read_text_input) {
      set_uid_value_ = services.read_text_input();
    }
    if (!set_uid_manual_) {
      if (set_uid_source_id_.empty()) {
        set_uid_error_ = ui_text(services, "modals.setUid.selectToCopy",
                                 "Select an instance to copy from.");
        return true;
      }
      const std::optional<std::string> source =
          core::read_file(instance_manager.working_dir(set_uid_source_id_) /
                          "uid.dat");
      if (!source.has_value() || source->empty()) {
        set_uid_error_ = ui_text(services, "modals.setUid.sourceNoUid",
                                 "Source instance has no uid.dat or it could not be read.");
        return true;
      }
      set_uid_value_ = *source;
    }
    if (set_uid_value_.empty()) {
      set_uid_error_ =
          ui_text(services, "modals.setUid.uidEmpty", "UID cannot be empty.");
      return true;
    }
    if (!core::write_file(instance_manager.working_dir(set_uid_target_id_) /
                              "uid.dat",
                          set_uid_value_)) {
      set_uid_error_ =
          ui_text(services, "modals.setUid.saveFailed", "Failed to save UID.");
      return true;
    }
    close_set_uid_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
  }
  if (action == "versions.setUid.cancel") {
    close_set_uid_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (action == "versions.importWorld.ms") {
    if (!import_world_modal_ || import_world_target_id_.empty()) {
      return true;
    }
    import_world_error_.clear();
    import_world_status_ = ui_text(services,
                                   "modals.importWorld.selectingMsFile",
                                   "Selecting saveData.ms file...");
    open_world_file_picker();
    return true;
  }
  if (action == "versions.importWorld.xbox") {
    import_world_status_.clear();
    import_world_error_ = ui_text(services, "modals.importWorld.todo",
                                  "TODO"); //neo: mrrrrp
    return true;
  }
  if (action == "versions.importWorld.ps3") {
    import_world_status_.clear();
    import_world_error_ = ui_text(services, "modals.importWorld.todo",
                                  "TODO"); //neo: prrrrr
    return true;
  }
  if (action == "versions.importWorld.javaToLce") {
    import_world_status_.clear();
    import_world_error_ = ui_text(services, "modals.importWorld.todo",
                                  "TODO"); //neo: meow
    return true;
  }
  if (action == "versions.importWorld.cancel") {
    close_import_world_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
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

  if (action == "versions.linkAdd.block") {
    return true;
  }

  if (action == "versions.linkAdd.cancel") {
    close_link_add_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }

  if (action == "versions.linkAdd.confirm") {
    const std::optional<config::CustomEdition> edition = link_add_edition_;
    close_link_add_modal(services);
    if (!edition.has_value()) {
      return true;
    }
    if (!commit_custom_edition(services, *edition, true)) {
      return true;
    }
    status_ = "Added " + edition->name;
    if (services.audio != nullptr) {
      services.audio->play_press();
    }
    return true;
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
  if (playtime_modal_) {
    close_playtime_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (customize_modal_) {
    close_customize_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (channel_modal_) {
    close_channel_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (dlc_modal_) {
    if (dlc_downloading_) {
      return true;
    }
    close_dlc_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (options_modal_) {
    close_options_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (invalid_directory_modal_) {
    invalid_directory_modal_ = false;
    invalid_directory_message_.clear();
    if (services.focus_scope) {
      services.focus_scope("");
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (set_uid_modal_) {
    close_set_uid_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (import_world_modal_) {
    close_import_world_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (link_add_modal_) {
    close_link_add_modal(services);
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
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
