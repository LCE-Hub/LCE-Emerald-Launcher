#pragma once
#include "Instances/Editions.hpp"
#include "Ui/View.hpp"
#include <string_view>
namespace emerald::ui {
class OverlayView : public View {
public:
  std::string_view id() const override { return "overlay"; }
  Json data(const UiServices &services) const override;

private:
  static bool is_remote_source(const std::string &source);
  static std::string
  icon_for_edition(const std::optional<instances::Edition> &edition);
};
} // namespace emerald::ui
