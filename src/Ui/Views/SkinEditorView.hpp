#pragma once
#include "Ui/View.hpp"
namespace emerald::ui {
class SkinEditorView : public View {
public:
  std::string_view id() const override { return "skineditor"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  bool on_escape(UiServices &services) override;

private:
  void leave(UiServices &services) const;
};
} // namespace emerald::ui
