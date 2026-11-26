#pragma once
#include "Ui/View.hpp"
#include <optional>
#include <string>
namespace emerald::ui {
class VersionsView : public View {
public:
  std::string_view id() const override { return "versions"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  bool on_escape(UiServices &services) override;
  bool consume_folder_pick();
  bool import_modal_open() const { return import_modal_; }
  void request_add_from_link(UiServices &services,
                             const config::CustomEdition &edition);

private:
  void open_menu(std::string id, UiServices &services);
  void close_menu(UiServices &services);
  void close_delete_modal(UiServices &services);
  void open_import_modal(const std::string &id, UiServices &services);
  void close_import_modal(UiServices &services);
  void close_link_add_modal(UiServices &services);
  bool commit_custom_edition(UiServices &services,
                             const config::CustomEdition &edition,
                             bool set_profile);
  bool save_import_modal(UiServices &services);
  void open_folder_picker();
  std::string translate(const UiServices &services, std::string_view key,
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
};
} // namespace emerald::ui
