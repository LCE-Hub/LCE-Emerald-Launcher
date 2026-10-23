#pragma once
#include "Ui/View.hpp"
namespace emerald::ui {
class CreditsView : public View {
public:
  CreditsView();
  std::string_view id() const override { return "credits"; }
  Json data(const UiServices &services) const override;
  void on_enter() override;
  bool on_escape(UiServices &services) override;

private:
  static Json build_credits();
  Json credits_;
};
} // namespace emerald::ui
