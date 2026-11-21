#pragma once
#include "Instances/WorkshopStore.hpp"
#include "Ui/View.hpp"
#include <string>
#include <vector>
namespace emerald::ui {
class WorkshopView : public View {
public:
  WorkshopView();
  std::string_view id() const override { return "workshop"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  bool on_escape(UiServices &services) override;
  void on_enter() override;

private:
  std::string tab_;
  std::string search_;
  std::string selected_id_;
  mutable std::string install_target_;
  mutable std::string uninstall_target_;
  std::string server_category_;
  bool deps_open_ = false;
  bool install_open_ = false;
  bool uninstall_open_ = false;
  std::vector<instances::WorkshopInstallStep> pending_queue_;
};
} // namespace emerald::ui
