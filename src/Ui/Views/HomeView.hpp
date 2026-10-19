#pragma once
#include "Ui/View.hpp"
namespace emerald::ui {
class HomeView : public View {
public:
  std::string_view id() const override { return "home"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;

private:
  std::string status_;
};
} // namespace emerald::ui