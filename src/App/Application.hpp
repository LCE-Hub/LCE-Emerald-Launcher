#pragma once
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigStore.hpp"
#include "Instances/DownloadManager.hpp"
#include "Instances/UpdateChecker.hpp"
#include "Launch/LaunchService.hpp"
#include "Net/LceOnline.hpp"
#include "Playtime/PlaytimeStore.hpp"
#include "State/StateStore.hpp"
#include "Integrations/DiscordRpc.hpp"
#include "Ui/View.hpp"
#include "lazuli/UiSystem.hpp"
#include <SDL3/SDL_events.h>
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>
struct SDL_Window;
struct SDL_Renderer;
struct SDL_Gamepad;
namespace emerald::app {
class Application {
public:
  Application();
  ~Application();
  Application(const Application &) = delete;
  Application &operator=(const Application &) = delete;
  Application(Application &&) = delete;
  Application &operator=(Application &&) = delete;
  int run();

private:
  bool initialize();
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
  launch::LaunchService launch_;
  lce::LceOnlineService lce_online_;
  std::unique_ptr<lazuli::UiSystem> ui_;
  ui::UiServices ui_services_;
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
  std::filesystem::path public_root_;
  std::map<std::string, instances::DownloadState> download_states_;
};
} // namespace emerald::app