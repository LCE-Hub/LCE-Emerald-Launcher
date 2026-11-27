#include "Integrations/DiscordRpc.hpp"
#include "Core/Json.hpp"
#include "Core/Log.hpp"
#include "Net/HttpClient.hpp"
#include "discord_ipc_cpp/discord_ipc_client.hpp"
#include "discord_ipc_cpp/ipc_types.hpp"
#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>
#include <vector>
#include <format>
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
constexpr const char *kUploadUrl = "https://tmpfiles.org/api/v1/upload";
constexpr const char *kUploadBoundary = "----EmeraldLegacyRpcLogoBoundary";
constexpr int kRefreshMillis = 750;
std::string direct_upload_url(net::HttpClient &client,
                              const std::string &url) {
  const net::HttpResponse page = client.get(url, false);
  if (page.status < 200 || page.status >= 300) {
    return {};
  }
  constexpr std::string_view marker = "id=\"img_preview\"";
  const std::size_t marker_position = page.body.find(marker);
  if (marker_position == std::string::npos) {
    return {};
  }
  const std::size_t source = page.body.find("src=\"", marker_position);
  if (source == std::string::npos) {
    return {};
  }
  const std::size_t start = source + 5;
  const std::size_t end = page.body.find('"', start);
  if (end == std::string::npos) {
    return {};
  }
  return page.body.substr(start, end - start);
}

std::string upload_body(const std::filesystem::path &path,
                        const std::string &contents) {
  std::string filename = path.filename().string();
  for (char &character : filename) {
    if (character == '"' || character == '\r' || character == '\n') {
      character = '_';
    }
  }
  std::string body;
  body.reserve(contents.size() + 256);
  body += "--" + std::string(kUploadBoundary) + "\r\n";
  body += "Content-Disposition: form-data; name=\"file\"; filename=\"" +
          filename + "\"\r\n";
  body += "Content-Type: application/octet-stream\r\n\r\n";
  body += contents;
  body += "\r\n--" + std::string(kUploadBoundary) + "\r\n";
  body += "Content-Disposition: form-data; name=\"expire\"\r\n\r\n21600\r\n";
  body += "--" + std::string(kUploadBoundary) + "--\r\n";
  return body;
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
  if (view == "lceonline") {
    return "Browsing Friends";
  }
  if (view == "skins") {
      return "Changing Skins";
  }
  if (view == "skineditor") {
      return "Editing a Skin";
  }
  if (view == "workshop") {
      return "Browsing Workshop";
  }
  if (view == "goldmapper") {
      return "Customizing controls";
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
  proxy_ = config.data().http_proxy;
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

std::string DiscordRpc::asset_url(const std::string &logo) {
  if (logo.empty()) {
    return kDefaultLogo;
  }
  if (logo.rfind("https://", 0) == 0 || logo.rfind("http://", 0) == 0) {
    return logo;
  }
  if (logo.rfind("/images/", 0) == 0) {
    return std::string(kPublicAssetBase) + logo;
  }
  std::string path_value = logo;
  if (path_value.rfind("file://", 0) == 0) {
    path_value.erase(0, 7);
  }
  std::error_code error;
  const std::filesystem::path path(path_value);
  if (path.is_absolute() && std::filesystem::is_regular_file(path, error) &&
      !error) {
    const std::string key = path.string();
    const auto found = uploaded_logos_.find(key);
    if (found != uploaded_logos_.end()) {
      return found->second.empty() ? kDefaultLogo : found->second;
    }
    std::string url = upload_logo(key);
    uploaded_logos_[key] = url;
    return url.empty() ? kDefaultLogo : url;
  }
  return kDefaultLogo;
}

std::string DiscordRpc::upload_logo(const std::string &path) {
  std::ifstream file(path, std::ios::binary | std::ios::ate);
  if (!file) {
    return {};
  }
  const std::streamsize size = file.tellg();
  if (size <= 0) {
    return {};
  }
  std::string contents(static_cast<std::size_t>(size), '\0');
  file.seekg(0);
  file.read(contents.data(), size);
  if (!file) {
    return {};
  }
  net::HttpClient client(proxy_);
  const net::HttpResponse response = client.request(
      "POST", kUploadUrl, upload_body(std::filesystem::path(path), contents),
      {{"Content-Type", "multipart/form-data; boundary=" +
                            std::string(kUploadBoundary)}});
  if (response.status < 200 || response.status >= 300) {
    return {};
  }
  const Json payload = Json::parse(response.body, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return {};
  }
  const Json data = payload.value("data", Json::object());
  const std::optional<std::string> url = json_optional<std::string>(data, "url");
  if (!url.has_value() || url->empty()) {
    return {};
  }
  return direct_upload_url(client, *url);
}

void DiscordRpc::refresh(DiscordState &state) {
  RichPresence presence;
  presence.name = "Emerald Launcher";
  presence.type = ActivityType::at_game;
  presence.status_display_type = state.running ? StatusDisplayType::sdt_details : StatusDisplayType::sdt_name;
  std::string details;
  std::string status;
  std::string large_image = kDefaultLogo;
  std::string large_text = "LCE Emerald Launcher";
  if (state.running) {
    const std::string version = state.version_name.empty() ? "Game" : state.version_name;
    details = version;
    if (state.multiplayer || state.joined_clients > 0) {
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
    party.size = {1, state.joined_clients > 0 ? state.joined_clients +1 /*neo: +1 because it can just stay 1 which is the current player; thus it being incorrect */ : 1};
    presence.party = party;
  }

  Assets assets;
  assets.large_image = large_image;
  assets.large_text = large_text;
  assets.small_image = asset_url("/images/icon.png");
  assets.small_text = "Emerald Launcher";
  presence.assets = assets;
  Timestamps timestamps;
  timestamps.start = static_cast<int64_t>(start_time_);
  presence.timestamps = timestamps;
  presence.buttons = std::vector<Button>{
      Button{"Discord", "https://discord.com/invite/lce-hub-1492416855124480153"},
      Button{"Get Emerald", "https://github.com/LCE-Hub/LCE-Emerald-Launcher"}};
  if (currentstate_.currentrpc.details == presence.details &&
      currentstate_.currentrpc.assets.has_value() &&
      currentstate_.currentrpc.assets->large_image == presence.assets->large_image && currentstate_.currentrpc.party->size == presence.party->size) return;
  if (core::verbose()) core::info(std::format(":: [DiscordRpc] {} ({},{}) -> {} ({},{})", currentstate_.currentrpc.details.value_or("<meow>"), currentstate_.currentrpc.party->size.value_or({0,0})[0], currentstate_.currentrpc.party->size.value_or({0,0})[1], presence.details.value_or("<meow>"), presence.party->size.value_or({0,0})[0], presence.party->size.value_or({0,0})[0]));
  currentstate_.currentrpc = presence;
  client_->set_presence(presence);
}
} // namespace emerald::integrations
