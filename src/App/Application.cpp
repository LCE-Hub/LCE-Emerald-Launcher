#include "App/Application.hpp"
#include "Core/EmbeddedAssets.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Launch/Servers.hpp"
#include "Migration/Migration.hpp"
#include "Skins/SkinElements.hpp"
#include "Skins/SkinSync.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/AppViews.hpp"
#include "Ui/Views/VersionsView.hpp"
#include "Ui/Views/WorkshopView.hpp"
#include "lazuli/Log.hpp"
#include "Ui/EditionResolver.hpp"
#include "Platform/AndroidBridge.hpp"
#include <SDL3/SDL.h>
#include <cstdlib>
#include <filesystem>
#include <format>
#include <optional>
#include <string_view>
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

int hex_value(char character) {
  if (character >= '0' && character <= '9') {
    return character - '0';
  }
  if (character >= 'a' && character <= 'f') {
    return character - 'a' + 10;
  }
  if (character >= 'A' && character <= 'F') {
    return character - 'A' + 10;
  }
  return -1;
}

std::string url_decode(std::string_view value, bool plus_as_space = false) {
  std::string decoded;
  decoded.reserve(value.size());
  for (std::size_t index = 0; index < value.size(); ++index) {
    if (value[index] == '%' && index + 2 < value.size()) {
      const int high = hex_value(value[index + 1]);
      const int low = hex_value(value[index + 2]);
      if (high >= 0 && low >= 0) {
        decoded.push_back(static_cast<char>((high << 4) | low));
        index += 2;
        continue;
      }
    }
    decoded.push_back(plus_as_space && value[index] == '+' ? ' ' : value[index]);
  }
  return decoded;
}

std::vector<std::string> split_on(std::string_view value, char delimiter) {
  std::vector<std::string> parts;
  std::size_t begin = 0;
  while (begin <= value.size()) {
    const std::size_t end = value.find(delimiter, begin);
    const std::size_t length =
        end == std::string_view::npos ? std::string_view::npos : end - begin;
    parts.emplace_back(value.substr(begin, length));
    if (end == std::string_view::npos) {
      break;
    }
    begin = end + 1;
  }
  return parts;
}

struct Hyperlink {
  std::vector<std::string> parts;
  std::string query;
};

std::optional<Hyperlink> parse_hyperlink(std::string_view url) {
  constexpr std::string_view scheme = "emerald://";
  if (!url.starts_with(scheme)) {
    return std::nullopt;
  }
  std::string_view rest = url.substr(scheme.size());
  const std::size_t fragment = rest.find('#');
  if (fragment != std::string_view::npos) {
    rest = rest.substr(0, fragment);
  }
  Hyperlink link;
  const std::size_t query = rest.find('?');
  if (query != std::string_view::npos) {
    link.query = std::string(rest.substr(query + 1));
    rest = rest.substr(0, query);
  }
  for (const std::string &part : split_on(rest, '/')) {
    if (part.empty()) {
      continue;
    }
    link.parts.push_back(url_decode(part));
  }
  if (link.parts.empty()) {
    return std::nullopt;
  }
  return link;
}

std::optional<std::string> query_value(std::string_view query,
                                       std::string_view key) {
  for (const std::string &pair : split_on(query, '&')) {
    const std::size_t equals = pair.find('=');
    if (url_decode(std::string_view(pair).substr(0, equals)) !=
        std::string(key)) {
      continue;
    }
    if (equals == std::string::npos) {
      return std::string();
    }
    return url_decode(std::string_view(pair).substr(equals + 1), true);
  }
  return std::nullopt;
}
} // namespace

