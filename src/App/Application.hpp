#pragma once
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigStore.hpp"
#include "Instances/DownloadManager.hpp"
#include "Instances/UpdateChecker.hpp"
#include "Instances/WorkshopStore.hpp"
#include "Launch/LaunchService.hpp"
#include "Net/LceOnline.hpp"
#include "Playtime/PlaytimeStore.hpp"
#include "State/StateStore.hpp"
#include "Integrations/DiscordRpc.hpp"
#include "Ui/ClickVfx.hpp"
#include "Ui/View.hpp"
#include "lazuli/UiSystem.hpp"
#include <SDL3/SDL_events.h>
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <string_view>
#include <vector>
struct SDL_Window;
struct SDL_Renderer;
struct SDL_Gamepad;
namespace emerald::ui {
class VersionsView;
class WorkshopView;
}
namespace emerald::app {
class Application {
public:
  Application();
  ~Application();
  Application(const Application &) = delete;
  Application &operator=(const Application &) = delete;
  Application(Application &&) = delete;
  Application &operator=(Application &&) = delete;
  int run(const std::vector<std::string_view>& args);

private:
  bool initialize(const std::vector<std::string_view>& args);
  void handle_hyperlink(std::string_view url);
  void shutdown();
  void handle_event(const SDL_Event &event);
  void render();
  void open_gamepad(uint32_t instance_id);
  void close_gamepad(uint32_t instance_id);
  SDL_Window *window_ = nullptr;
  SDL_Renderer *renderer_ = nullptr;
  bool running_ = false;
  config::ConfigStore config_;
  playtime::PlaytimeStore playtime_;
  state::StateStore state_;
  instances::DownloadManager downloads_;
  instances::UpdateChecker update_checker_;
  instances::WorkshopStore workshop_;
  launch::LaunchService launch_;
  lce::LceOnlineService lce_online_;
  std::unique_ptr<lazuli::UiSystem> ui_;
  ui::VersionsView *versions_view_ = nullptr;
  ui::WorkshopView *workshop_view_ = nullptr;
  ui::UiServices ui_services_;
  ui::ClickVfx click_vfx_;
  std::vector<SDL_Gamepad *> gamepads_;
  integrations::DiscordRpc discord_;
  audio::AudioEngine audio_;
  bool window_visible_ = true;
  uint64_t download_revision_ = 0;
  uint64_t launch_revision_ = 0;
  uint64_t macos_revision_ = 0;
  uint64_t runner_download_revision_ = 0;
  uint64_t lce_revision_ = 0;
  uint64_t update_revision_ = 0;
  uint64_t workshop_revision_ = 0;
  std::filesystem::path public_root_;
  std::map<std::string, instances::DownloadState> download_states_;
};
} // namespace emerald::app
