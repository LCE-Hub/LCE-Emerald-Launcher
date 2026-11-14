#include "Migration/Migration.hpp"
#include "Core/Log.hpp"
#include <optional>
#include <string>
#include <string_view>
namespace emerald::migration {
namespace {
bool has_prefix(std::string_view value, std::string_view prefix) {
  return value.size() >= prefix.size() &&
         value.compare(0, prefix.size(), prefix) == 0;
}

Json decode_value(const std::string &raw) {
  Json parsed = Json::parse(raw, nullptr, false);
  if (parsed.is_discarded()) {
    return raw;
  }
  return parsed;
}

std::optional<std::string> as_string(const Json &value) {
  if (value.is_string()) {
    return value.get<std::string>();
  }
  return std::nullopt;
}

std::optional<bool> as_bool(const Json &value) {
  if (value.is_boolean()) {
    return value.get<bool>();
  }
  return std::nullopt;
}

std::optional<std::uint32_t> as_uint(const Json &value) {
  if (value.is_number()) {
    const double number = value.get<double>();
    if (number >= 0.0) {
      return static_cast<std::uint32_t>(number);
    }
  }
  return std::nullopt;
}

std::optional<std::string> data_url_base64(const std::string &value) {
  constexpr std::string_view marker = "base64,";
  const std::size_t position = value.find(marker);
  if (!has_prefix(value, "data:") || position == std::string::npos) {
    return std::nullopt;
  }
  return value.substr(position + marker.size());
}

template <typename T, typename Convert>
std::optional<std::vector<T>> parse_array(const Json &value, const char *field,
                                          Convert convert) {
  if (!value.is_array()) {
    return std::nullopt;
  }
  Json temporary = Json::object();
  temporary[field] = value;
  config::AppConfig parsed = config::from_json(temporary);
  return convert(parsed);
}

void map_key(const std::string &key, const Json &value,
             config::AppConfig &config) {
  if (key == "lce-username") {
    if (auto text = as_string(value)) {
      config.username = *text;
    }
  } else if (key == "lce-theme") {
    if (auto text = as_string(value)) {
      config.theme_style_id = *text;
    }
  } else if (key == "lce-layout") {
    if (auto text = as_string(value)) {
      config.layout = *text;
    }
  } else if (key == "lce-vfx") {
    if (auto flag = as_bool(value)) {
      config.vfx_enabled = *flag;
    }
  } else if (key == "lce-animations") {
    if (auto flag = as_bool(value)) {
      config.animations_enabled = *flag;
    }
  } else if (key == "discord-rpc") {
    if (auto flag = as_bool(value)) {
      config.rpc_enabled = *flag;
    }
  } else if (key == "lce-fullscreen") {
    if (auto flag = as_bool(value)) {
      config.start_fullscreen = *flag;
    }
  } else if (key == "lce-music") {
    if (auto number = as_uint(value)) {
      config.music_vol = *number;
    }
  } else if (key == "lce-sfx") {
    if (auto number = as_uint(value)) {
      config.sfx_vol = *number;
    }
  } else if (key == "lce-daytime") {
    if (auto flag = as_bool(value)) {
      config.daytime = *flag;
    }
  } else if (key == "lce-profile") {
    if (auto text = as_string(value)) {
      config.profile = *text;
    }
  } else if (key == "lce-legacy-mode") {
    if (auto flag = as_bool(value)) {
      config.legacy_mode = *flag;
    }
  } else if (key == "lce-setup-completed") {
    if (auto flag = as_bool(value)) {
      config.setup_completed = *flag;
    }
  } else if (key == "lce-skip-intro") {
    if (auto flag = as_bool(value)) {
      config.skip_intro = *flag;
    }
  } else if (key == "lce-android-runner") {
    if (auto text = as_string(value)) {
      config.android_runner = *text;
    }
  } else if (key == "lce-android-audio") {
    if (auto text = as_string(value)) {
      config.android_audio_backend = *text;
    }
  } else if (key == "lce-goldmapper") {
    if (auto flag = as_bool(value)) {
      config.goldmapper_enabled = *flag;
    }
  } else if (key == "lce-skin") {
    if (auto text = as_string(value)) {
      if (auto base64 = data_url_base64(*text)) {
        config.skin_base64 = *base64;
      } else {
        config.skin_source = *text;
      }
    }
  } else if (key == "lce-skin-slim") {
    if (auto flag = as_bool(value)) {
      config.skin_slim = *flag;
    }
  } else if (key == "lce-cape") {
    if (auto text = as_string(value)) {
      if (auto base64 = data_url_base64(*text)) {
        config.cape_base64 = *base64;
      } else {
        config.cape_source = *text;
      }
    }
  } else if (key == "lce-custom-skins") {
    if (auto skins = parse_array<config::SavedSkin>(
            value, "customSkins", [](const config::AppConfig &parsed) {
              return parsed.custom_skins;
            })) {
      config.custom_skins = std::move(*skins);
    }
  } else if (key == "lce-custom-capes") {
    if (auto capes = parse_array<config::SavedCape>(
            value, "customCapes", [](const config::AppConfig &parsed) {
              return parsed.custom_capes;
            })) {
      config.custom_capes = std::move(*capes);
    }
  } else if (key == "lce-show-layers") {
    if (auto flag = as_bool(value)) {
      config.show_layers = *flag;
    }
  } else if (key == "lce-keep-open") {
    if (auto flag = as_bool(value)) {
      config.keep_open = *flag;
    }
  } else if (key == "lce-tray-icon") {
    if (auto flag = as_bool(value)) {
      config.tray_icon = *flag;
    }
  } else if (key == "lce-macos-runtime-installed") {
    if (auto flag = as_bool(value)) {
      config.macos_runtime_installed = *flag;
    }
  } else if (key == "i18nextLng") {
    if (auto text = as_string(value)) {
      config.language = *text;
    }
  }
}

} // namespace

bool is_mapped_key(std::string_view key) {
  static constexpr std::string_view kMappedKeys[] = {
      "lce-username",
      "lce-theme",
      "lce-layout",
      "lce-vfx",
      "lce-animations",
      "discord-rpc",
      "lce-fullscreen",
      "lce-music",
      "lce-sfx",
      "lce-daytime",
      "lce-profile",
      "lce-legacy-mode",
      "lce-setup-completed",
      "lce-skip-intro",
      "lce-android-runner",
      "lce-android-audio",
      "lce-goldmapper",
      "lce-skin",
      "lce-skin-slim",
      "lce-cape",
      "lce-custom-skins",
      "lce-custom-capes",
      "lce-show-layers",
      "lce-keep-open",
      "lce-tray-icon",
      "lce-macos-runtime-installed",
      "i18nextLng",
  };
  for (const std::string_view candidate : kMappedKeys) {
    if (candidate == key) {
      return true;
    }
  }
  return false;
}

std::size_t apply_local_storage(const std::vector<StorageEntry> &entries,
                                config::AppConfig &config, Json &legacy_out) {
  legacy_out = Json::object();
  std::size_t mapped = 0;
  for (const StorageEntry &entry : entries) {
    if (has_prefix(entry.key, "plugin:")) {
      continue;
    }

    const Json value = decode_value(entry.raw);
    legacy_out[entry.key] = value;
    map_key(entry.key, value, config);
    if (is_mapped_key(entry.key)) {
      ++mapped;
    }
  }

  return mapped;
}

MigrationReport run_migration(config::ConfigStore &config,
                              state::StateStore &state) {
  MigrationReport report;
  if (state.migration_completed()) {
    return report;
  }

  report.ran = true;
  const std::vector<std::filesystem::path> files = launcher_storage_files();
  report.storage_files = files.size();
  if (files.empty()) {
    state.set_migration_completed("none");
    state.save();
    report.completed = true;
    return report;
  }

  const std::vector<StorageEntry> entries = read_launcher_local_storage();
  report.entries = entries.size();
  Json legacy_storage = Json::object();
  report.mapped = apply_local_storage(entries, config.data(), legacy_storage);
  state.set_legacy_local_storage(std::move(legacy_storage));
  if (!entries.empty()) {
    state.set_migration_completed("1.6.1");
    report.completed = true;
  }

  config.save();
  state.save();
  return report;
}
} // namespace emerald::migration
