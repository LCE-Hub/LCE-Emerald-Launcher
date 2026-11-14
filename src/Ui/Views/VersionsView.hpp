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

private:
  void open_menu(std::string id, UiServices &services);
  void close_menu(UiServices &services);
  void close_delete_modal(UiServices &services);
  std::string status_;
  std::string delete_pending_id_;
  std::string open_menu_id_;
};
} // namespace emerald::ui