Application::Application() = default;
Application::~Application() { shutdown(); }
bool Application::initialize(const std::vector<std::string_view>& args) {
  SDL_SetAppMetadata("Emerald Legacy Launcher", EMERALD_VERSION,
                     "com.emerald.legacy");
  platform::android_prepare_runtime_files();
#if defined(__ANDROID__)
  SDL_SetHint(SDL_HINT_ORIENTATIONS, "LandscapeLeft LandscapeRight");
#endif
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
#if defined(__ANDROID__)
  SDL_SetWindowFullscreen(window_, true);
#endif

  renderer_ = SDL_CreateRenderer(window_, nullptr);
  if (renderer_ == nullptr) {
    core::error(std::string{"SDL_CreateRenderer failed: "} + SDL_GetError());
    return false;
  }

  SDL_SetRenderVSync(renderer_, 1);
  SDL_SetRenderLogicalPresentation(renderer_, kLogicalWidth, kLogicalHeight,
                                   SDL_LOGICAL_PRESENTATION_LETTERBOX);
#if defined(__ANDROID__)
  SDL_SetHint(SDL_HINT_ENABLE_SCREEN_KEYBOARD, "1");
#else
  SDL_StartTextInput(window_);
#endif
  core::info(":: starting up Emerald Launcher");
  lazuli::log::set_sink([](lazuli::log::Level level, std::string_view message) {
    switch (level) {
    case lazuli::log::Level::Debug:
      core::debug(message);
      break;
    case lazuli::log::Level::Info:
      core::info(message);
      break;
    case lazuli::log::Level::Warn:
      core::warn(message);
      break;
    case lazuli::log::Level::Error:
      core::error(message);
      break;
    }
  });
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
  public_root_ = public_root;
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
  lazuli::register_builtin_elements();
  ui::register_skin_elements();
  ui_ = std::make_unique<lazuli::UiSystem>(renderer_, ui_docs_root, public_root,
                                           resource_root / "i18n");
  ui_->set_status_text(EMERALD_VERSION_TEXT);
  ui::register_views(*ui_, &versions_view_, &workshop_view_);
  ui::UiServices &services = ui_services_;
  services.config = &config_;
  services.playtime = &playtime_;
  services.downloads = &downloads_;
  services.launch = &launch_;
  services.lce_online = &lce_online_;
  services.updates = &update_checker_;
  services.workshop = &workshop_;
  launch_.runner_downloads().set_report_target(&downloads_);
  services.audio = &audio_;
  services.dlc_source = resource_root / "DLC";
  services.skin_pck = core::app_data_dir() / "Skin.pck";
  services.public_root = public_root;
  launch_.configure(config_, playtime_, resource_root, core::app_data_dir(),
                    services.dlc_source, services.skin_pck);
  lce_online_.configure(config_);
  download_revision_ = downloads_.revision();
  launch_revision_ = launch_.revision();
  macos_revision_ = launch_.macos_runtime().revision();
  runner_download_revision_ = launch_.runner_downloads().revision();
  update_checker_.start(config_.data(),
                        ui::resolve_config_editions(config_.data()));
  update_revision_ = update_checker_.revision();
  workshop_.start(config_.data());
  workshop_revision_ = workshop_.revision();
  services.quit = [this] { running_ = false; };
  ui_->set_services(&services);
  ui_->set_quit(services.quit);
  ui_->set_press_observer([this](float x, float y) {
    click_vfx_.press(x, y);
  });
  ui_->set_overlay_hook([this](lazuli::SdlRenderer &renderer, double now) {
    click_vfx_.draw(renderer, now);
  });
  ui_->set_sounds(lazuli::UiSounds{
      .press = [this] { audio_.play_press(); },
      .back = [this] { audio_.play_back(); },
      .scroll = [this] { audio_.play_scroll(); },
      .effect = [this](std::string_view key) {
        if (key == "toast.error") {
          audio_.play_sfx("in.ogg");
        } else if (key == "toast.show") {
          audio_.play_sfx("notification.ogg");
        } else if (key == "toast.hide") {
          audio_.play_sfx("out.ogg");
        }
      },
  });
  ui_->set_sound_for([](std::string_view handler) -> lazuli::UiSound {
    const std::string name(handler);
    if (name.rfind("open:", 0) == 0 || name.rfind("overlay.toasts.", 0) == 0 ||
        name == "settings.downloadRunner") {
      return lazuli::UiSound::None;
    }
    if (name == "settings.back" || name == "skineditor.back" ||
        name == "goldmapper.back" || name == "goldmapper.modal.cancel" ||
        name == "quit") {
      return lazuli::UiSound::Back;
    }
    return lazuli::UiSound::Press;
  });
  ui_->set_translator([this](std::string_view) -> std::optional<std::string> {
    if (config_.data().bedrock_enabled.value() == true) {
      return std::string{"Marketplace"};
    }
    return std::nullopt;
  });
  ui_->set_panorama_source([this] {
    std::string source = "panorama/vanilla_tu19_Panorama_Background_Day.png";
    const config::AppConfig &config = config_.data();
    const std::string profile = config.profile.value_or("");
    std::string base = "vanilla_tu19";
    const std::optional<instances::Edition> edition =
        ui::find_config_edition(config, profile);
    if (edition.has_value() && !edition->panorama.empty()) {
      base = edition->panorama;
    }
    std::string override_path;
    if (config.customizations.has_value()) {
      const auto found = config.customizations->find(profile);
      if (found != config.customizations->end() &&
          found->second.panorama.has_value()) {
        override_path = *found->second.panorama;
      }
    }
    const bool remote = override_path.rfind("data:", 0) == 0 ||
                        override_path.rfind("blob:", 0) == 0 ||
                        override_path.rfind("http", 0) == 0;
    if (!override_path.empty() && !remote) {
      source = override_path;
    } else {
      const bool is_day = config.daytime.value_or(true);
      source = "panorama/" + base + "_Panorama_Background_" +
               (is_day ? "Day" : "Night") + ".png";
    }
    return source;
  });
  ui_->set_mouse_observer(
      [](float x, float y) { ui::note_logical_mouse(x, y); });
  services.i18n = &ui_->i18n();
  services.notifications = &ui_->notifications();
  services.navigate = [p = ui_.get()](const std::string &id) {
    p->navigate(id);
  };
  services.change_language = [p = ui_.get()](const std::string &language) {
    p->set_language(language);
  };
  services.reset_focus = [p = ui_.get()] { p->reset_focus(); };
  services.tooltip_set = [p = ui_.get()] { return p->tooltip_set(); };
  services.focus_element = [p = ui_.get()](const std::string &id) {
    p->focus_element(id);
  };
  services.focus_scope = [p = ui_.get()](const std::string &id) {
    p->set_focus_scope(id);
  };
  services.read_text_input = [p = ui_.get()] { return p->text_result(); };
  services.text_edited = [p = ui_.get()] { return p->text_edited(); };
  services.notify = [p = ui_.get()](const std::string &title,
                                    const std::string &message,
                                    lazuli::ToastVariant variant,
                                    const std::string &on_click) {
    p->push_toast(title, message, variant, on_click);
  };
  if (!ui_->initialize()) {
    core::error("ui: failed to initialize");
    return false;
  }
  ui_->set_language(config_.data().language.value_or("en"));
  //neo: note: dont args[0] without checking length first.. it segfaults lol
  if (!args.empty() && args.size() > 0) { //neo: im very scared of segfaults.
      if (args.at(0).starts_with("emerald://")) {
          core::info(std::format(":: started from hyperlink\n->\t{}", args.at(0)));
          handle_hyperlink(args.at(0));
      }
      for (const std::string_view arg : args) {
          if (arg == "--version") { core::info(std::format("--------------------\nEmerald Launcher " EMERALD_VERSION_TEXT "\nEmbedded Build ID: {}\nA project by the LCE Hub.", core::embedded::build_id())); shutdown(); return false;}
      }
  }
  if (ui_->current_view().empty()) {
    ui_->navigate("home");
  }
  audio_.start_music();
  return true;
}

