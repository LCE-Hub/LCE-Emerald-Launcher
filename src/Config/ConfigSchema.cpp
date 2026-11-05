#include "Config/ConfigSchema.hpp"
namespace emerald::config {
namespace {
const Json &require_object(const Json &value) {
  static const Json empty = Json::object();
  return value.is_object() ? value : empty;
}

McServer server_from_json(const Json &object) {
  McServer server;
  server.name = object.value("name", std::string{});
  server.ip = object.value("ip", std::string{});
  server.port = object.value("port", static_cast<std::uint16_t>(0));
  return server;
}

Json server_to_json(const McServer &server) {
  return Json{
      {"name", server.name},
      {"ip", server.ip},
      {"port", server.port},
  };
}

SkinLibraryItem skin_from_json(const Json &object) {
  SkinLibraryItem item;
  item.id = object.value("id", std::string{});
  item.name = object.value("name", std::string{});
  item.skin_base64 = object.value("skinBase64", std::string{});
  return item;
}

Json skin_to_json(const SkinLibraryItem &item) {
  return Json{
      {"id", item.id},
      {"name", item.name},
      {"skinBase64", item.skin_base64},
  };
}

CustomEdition edition_from_json(const Json &object) {
  CustomEdition edition;
  edition.id = object.value("id", std::string{});
  edition.name = object.value("name", std::string{});
  edition.desc = object.value("desc", std::string{});
  edition.url = object.value("url", std::string{});
  edition.path = json_optional<std::string>(object, "path");
  if (object.contains("category") && object["category"].is_array()) {
    edition.category = object["category"].get<std::vector<std::string>>();
  }
  edition.logo = json_optional<std::string>(object, "logo");
  return edition;
}

Json edition_to_json(const CustomEdition &edition) {
  Json object{
      {"id", edition.id},
      {"name", edition.name},
      {"desc", edition.desc},
      {"url", edition.url},
  };
  json_set(object, "path", edition.path);
  if (edition.category.has_value()) {
    object["category"] = *edition.category;
  } else {
    object["category"] = nullptr;
  }
  json_set(object, "logo", edition.logo);
  return object;
}

CustomizationEntry customization_from_json(const Json &object) {
  CustomizationEntry entry;
  entry.title_image = json_optional<std::string>(object, "titleImage");
  entry.panorama = json_optional<std::string>(object, "panorama");
  return entry;
}

Json customization_to_json(const CustomizationEntry &entry) {
  Json object = Json::object();
  json_set(object, "titleImage", entry.title_image);
  json_set(object, "panorama", entry.panorama);
  return object;
}

InstanceLaunchArgs instance_args_from_json(const Json &object) {
  InstanceLaunchArgs args;
  if (object.contains("values") && object["values"].is_object()) {
    args.values = object["values"];
  }
  if (object.contains("args") && object["args"].is_array()) {
    args.args = object["args"].get<std::vector<std::string>>();
  }
  return args;
}

Json instance_args_to_json(const InstanceLaunchArgs &args) {
  return Json{
      {"values", args.values},
      {"args", args.args},
  };
}

GoldMapperMapping mapping_from_json(const Json &object) {
  GoldMapperMapping mapping;
  mapping.from = object.value("from", std::string{});
  mapping.to = object.value("to", std::string{});
  return mapping;
}

Json mapping_to_json(const GoldMapperMapping &mapping) {
  return Json{
      {"from", mapping.from},
      {"to", mapping.to},
  };
}

SavedCape cape_from_json(const Json &object) {
  SavedCape cape;
  cape.id = object.value("id", std::string{});
  cape.name = object.value("name", std::string{});
  cape.url = object.value("url", std::string{});
  return cape;
}

Json cape_to_json(const SavedCape &cape) {
  return Json{
      {"id", cape.id},
      {"name", cape.name},
      {"url", cape.url},
  };
}

SavedSkin saved_skin_from_json(const Json &object) {
  SavedSkin skin;
  skin.id = object.value("id", std::string{});
  skin.name = object.value("name", std::string{});
  skin.url = object.value("url", std::string{});
  skin.is_slim = json_optional<bool>(object, "isSlim");
  return skin;
}

Json saved_skin_to_json(const SavedSkin &skin) {
  Json object{
      {"id", skin.id},
      {"name", skin.name},
      {"url", skin.url},
  };
  json_set(object, "isSlim", skin.is_slim);
  return object;
}

template <typename T, typename Convert>
auto map_vector(const Json &object, const char *key, Convert convert)
    -> std::optional<std::vector<T>> {
  if (!object.contains(key) || !object[key].is_array()) {
    return std::nullopt;
  }
  std::vector<T> items;
  items.reserve(object[key].size());
  for (const Json &entry : object[key]) {
    items.push_back(convert(entry));
  }
  return items;
}

template <typename T, typename Convert>
Json vector_to_json(const std::optional<std::vector<T>> &items,
                    Convert convert) {
  if (!items.has_value()) {
    return nullptr;
  }
  Json array = Json::array();
  for (const T &item : *items) {
    array.push_back(convert(item));
  }
  return array;
}

} // namespace

Json to_json(const AppConfig &config) {
  Json object = Json::object();
  object["username"] = config.username;
  json_set(object, "linuxRunner", config.linux_runner);
  json_set(object, "skinBase64", config.skin_base64);
  object["skinLibrary"] = vector_to_json(config.skin_library, skin_to_json);
  json_set(object, "themeStyleId", config.theme_style_id);
  json_set(object, "themePaletteId", config.theme_palette_id);
  json_set(object, "appleSiliconPerformanceBoost",
           config.apple_silicon_performance_boost);
  object["customEditions"] =
      vector_to_json(config.custom_editions, edition_to_json);
  if (config.customizations.has_value()) {
    Json customizations = Json::object();
    for (const auto &[key, entry] : *config.customizations) {
      customizations[key] = customization_to_json(entry);
    }
    object["customizations"] = std::move(customizations);
  } else {
    object["customizations"] = nullptr;
  }
  if (config.custom_paths.has_value()) {
    object["customPaths"] = *config.custom_paths;
  } else {
    object["customPaths"] = nullptr;
  }
  json_set(object, "profile", config.profile);
  json_set(object, "animationsEnabled", config.animations_enabled);
  json_set(object, "vfxEnabled", config.vfx_enabled);
  json_set(object, "rpcEnabled", config.rpc_enabled);
  json_set(object, "startFullscreen", config.start_fullscreen);
  json_set(object, "musicVol", config.music_vol);
  json_set(object, "sfxVol", config.sfx_vol);
  json_set(object, "legacyMode", config.legacy_mode);
  json_set(object, "skipIntro", config.skip_intro);
  json_set(object, "mangohudEnabled", config.mangohud_enabled);
  object["savedServers"] = vector_to_json(config.saved_servers, server_to_json);
  json_set(object, "extraLaunchArgs", config.extra_launch_args);
  json_set(object, "launchPrefix", config.launch_prefix);
  if (config.launch_env_vars.has_value()) {
    object["launchEnvVars"] = *config.launch_env_vars;
  } else {
    object["launchEnvVars"] = nullptr;
  }
  if (config.instance_launch_args.has_value()) {
    Json instance_args = Json::object();
    for (const auto &[key, args] : *config.instance_launch_args) {
      instance_args[key] = instance_args_to_json(args);
    }
    object["instanceLaunchArgs"] = std::move(instance_args);
  } else {
    object["instanceLaunchArgs"] = nullptr;
  }
  json_set(object, "androidRunner", config.android_runner);
  json_set(object, "androidAudioBackend", config.android_audio_backend);
  json_set(object, "goldmapperEnabled", config.goldmapper_enabled);
  object["goldmapperMappings"] =
      vector_to_json(config.goldmapper_mappings, mapping_to_json);
  json_set(object, "httpProxy", config.http_proxy);
  object["customCapes"] = vector_to_json(config.custom_capes, cape_to_json);
  object["customSkins"] =
      vector_to_json(config.custom_skins, saved_skin_to_json);
  json_set(object, "skinSlim", config.skin_slim);
  json_set(object, "skinSource", config.skin_source);
  json_set(object, "capeBase64", config.cape_base64);
  json_set(object, "capeSource", config.cape_source);
  json_set(object, "language", config.language);
  json_set(object, "setupCompleted", config.setup_completed);
  json_set(object, "layout", config.layout);
  json_set(object, "daytime", config.daytime);
  json_set(object, "keepOpen", config.keep_open);
  json_set(object, "trayIcon", config.tray_icon);
  json_set(object, "showLayers", config.show_layers);
  json_set(object, "macosRuntimeInstalled", config.macos_runtime_installed);
  return object;
}

AppConfig from_json(const Json &object_value) {
  const Json &object = require_object(object_value);
  AppConfig config;
  config.username = object.value("username", std::string{"Player"});
  config.linux_runner = json_optional<std::string>(object, "linuxRunner");
  config.skin_base64 = json_optional<std::string>(object, "skinBase64");
  config.skin_library =
      map_vector<SkinLibraryItem>(object, "skinLibrary", skin_from_json);
  config.theme_style_id = json_optional<std::string>(object, "themeStyleId");
  config.theme_palette_id =
      json_optional<std::string>(object, "themePaletteId");
  config.apple_silicon_performance_boost =
      json_optional<bool>(object, "appleSiliconPerformanceBoost");
  config.custom_editions =
      map_vector<CustomEdition>(object, "customEditions", edition_from_json);
  if (object.contains("customizations") &&
      object["customizations"].is_object()) {
    std::unordered_map<std::string, CustomizationEntry> customizations;
    for (const auto &[key, value] : object["customizations"].items()) {
      customizations[key] = customization_from_json(value);
    }
    config.customizations = std::move(customizations);
  }
  if (object.contains("customPaths") && object["customPaths"].is_object()) {
    config.custom_paths =
        object["customPaths"]
            .get<std::unordered_map<std::string, std::string>>();
  }
  config.profile = json_optional<std::string>(object, "profile");
  config.animations_enabled = json_optional<bool>(object, "animationsEnabled");
  config.vfx_enabled = json_optional<bool>(object, "vfxEnabled");
  config.rpc_enabled = json_optional<bool>(object, "rpcEnabled");
  config.start_fullscreen = json_optional<bool>(object, "startFullscreen");
  config.music_vol = json_optional<std::uint32_t>(object, "musicVol");
  config.sfx_vol = json_optional<std::uint32_t>(object, "sfxVol");
  config.legacy_mode = json_optional<bool>(object, "legacyMode");
  config.skip_intro = json_optional<bool>(object, "skipIntro");
  config.mangohud_enabled = json_optional<bool>(object, "mangohudEnabled");
  config.saved_servers =
      map_vector<McServer>(object, "savedServers", server_from_json);
  config.extra_launch_args =
      json_optional<std::vector<std::string>>(object, "extraLaunchArgs");
  config.launch_prefix = json_optional<std::string>(object, "launchPrefix");
  if (object.contains("launchEnvVars") && object["launchEnvVars"].is_object()) {
    config.launch_env_vars =
        object["launchEnvVars"]
            .get<std::unordered_map<std::string, std::string>>();
  }
  if (object.contains("instanceLaunchArgs") &&
      object["instanceLaunchArgs"].is_object()) {
    std::unordered_map<std::string, InstanceLaunchArgs> instance_args;
    for (const auto &[key, value] : object["instanceLaunchArgs"].items()) {
      instance_args[key] = instance_args_from_json(value);
    }
    config.instance_launch_args = std::move(instance_args);
  }
  config.android_runner = json_optional<std::string>(object, "androidRunner");
  config.android_audio_backend =
      json_optional<std::string>(object, "androidAudioBackend");
  config.goldmapper_enabled = json_optional<bool>(object, "goldmapperEnabled");
  config.goldmapper_mappings = map_vector<GoldMapperMapping>(
      object, "goldmapperMappings", mapping_from_json);
  config.http_proxy = json_optional<std::string>(object, "httpProxy");

  config.custom_capes =
      map_vector<SavedCape>(object, "customCapes", cape_from_json);
  config.custom_skins =
      map_vector<SavedSkin>(object, "customSkins", saved_skin_from_json);
  config.skin_slim = json_optional<bool>(object, "skinSlim");
  config.skin_source = json_optional<std::string>(object, "skinSource");
  config.cape_base64 = json_optional<std::string>(object, "capeBase64");
  config.cape_source = json_optional<std::string>(object, "capeSource");
  config.language = json_optional<std::string>(object, "language");
  config.setup_completed = json_optional<bool>(object, "setupCompleted");
  config.layout = json_optional<std::string>(object, "layout");
  config.daytime = json_optional<bool>(object, "daytime");
  config.keep_open = json_optional<bool>(object, "keepOpen");
  config.tray_icon = json_optional<bool>(object, "trayIcon");
  config.show_layers = json_optional<bool>(object, "showLayers");
  config.macos_runtime_installed =
      json_optional<bool>(object, "macosRuntimeInstalled");

  return config;
}

void apply_legacy_defaults(AppConfig &config) {
  if (!config.profile.has_value()) {
    config.profile = "legacy_evolved";
  }
  if (!config.animations_enabled.has_value()) {
    config.animations_enabled = true;
  }
  if (!config.vfx_enabled.has_value()) {
    config.vfx_enabled = true;
  }
  if (!config.rpc_enabled.has_value()) {
    config.rpc_enabled = true;
  }
  if (!config.start_fullscreen.has_value()) {
    config.start_fullscreen = false;
  }
  if (!config.music_vol.has_value()) {
    config.music_vol = 50;
  }
  if (!config.sfx_vol.has_value()) {
    config.sfx_vol = 100;
  }
  if (!config.legacy_mode.has_value()) {
    config.legacy_mode = false;
  }
  if (!config.skip_intro.has_value()) {
    config.skip_intro = false;
  }
  if (!config.goldmapper_enabled.has_value()) {
    config.goldmapper_enabled = false;
  }
}
} // namespace emerald::config
