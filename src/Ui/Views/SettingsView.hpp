#pragma once
#include "Ui/View.hpp"
#include <string>
#include <utility>
#include <vector>
namespace emerald::ui {
class SettingsView : public View {
public:
  std::string_view id() const override { return "settings"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  void on_enter() override;
  bool on_escape(UiServices &services) override;

private:
  enum class Menu { Main, Audio, Launcher, Game, Android, Language };
  enum class LauncherSub { None, Display, Network, Integrations, Linux, Data };
  enum class Modal { None, Args, Prefix, EnvVars, ResetA, ResetB };

  std::string translate(const UiServices &services, std::string_view key) const;
  std::string interpolate(
      const UiServices &services, std::string_view key,
      const std::vector<std::pair<std::string, std::string>> &replacements)
      const;
  bool panel_layout() const;
  std::string modal_text(const UiServices &services,
                         const std::string &fallback) const;
  void reset_focus(UiServices &services) const;
  void go_back(UiServices &services);

  Menu menu_ = Menu::Main;
  LauncherSub launcher_sub_ = LauncherSub::None;
  Modal modal_ = Modal::None;
  std::string args_buffer_;
  std::string prefix_buffer_;
  std::string env_buffer_;
};
} // namespace emerald::ui