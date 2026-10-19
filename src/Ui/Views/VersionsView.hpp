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
  void set_status(std::string status) { status_ = std::move(status); }
  const std::string &status() const { return status_; }

private:
  std::string status_;
};
} // namespace emerald::ui