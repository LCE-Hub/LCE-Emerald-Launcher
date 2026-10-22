#pragma once
#include "Config/ConfigStore.hpp"
#include "Core/Json.hpp"
#include "Instances/DownloadManager.hpp"
#include "Launch/LaunchService.hpp"
#include "Playtime/PlaytimeStore.hpp"
#include "Ui/Notifications.hpp"
#include <filesystem>
#include <functional>
#include <string>
#include <string_view>
namespace emerald::ui {
class I18n;
} // namespace emerald::ui
namespace emerald::audio {
class AudioEngine;
} // namespace emerald::audio
namespace emerald::ui {
struct UiServices {
  config::ConfigStore *config = nullptr;
  playtime::PlaytimeStore *playtime = nullptr;
  instances::DownloadManager *downloads = nullptr;
  launch::LaunchService *launch = nullptr;
  audio::AudioEngine *audio = nullptr;
  NotificationHub *notifications = nullptr;
  const I18n *i18n = nullptr;
  std::filesystem::path dlc_source;
  std::filesystem::path skin_pck;
  std::function<void()> quit;
  std::function<void(const std::string &)> navigate;
  std::function<void(const std::string &)> change_language;
  std::function<void()> reset_focus;
  std::function<void(const std::string &)> focus_element;
  std::function<void(const std::string &)> focus_scope;
  std::function<std::string()> read_text_input;
  std::function<bool()> text_edited;
  std::function<void(const std::string &title, const std::string &message,
                     ToastVariant variant, const std::string &on_click)>
      notify;
};

class View {
public:
  virtual ~View() = default;
  virtual std::string_view id() const = 0;
  virtual Json data(const UiServices &services) const = 0;
  virtual bool action(std::string_view name, UiServices &services) {
    (void)name;
    (void)services;
    return false;
  }
  virtual void on_enter() {}
  virtual bool on_escape(UiServices &services) {
    (void)services;
    return false;
  }
};
} // namespace emerald::ui