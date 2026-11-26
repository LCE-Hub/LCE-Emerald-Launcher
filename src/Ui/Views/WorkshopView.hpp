#pragma once
#include "Instances/WorkshopStore.hpp"
#include "Ui/View.hpp"
#include <optional>
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
  void set_target(const std::string &id, const std::string &type);

private:
  mutable std::string tab_;
  std::string search_;
  mutable std::string selected_id_;
  mutable std::string install_target_;
  mutable std::string uninstall_target_;
  mutable std::optional<std::string> pending_target_;
  mutable std::string pending_target_type_;
  mutable std::string server_category_;
  mutable bool deps_open_ = false;
  mutable bool install_open_ = false;
  mutable bool uninstall_open_ = false;
  std::vector<instances::WorkshopInstallStep> pending_queue_;
};
} // namespace emerald::ui
