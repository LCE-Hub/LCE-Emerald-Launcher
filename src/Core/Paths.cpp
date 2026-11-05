#include "Core/Paths.hpp"
#include <SDL3/SDL_filesystem.h>
#include <SDL3/SDL_stdinc.h>
#include <cstdlib>
#include <optional>
#include <string>
namespace emerald::core {
namespace {
constexpr std::string_view kAppIdentifier = "com.emerald.legacy";
std::optional<std::filesystem::path> env_path(const char *name) {
  const char *value = std::getenv(name);
  if (value == nullptr || value[0] == '\0') {
    return std::nullopt;
  }
  return std::filesystem::path{value};
}

std::filesystem::path home_dir() {
  if (auto home = env_path("HOME")) {
    return *home;
  }
#if defined(_WIN32)
  if (auto profile = env_path("USERPROFILE")) {
    return *profile;
  }
#endif
  return {};
}

std::filesystem::path base_data_dir() {
#if defined(_WIN32)
  if (auto local = env_path("LOCALAPPDATA")) {
    return *local;
  }
  if (auto roaming = env_path("APPDATA")) {
    return *roaming;
  }
  return executable_dir();
#elif defined(__APPLE__)
  return home_dir() / "Library" / "Application Support";
#else
  if (auto xdg = env_path("XDG_DATA_HOME")) {
    return *xdg;
  }
  return home_dir() / ".local" / "share";
#endif
}
} // namespace

std::filesystem::path app_data_dir() {
  return base_data_dir() / std::string{kAppIdentifier};
}

std::filesystem::path config_file_path() {
  return app_data_dir() / "emerald_legacy_config.json";
}

std::filesystem::path playtime_file_path() {
  return app_data_dir() / "playtime.json";
}

std::filesystem::path state_file_path() {
  return app_data_dir() / "state.json";
}

std::filesystem::path instances_dir() { return app_data_dir() / "instances"; }
std::filesystem::path local_storage_dir() {
  return app_data_dir() / "localstorage";
}

std::filesystem::path webkit_website_data_dir() {
#if defined(__APPLE__)
  return home_dir() / "Library" / "WebKit" / std::string{kAppIdentifier} /
         "WebsiteData";
#else
  return local_storage_dir();
#endif
}

std::filesystem::path executable_dir() {
  const char *raw = SDL_GetBasePath();
  if (raw == nullptr) {
    return std::filesystem::current_path();
  }
  return std::filesystem::path{raw};
}
} // namespace emerald::core
