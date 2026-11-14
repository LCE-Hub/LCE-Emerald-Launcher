#pragma once
#include "Ui/View.hpp"
namespace emerald::ui {
class SkinsView : public View {
public:
  std::string_view id() const override { return "skins"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  void on_enter() override;
  bool on_escape(UiServices &services) override;

private:
  void select_skin(const std::string &id, UiServices &services);
  void delete_active_skin(UiServices &services);
  void select_cape(const std::string &id, UiServices &services);
  void delete_active_cape(UiServices &services);
  void rename_entry(const std::string &id, UiServices &services);
  void sync_import_focus(UiServices &services, bool was_open) const;
};
} // namespace emerald::ui
