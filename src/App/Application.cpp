#include "App/Application.hpp"
#include "Core/EmbeddedAssets.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Migration/Migration.hpp"
#include "Ui/EditionResolver.hpp"
#include <SDL3/SDL.h>
#include <cstdlib>
#include <filesystem>
#include <vector>
namespace emerald::app {
namespace {
constexpr int kDefaultWindowWidth = 1280;
constexpr int kDefaultWindowHeight = 720;
constexpr const char *kWindowTitle = "Emerald Legacy Launcher";
constexpr int kLogicalWidth = 1280;
constexpr int kLogicalHeight = 720;
std::filesystem::path env_directory(const char *name) {
  const char *value = std::getenv(name);
  if (value == nullptr || value[0] == '\0') {
    return {};
  }
  const std::filesystem::path path{value};
  return std::filesystem::is_directory(path) ? path : std::filesystem::path{};
}

std::filesystem::path bundle_root() {
  static const std::filesystem::path root = [] {
    const std::filesystem::path bundled =
        core::app_data_dir() / "runtime" /
        std::string(core::embedded::build_id());
    if (core::embedded::is_extracted(bundled)) {
      return bundled;
    }
    if (core::embedded::extract_to(bundled)) {
      return bundled;
    }
    core::warn("assets: failed to extract embedded resources");
    return bundled;
  }();
  return root;
}

std::filesystem::path resolve_root(const char *env, const char *name) {
  if (const std::filesystem::path override = env_directory(env);
      !override.empty()) {
    return override;
  }
  const std::filesystem::path beside = core::executable_dir() / name;
  if (std::filesystem::is_directory(beside)) {
    return beside;
  }
  return bundle_root() / name;
}
} // namespace

Application::Application() = default;
Application::~Application() { shutdown(); }
bool Application::initialize() {
  SDL_SetAppMetadata("Emerald Legacy Launcher", EMERALD_VERSION,
                     "com.emerald.legacy");
  if (!SDL_Init(SDL_INIT_VIDEO)) {
    core::error(std::string{"SDL_Init failed: "} + SDL_GetError());
    return false;
  }
  SDL_InitSubSystem(SDL_INIT_GAMEPAD);
  {
    int count = 0;
    SDL_JoystickID *ids = SDL_GetGamepads(&count);
    for (int i = 0; i < count; ++i) {
      open_gamepad(ids[i]);
    }
    SDL_free(ids);
  }

  window_ = SDL_CreateWindow(kWindowTitle, kDefaultWindowWidth,
                             kDefaultWindowHeight, SDL_WINDOW_RESIZABLE);
  if (window_ == nullptr) {
    core::error(std::string{"SDL_CreateWindow failed: "} + SDL_GetError());
    return false;
  }

  renderer_ = SDL_CreateRenderer(window_, nullptr);
  if (renderer_ == nullptr) {
    core::error(std::string{"SDL_CreateRenderer failed: "} + SDL_GetError());
    return false;
  }

  SDL_SetRenderVSync(renderer_, 1);
  SDL_SetRenderLogicalPresentation(renderer_, kLogicalWidth, kLogicalHeight,
                                   SDL_LOGICAL_PRESENTATION_LETTERBOX);
  SDL_StartTextInput(window_);
  core::info(":: starting up Emerald Launcher");
  core::info(std::string{"  - app data dir: "} + core::app_data_dir().string());
  config_.load();
  core::info(std::string{"  - username: "} + config_.data().username);
  state_.load();
  const migration::MigrationReport report =
      migration::run_migration(config_, state_);
  if (report.ran) {
    core::info(std::string{":: migration: files="} +
               std::to_string(report.storage_files) +
               " entries=" + std::to_string(report.entries) +
               " mapped=" + std::to_string(report.mapped) +
               " completed=" + (report.completed ? "true" : "false"));
  }
  discord_.configure(config_);
  playtime_.load();
  const std::filesystem::path public_root =
      resolve_root("EMERALD_PUBLIC_DIR", "public");
  const std::filesystem::path resource_root =
      resolve_root("EMERALD_RESOURCE_DIR", "resources");
  const std::filesystem::path ui_docs_root =
      resolve_root("EMERALD_UI_DOCS_DIR", "UiDocs");
  core::info(std::string{"  - public dir: "} + public_root.string());
  core::info(std::string{"  - resources dir: "} + resource_root.string());
  core::info(std::string{"  - ui docs dir: "} + ui_docs_root.string());
  audio_.initialize(public_root);
  audio_.set_music_volume(config_.data().music_vol.value_or(50));
  audio_.set_sfx_volume(config_.data().sfx_vol.value_or(100));
  ui_ = std::make_unique<ui::UiSystem>(renderer_, ui_docs_root, public_root,
                                       resource_root / "i18n");
  if (!ui_->initialize()) {
    core::error("ui: failed to initialize");
    return false;
  }

  ui::UiServices services;
  services.config = &config_;
  services.playtime = &playtime_;
  services.downloads = &downloads_;
  services.launch = &launch_;
  services.audio = &audio_;
  services.dlc_source = resource_root / "DLC";
  services.skin_pck = core::app_data_dir() / "Skin.pck";
  launch_.configure(config_, playtime_, resource_root, core::app_data_dir(),
                    services.dlc_source, services.skin_pck);
  download_revision_ = downloads_.revision();
  launch_revision_ = launch_.revision();
  macos_revision_ = launch_.macos_runtime().revision();
  services.quit = [this] { running_ = false; };
  ui_->set_services(services);
  ui_->set_language(config_.data().language.value_or("en"));
  ui_->navigate("home");
  audio_.start_music();
  return true;
}

void Application::shutdown() {
  audio_.shutdown();
  discord_.shutdown();
  ui_.reset();
  downloads_.shutdown();
  if (renderer_ != nullptr) {
    SDL_DestroyRenderer(renderer_);
    renderer_ = nullptr;
  }
  if (window_ != nullptr) {
    SDL_DestroyWindow(window_);
    window_ = nullptr;
  }
  if (SDL_WasInit(0) != 0) {
    SDL_Quit();
  }
}

void Application::handle_event(const SDL_Event &event) {
  switch (event.type) {
  case SDL_EVENT_QUIT:
    running_ = false;
    break;
  case SDL_EVENT_KEY_DOWN:
    if (ui_ != nullptr) {
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_MOUSE_BUTTON_DOWN:
  case SDL_EVENT_MOUSE_MOTION:
  case SDL_EVENT_MOUSE_WHEEL:
  case SDL_EVENT_GAMEPAD_BUTTON_DOWN:
  case SDL_EVENT_TEXT_INPUT:
    if (ui_ != nullptr) {
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_GAMEPAD_ADDED:
    open_gamepad(event.gdevice.which);
    if (ui_ != nullptr) {
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_GAMEPAD_REMOVED:
    close_gamepad(event.gdevice.which);
    if (ui_ != nullptr) {
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_WINDOW_MINIMIZED:
  case SDL_EVENT_WINDOW_HIDDEN:
    window_visible_ = false;
    break;
  case SDL_EVENT_WINDOW_RESTORED:
  case SDL_EVENT_WINDOW_SHOWN:
    window_visible_ = true;
    break;
  default:
    break;
  }
}

void Application::open_gamepad(uint32_t instance_id) {
  SDL_Gamepad *pad = SDL_OpenGamepad(instance_id);
  if (pad != nullptr) {
    gamepads_.push_back(pad);
  }
}

void Application::close_gamepad(uint32_t instance_id) {
  for (auto it = gamepads_.begin(); it != gamepads_.end(); ++it) {
    if (SDL_GetGamepadID(*it) == instance_id) {
      SDL_CloseGamepad(*it);
      gamepads_.erase(it);
      break;
    }
  }
}

void Application::render() {
  if (ui_ == nullptr) {
    return;
  }
  if (downloads_.revision() != download_revision_) {
    download_revision_ = downloads_.revision();
    ui_->invalidate();
  }
  for (const std::string &id : downloads_.known_ids()) {
    const instances::DownloadSnapshot snapshot = downloads_.snapshot(id);
    auto found = download_states_.find(id);
    const instances::DownloadState previous =
        found == download_states_.end() ? instances::DownloadState::idle
                                        : found->second;
    if (snapshot.state != previous) {
      if (snapshot.state == instances::DownloadState::failed &&
          previous != instances::DownloadState::failed) {
        ui_->push_toast("", snapshot.message.empty()
                              ? "Failed to download " + id
                              : snapshot.message,
                        ui::ToastVariant::Error);
      }
      if (found != download_states_.end()) {
        found->second = snapshot.state;
      } else {
        download_states_.emplace(id, snapshot.state);
      }
    }
  }
  launch_.poll();
  {
    integrations::DiscordState drpc;
    drpc.enabled = config_.data().rpc_enabled.value_or(true);
    const launch::LaunchSnapshot snap = launch_.snapshot();
    drpc.running = snap.running;
    drpc.username = config_.data().username;
    drpc.view = ui_ ? ui_->current_view() : std::string();
    if (snap.running) {
      drpc.instance_id = snap.instance_id;
      if (const auto edition =
              ui::find_config_edition(config_.data(), snap.instance_id)) {
        drpc.version_name = edition->name;
        drpc.instance_logo = edition->logo;
        drpc.multiplayer = edition->lce_online;
      }
    }
    const std::vector<std::string> active_downloads = downloads_.active_ids();
    drpc.downloading_count = static_cast<int>(active_downloads.size());
    if (!active_downloads.empty()) {
      const std::string &first = active_downloads.front();
      drpc.downloading_id = first;
      drpc.download_percent =
          static_cast<int>(downloads_.snapshot(first).percent);
      if (const auto edition = ui::find_config_edition(config_.data(), first)) {
        drpc.downloading_name = edition->name;
      } else if (first.rfind("runner_", 0) == 0) {
        drpc.downloading_name = first.substr(7);
      } else {
        drpc.downloading_name = "Game Files";
      }
    }
    discord_.update(drpc);
  }
  if (launch_.revision() != launch_revision_) {
    launch_revision_ = launch_.revision();
    ui_->invalidate();
  }
  if (launch_.macos_runtime().revision() != macos_revision_) {
    macos_revision_ = launch_.macos_runtime().revision();
    ui_->invalidate();
  }
  audio_.set_music_paused(launch_.snapshot().running || !window_visible_);
  audio_.update();
  ui_->render();
}

int Application::run() {
  if (!initialize()) {
    shutdown();
    return 1;
  }

  running_ = true;
  while (running_) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      handle_event(event);
    }
    render();
  }

  shutdown();
  core::info(":: bye bye~");
  return 0;
}
} // namespace emerald::app
