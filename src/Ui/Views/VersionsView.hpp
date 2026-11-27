#pragma once
#include "Ui/View.hpp"
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <vector>
namespace emerald::ui {
class VersionsView : public View {
public:
  struct DlcEntry {
    std::string name;
    bool selected = false;
    bool done = false;
    int progress = 0;
  };
  struct DlcDownloadState {
    std::vector<DlcEntry> entries;
    std::string error_name;
    std::string error_reason;
    bool downloading = false;
    std::uint64_t revision = 0;
    std::mutex mutex;
  };
  struct ChannelEntry {
    std::string label;
    std::string value;
    std::string action;
    bool selected = false;
  };
  std::string_view id() const override { return "versions"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  bool on_escape(UiServices &services) override;
  bool consume_folder_pick();
  bool consume_world_pick(UiServices &services);
  bool consume_backup_pick(UiServices &services);
  bool consume_custom_path_pick(UiServices &services);
  bool consume_restore_pick(UiServices &services);
  bool consume_customize_pick();
  bool consume_dlc_download(UiServices &services);
  bool import_modal_open() const {
    return import_modal_ || link_add_modal_ || !delete_pending_id_.empty() ||
           set_uid_modal_ || import_world_modal_ || invalid_directory_modal_ ||
           options_modal_ || dlc_modal_ || channel_modal_ || customize_modal_ ||
           playtime_modal_;
  }
  void request_add_from_link(UiServices &services,
                             const config::CustomEdition &edition);

private:
  void open_menu(std::string id, UiServices &services);
  void close_menu(UiServices &services);
  void close_delete_modal(UiServices &services);
  void open_import_modal(const std::string &id, UiServices &services);
  void close_import_modal(UiServices &services);
  void close_link_add_modal(UiServices &services);
  void open_set_uid_modal(const std::string &id, UiServices &services);
  void close_set_uid_modal(UiServices &services);
  void open_import_world_modal(const std::string &id, UiServices &services);
  void close_import_world_modal(UiServices &services);
  void open_world_file_picker();
  void open_backup_save_dialog(const std::string &id);
  void open_custom_path_picker(const std::string &id);
  void open_restore_dialog();
  void open_customize_file_picker(const std::string &field);
  void open_options_modal(const std::string &id, UiServices &services);
  void close_options_modal(UiServices &services);
  void open_dlc_modal(const std::string &id, UiServices &services);
  void close_dlc_modal(UiServices &services);
  void fetch_dlc_entries(UiServices &services);
  void download_dlc_entries(UiServices &services);
  void open_channel_modal(const std::string &id, UiServices &services);
  void close_channel_modal(UiServices &services);
  void fetch_channels(UiServices &services);
  void apply_channel(const std::string &base_id, const std::string &branch,
                     UiServices &services);
  void open_customize_modal(const std::string &id, UiServices &services);
  void close_customize_modal(UiServices &services);
  void open_playtime_modal(const std::string &id, UiServices &services);
  void close_playtime_modal(UiServices &services);
  void load_playtime(UiServices &services);
  bool add_to_steam(const std::string &id, UiServices &services);
  bool commit_custom_edition(UiServices &services,
                             const config::CustomEdition &edition,
                             bool set_profile);
  bool save_import_modal(UiServices &services);
  void open_folder_picker();
  std::string translate(const UiServices &services, std::string_view key,
                        const char *fallback) const;
  std::string ui_text(const UiServices &services, std::string_view key,
                      const char *fallback) const;
  std::string status_;
  std::string delete_pending_id_;
  std::string open_menu_id_;
  bool import_modal_ = false;
  bool link_add_modal_ = false;
  std::optional<config::CustomEdition> link_add_edition_;
  bool import_editing_ = false;
  std::string import_id_;
  std::string import_name_;
  std::string import_desc_;
  std::string import_url_;
  std::string import_path_;
  std::string import_error_;
  std::string import_return_focus_id_;
  bool set_uid_modal_ = false;
  bool set_uid_manual_ = true;
  std::string set_uid_target_id_;
  std::string set_uid_source_id_;
  std::string set_uid_value_;
  std::string set_uid_error_;
  bool import_world_modal_ = false;
  std::string import_world_target_id_;
  std::string import_world_target_name_;
  std::string import_world_status_;
  std::string import_world_error_;
  std::string backup_pending_id_;
  bool invalid_directory_modal_ = false;
  std::string invalid_directory_message_;
  std::string custom_path_pending_id_;
  bool options_modal_ = false;
  std::string options_target_id_;
  std::string options_target_name_;
  std::string options_error_;
  std::string options_raw_;
  Json options_values_ = Json::object();
  bool dlc_modal_ = false;
  std::string dlc_target_id_;
  std::string dlc_target_name_;
  std::string dlc_repo_url_;
  std::string dlc_branch_ = "main";
  std::string dlc_status_;
  std::string dlc_error_;
  std::vector<DlcEntry> dlc_entries_;
  bool dlc_downloading_ = false;
  std::shared_ptr<DlcDownloadState> dlc_download_state_;
  std::uint64_t dlc_state_revision_ = 0;
  bool channel_modal_ = false;
  std::string channel_target_id_;
  std::string channel_target_name_;
  std::string channel_base_id_;
  std::vector<ChannelEntry> channel_entries_;
  bool customize_modal_ = false;
  std::string customize_target_id_;
  std::string customize_target_name_;
  std::string customize_title_;
  std::string customize_panorama_;
  std::string customize_error_;
  bool playtime_modal_ = false;
  std::string playtime_target_id_;
  std::string playtime_target_name_;
  std::uint64_t playtime_total_ = 0;
  std::uint64_t playtime_week_ = 0;
  std::uint64_t playtime_day_ = 0;
  bool playtime_loading_ = false;
  bool playtime_failed_ = false;
};
} // namespace emerald::ui
