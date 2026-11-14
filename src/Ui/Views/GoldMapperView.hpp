#pragma once
#include "Ui/View.hpp"
#include <string>
namespace emerald::ui {
class GoldMapperView : public View {
public:
  std::string_view id() const override { return "goldmapper"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  void on_enter() override;
  bool on_escape(UiServices &services) override;

private:
  void open_modal(const std::string &id, UiServices &services);
  void close_modal(UiServices &services, bool play_sound = true);
  bool pick_target(const std::string &source, const std::string &target,
                   UiServices &services);
  std::string editing_;
  std::string key_buffer_;
  std::string key_error_;
};
} // namespace emerald::ui
