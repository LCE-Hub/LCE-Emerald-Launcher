#pragma once
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigStore.hpp"
#include "Instances/DownloadManager.hpp"
#include "Launch/LaunchService.hpp"
#include "Net/LceOnline.hpp"
#include "Playtime/PlaytimeStore.hpp"
#include "Ui/Compat.hpp"
#include <filesystem>
#include <functional>
#include <string>
#include <string_view>
namespace emerald::instances {
class UpdateChecker;
}
namespace emerald::ui {
struct UiServices {
  config::ConfigStore *config = nullptr;
  playtime::PlaytimeStore *playtime = nullptr;
  instances::DownloadManager *downloads = nullptr;
  launch::LaunchService *launch = nullptr;
  audio::AudioEngine *audio = nullptr;
  NotificationHub *notifications = nullptr;
  lce::LceOnlineService *lce_online = nullptr;
  instances::UpdateChecker *updates = nullptr;
  const I18n *i18n = nullptr;
  std::function<std::string()> tooltip_set;
  std::filesystem::path dlc_source;
  std::filesystem::path skin_pck;
  std::filesystem::path public_root;
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

class View : public lazuli::Screen {
public:
  std::string_view id() const override = 0;
  Json data(const void *services) const final {
    return data(*static_cast<const UiServices *>(services));
  }
  bool action(std::string_view name, void *services) final {
    return action(name, *static_cast<UiServices *>(services));
  }
  bool on_escape(void *services) final {
    return on_escape(*static_cast<UiServices *>(services));
  }
  virtual Json data(const UiServices &services) const = 0;
  virtual bool action(std::string_view name, UiServices &services) {
    (void)name;
    (void)services;
    return false;
  }
  virtual bool on_escape(UiServices &services) {
    (void)services;
    return false;
  }
};
} // namespace emerald::ui