void Application::handle_hyperlink(std::string_view url) {
  const std::optional<Hyperlink> link = parse_hyperlink(url);
  if (!link.has_value()) {
    return;
  }
  const std::string &action = link->parts[0];
  if (action == "launch") {
    if (link->parts.size() >= 2) {
      std::string instance_id = link->parts[1];
      if (instance_id == "neolegacy") instance_id = "legacy_evolved"; //neo: piebot said so hehehehehe
      launch_.start(instance_id, {});
      return;
    }
    ui_->navigate("home");
    launch_.start(config_.data().profile.value_or("legacy_evolved"),
                  launch::partnership_servers());
    return;
  }
  if (action == "lceonline" && link->parts.size() >= 2) {
    ui_->navigate("lceonline");
    if (link->parts[1] == "addfriend") {
      const std::optional<std::string> username =
          query_value(link->query, "username");
      if (username.has_value() && !username->empty()) {
        lce_online_.send_request(*username);
      }
    }
    return;
  }
  if (action == "workshop" && link->parts.size() >= 2) {
    ui_->navigate("workshop");
    if (workshop_view_ != nullptr) {
      std::string type = query_value(link->query, "type").value_or("");
      if (type.empty()) {
        for (const char *candidate :
             {"normal", "bytebukkit", "plugin", "version"}) {
          if (query_value(link->query, candidate).has_value()) {
            type = candidate;
            break;
          }
        }
      }
      workshop_view_->set_target(link->parts[1], type);
    }
    return;
  }
  if (action == "versions" && link->parts.size() >= 2 &&
      link->parts[1] == "add") {
    const std::optional<std::string> name_value =
        query_value(link->query, "name");
    const std::optional<std::string> id_value = query_value(link->query, "id");
    const std::optional<std::string> url_value = query_value(link->query, "url");
    ui_->navigate("versions");
    if (name_value.has_value() && !name_value->empty() && id_value.has_value() &&
        !id_value->empty() && url_value.has_value() &&
        url_value->starts_with("http")) {
      config::CustomEdition edition;
      edition.id = *id_value;
      edition.name = *name_value;
      edition.desc =
          ui_->translate("modals.customTu.defaultDesc", "Custom imported TU");
      edition.url = *url_value;
      if (versions_view_ != nullptr) {
        versions_view_->request_add_from_link(ui_services_, edition);
        ui_->invalidate();
      }
    }
    return;
  }
  ui_->navigate(action == "main" ? "home" : action);
}

