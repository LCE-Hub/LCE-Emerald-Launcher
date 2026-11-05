#pragma once
#include "Core/Json.hpp"
#include <cstdint>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>
namespace emerald::config {
struct McServer {
  std::string name;
  std::string ip;
  std::uint16_t port = 0;
};

struct SkinLibraryItem {
  std::string id;
  std::string name;
  std::string skin_base64;
};

struct CustomEdition {
  std::string id;
  std::string name;
  std::string desc;
  std::string url;
  std::optional<std::string> path;
  std::optional<std::vector<std::string>> category;
  std::optional<std::string> logo;
};

struct CustomizationEntry {
  std::optional<std::string> title_image;
  std::optional<std::string> panorama;
};

struct InstanceLaunchArgs {
  Json values = Json::object();
  std::vector<std::string> args;
};

struct GoldMapperMapping {
  std::string from;
  std::string to;
};

struct SavedCape {
  std::string id;
  std::string name;
  std::string url;
};

struct SavedSkin {
  std::string id;
  std::string name;
  std::string url;
  std::optional<bool> is_slim;
};

struct AppConfig {
  std::string username = "Player";
  std::optional<std::string> linux_runner;
  std::optional<std::string> skin_base64;
  std::optional<std::vector<SkinLibraryItem>> skin_library;
  std::optional<std::string> theme_style_id;
  std::optional<std::string> theme_palette_id;
  std::optional<bool> apple_silicon_performance_boost;
  std::optional<std::vector<CustomEdition>> custom_editions;
  std::optional<std::unordered_map<std::string, CustomizationEntry>>
      customizations;
  std::optional<std::unordered_map<std::string, std::string>> custom_paths;
  std::optional<std::string> profile;
  std::optional<bool> animations_enabled;
  std::optional<bool> vfx_enabled;
  std::optional<bool> rpc_enabled;
  std::optional<bool> start_fullscreen;
  std::optional<std::uint32_t> music_vol;
  std::optional<std::uint32_t> sfx_vol;
  std::optional<bool> legacy_mode;
  std::optional<bool> skip_intro;
  std::optional<bool> mangohud_enabled;
  std::optional<std::vector<McServer>> saved_servers;
  std::optional<std::vector<std::string>> extra_launch_args;
  std::optional<std::string> launch_prefix;
  std::optional<std::unordered_map<std::string, std::string>> launch_env_vars;
  std::optional<std::unordered_map<std::string, InstanceLaunchArgs>>
      instance_launch_args;
  std::optional<std::string> android_runner;
  std::optional<std::string> android_audio_backend;
  std::optional<bool> goldmapper_enabled;
  std::optional<std::vector<GoldMapperMapping>> goldmapper_mappings;
  std::optional<std::string> http_proxy;
  std::optional<std::vector<SavedCape>> custom_capes;
  std::optional<std::vector<SavedSkin>> custom_skins;
  std::optional<bool> skin_slim;
  std::optional<std::string> skin_source;
  std::optional<std::string> cape_base64;
  std::optional<std::string> cape_source;
  std::optional<std::string> language;
  std::optional<bool> setup_completed;
  std::optional<std::string> layout;
  std::optional<bool> daytime;
  std::optional<bool> keep_open;
  std::optional<bool> tray_icon;
  std::optional<bool> show_layers;
  std::optional<bool> macos_runtime_installed;
};

Json to_json(const AppConfig &config);
AppConfig from_json(const Json &object);
void apply_legacy_defaults(AppConfig &config);
} // namespace emerald::config
