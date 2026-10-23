#include "Integrations/DiscordRpc.hpp"
#include "Core/Log.hpp"
#include "discord_ipc_cpp/discord_ipc_client.hpp"
#include "discord_ipc_cpp/ipc_types.hpp"
#include <chrono>
#include <string>
#include <thread>
#include <vector>
namespace emerald::integrations {
using discord_ipc_cpp::DiscordIPCClient;
using ActivityType = discord_ipc_cpp::ipc_types::RichPresence::ActivityType;
using Assets = discord_ipc_cpp::ipc_types::RichPresence::Assets;
using Button = discord_ipc_cpp::ipc_types::RichPresence::Button;
using Party = discord_ipc_cpp::ipc_types::RichPresence::Party;
using discord_ipc_cpp::ipc_types::RichPresence;
using StatusDisplayType =
    discord_ipc_cpp::ipc_types::RichPresence::StatusDisplayType;
using Timestamps = discord_ipc_cpp::ipc_types::RichPresence::Timestamps;
namespace {
constexpr const char *kClientId = "1482504445152460871";
constexpr const char *kPublicAssetBase = "https://raw.githubusercontent.com/LCE-Hub/LCE-Emerald-Launcher/refs/heads/main/public";
constexpr const char *kDefaultLogo = "logo";
constexpr int kRefreshMillis = 750;
std::string asset_url(const std::string &logo) {
  if (logo.empty()) {
    return kDefaultLogo;
  }
  if (logo.rfind("https://", 0) == 0 || logo.rfind("http://", 0) == 0) {
    return logo;
  }
  if (logo.rfind("/images/", 0) == 0) {
    return std::string(kPublicAssetBase) + logo;
  }
  return kDefaultLogo;
}

std::string view_details(const std::string &view) {
  if (view == "home" || view == "main" || view.empty()) {
    return "Main Menu";
  }
  if (view == "versions") {
    return "Selecting Version";
  }
  if (view == "settings") {
    return "In Settings";
  }
  return "In Menus";
}
} // namespace

DiscordRpc::DiscordRpc() {
  start_time_ = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::seconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count());
}

DiscordRpc::~DiscordRpc() { shutdown(); }
void DiscordRpc::configure(const config::ConfigStore &config) {
  enabled_.store(config.data().rpc_enabled.value_or(true));
}

void DiscordRpc::update(const DiscordState &state) {
  {
    std::lock_guard<std::mutex> lock(state_mutex_);
    pending_state_ = state;
  }
  if (running_.exchange(true)) {
    return;
  }
  stop_.store(false);
  worker_ = std::thread([this] { run(); });
}

void DiscordRpc::run() {
  while (!stop_.load()) {
    DiscordState state;
    {
      std::lock_guard<std::mutex> lock(state_mutex_);
      state = pending_state_;
    }
    if (state.enabled && enabled_.load()) {
      if (ensure_started()) {
        refresh(state);
      }
    } else {
      stop_client();
    }
    for (int tick = 0; tick < kRefreshMillis / 50 && !stop_.load(); ++tick) {
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
  }
  stop_client();
  running_.store(false);
}

void DiscordRpc::shutdown() {
  stop_.store(true);
  if (worker_.joinable()) {
    worker_.join();
  }
}

bool DiscordRpc::ensure_started() {
  if (started_ && client_) {
    return true;
  }
  client_ = std::make_unique<DiscordIPCClient>(kClientId);
  if (!client_->connect()) {
    core::warn("discordrpc: failed to connect to discord ipc");
    client_.reset();
    started_ = false;
    return false;
  }
  started_ = true;
  return true;
}

void DiscordRpc::stop_client() {
  client_.reset();
  started_ = false;
}

void DiscordRpc::refresh(const DiscordState &state) {
  RichPresence presence;
  presence.name = "Emerald Launcher";
  presence.type = ActivityType::at_game;
  presence.status_display_type = StatusDisplayType::sdt_details;
  std::string details;
  std::string status;
  std::string large_image = kDefaultLogo;
  std::string large_text = "LCE Emerald Launcher";
  if (state.running) {
    const std::string version = state.version_name.empty() ? "Game" : state.version_name;
    details = version;
    if (state.multiplayer) {
      details += " Multiplayer";
    }
    status =
        state.username.empty() ? "In Game" : "Playing as " + state.username;
    large_image = asset_url(state.instance_logo);
    large_text = version;
  } else if (state.downloading_count > 0 && !state.downloading_id.empty()) {
    const std::string name =
        state.downloading_name.empty() ? "Game Files" : state.downloading_name;
    const std::string extra =
        state.downloading_count > 1
            ? " +" + std::to_string(state.downloading_count - 1) + " more"
            : "";
    details = "Downloading " + name + extra + " (" +
              std::to_string(state.download_percent) + "%)";
    status = state.username.empty() ? "Emerald Launcher"
                                    : "Logged in as " + state.username;
  } else {
    details = view_details(state.view);
    status = state.username.empty() ? "Emerald Launcher"
                                    : "Logged in as " + state.username;
  }

  presence.details = details;
  presence.state = status;
  if (state.running && !state.username.empty()) {
    Party party;
    party.id = "emerald_" + state.username;
    party.size = {1, 2};
    presence.party = party;
  }

  Assets assets;
  assets.large_image = large_image;
  assets.large_text = large_text;
  assets.small_image = kDefaultLogo;
  assets.small_text =
      state.running
          ? (state.version_name.empty() ? "Playing" : state.version_name)
          : "Emerald Launcher";
  presence.assets = assets;
  Timestamps timestamps;
  timestamps.start = static_cast<int64_t>(start_time_);
  presence.timestamps = timestamps;
  presence.buttons = std::vector<Button>{
      Button{"Discord", "https://discord.gg/cQVKhQXcCx"},
      Button{"Get Emerald", "https://github.com/LCE-Hub/LCE-Emerald-Launcher"}};

  client_->set_presence(presence);
}
} // namespace emerald::integrations