void Application::shutdown() {
  workshop_.stop();
  update_checker_.stop();
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
      if (!event.key.repeat && event.key.key == SDLK_E &&
          ui_->current_view() == "versions" && versions_view_ != nullptr &&
          !versions_view_->import_modal_open()) {
        versions_view_->action("versions.import.open", ui_services_);
        ui_->invalidate();
      }
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_MOUSE_BUTTON_DOWN:
  case SDL_EVENT_MOUSE_MOTION:
  case SDL_EVENT_MOUSE_WHEEL:
  case SDL_EVENT_FINGER_DOWN:
  case SDL_EVENT_FINGER_MOTION:
  case SDL_EVENT_FINGER_UP:
  case SDL_EVENT_FINGER_CANCELED:
  case SDL_EVENT_TEXT_INPUT:
    if (ui_ != nullptr) {
      ui_->handle_event(event);
    }
    break;
  case SDL_EVENT_GAMEPAD_BUTTON_DOWN: //neo: i had to hardcode it here because im lazy
    if (ui_ != nullptr) {
      if (event.gbutton.button == SDL_GAMEPAD_BUTTON_NORTH &&
          ui_->current_view() == "versions" && versions_view_ != nullptr &&
          !versions_view_->import_modal_open()) {
        versions_view_->action("versions.import.open", ui_services_);
        ui_->invalidate();
      }
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
#if defined(__ANDROID__)
    launch_.android_returned();
#endif
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
  bool want_fullscreen = config_.data().start_fullscreen.value_or(false);
#if defined(__ANDROID__)
  want_fullscreen = true;
#endif
  const bool fullscreen_now =
      (SDL_GetWindowFlags(window_) & SDL_WINDOW_FULLSCREEN) != 0;
  if (want_fullscreen != fullscreen_now) {
      if (want_fullscreen) {
      if (!SDL_SetWindowFullscreen(window_, true)) {
          core::error(std::format(":: failed to set fullscreen: %s", SDL_GetError()));
      }
  } else { //neo: sdl is weird and i need to do that for auto-applying the fullscreen effect upon clicking
      if (!SDL_SetWindowFullscreen(window_, false)) {
          core::error(std::format(":: failed to set fullscreen: %s", SDL_GetError()));
      }
  }
  }
  if (versions_view_ != nullptr && versions_view_->consume_folder_pick()) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr && versions_view_->consume_world_pick(ui_services_)) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr && versions_view_->consume_backup_pick(ui_services_)) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr &&
      versions_view_->consume_custom_path_pick(ui_services_)) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr && versions_view_->consume_restore_pick(ui_services_)) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr && versions_view_->consume_customize_pick()) {
    ui_->invalidate();
  }
  if (versions_view_ != nullptr &&
      versions_view_->consume_dlc_download(ui_services_)) {
    ui_->invalidate();
  }
  if (skins::SkinUiState::instance().consume_picks(config_, public_root_)) {
    ui_->invalidate();
  }
  if (skins::SkinUiState::instance().sync_needed) {
    skins::SkinUiState::instance().sync_needed = false;
    skins::sync_skin_pck(config_.data(), public_root_,
                         core::app_data_dir() / "Skin.pck");
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
                        lazuli::ToastVariant::Error);
      }
      if (snapshot.state == instances::DownloadState::finished) {
        update_checker_.clear_update(id);
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
        drpc.joined_clients = lce_online_.relay().hosted_clients();
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
  if (launch_.runner_downloads().revision() != runner_download_revision_) {
    runner_download_revision_ = launch_.runner_downloads().revision();
    ui_->invalidate();
  }
  if (lce_online_.revision() != lce_revision_) {
    lce_revision_ = lce_online_.revision();
    ui_->invalidate();
  }
  if (update_checker_.revision() != update_revision_) {
    update_revision_ = update_checker_.revision();
    ui_->invalidate();
  }
  if (workshop_.revision() != workshop_revision_) {
    workshop_revision_ = workshop_.revision();
    ui_->invalidate();
  }
  if (const std::optional<config::CustomEdition> edition =
          workshop_.consume_pending_edition()) {
    config::AppConfig &config = config_.data();
    if (!config.custom_editions.has_value()) {
      config.custom_editions = std::vector<config::CustomEdition>{};
    }
    config.custom_editions->push_back(*edition);
    config_.save();
    ui_->invalidate();
  }
  for (const auto &notification : update_checker_.drain_notifications()) {
    ui_->push_toast(
        ui_->translate(notification.title_key, notification.default_title),
        notification.message, notification.variant, notification.on_click);
  }
  for (const lce::LceNotification &notification :
       lce_online_.drain_notifications()) {
    const bool is_invite =
        notification.kind == lce::LceNotification::Kind::Invite;
    ui_->push_toast(
        ui_->translate(is_invite ? "download.gameInvite"
                                 : "download.friendRequest"),
        is_invite ? notification.name + " invited you to play!"
                  : notification.name + " wants to be friends!",
        lazuli::ToastVariant::Update, "go:lceonline");
  }
  if (const std::optional<lce::LceSessionState> session =
          lce_online_.consume_session()) {
    config::AppConfig &config = config_.data();
    if (session->signed_in) {
      config.lceonline_token = session->token;
      config.lceonline_username = session->username;
      config.lceonline_display_name = session->display_name;
    } else {
      config.lceonline_token.reset();
      config.lceonline_username.reset();
      config.lceonline_display_name.reset();
    }
    config_.save();
  }
  audio_.set_music_paused(launch_.snapshot().running || !window_visible_);
  audio_.update();
  click_vfx_.set_enabled(config_.data().vfx_enabled.value_or(true));
  ui_->render();
}

int Application::run(const std::vector<std::string_view>& args) {
  if (!initialize(args)) {
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
