#include "Launch/GoldMapper.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Platform/Platform.hpp"
#include <string>
namespace emerald::launch {
namespace {
void push_key(std::vector<config::GoldMapperMapping> &mappings,
              std::string name) {
  mappings.push_back(config::GoldMapperMapping{name, name});
}

std::string path_argument(const std::filesystem::path &path) {
  if (platform::current_os() == platform::Os::Windows) {
    return path.string();
  }
  return platform::unix_path_to_wine_z_path(path);
}
} // namespace

const std::vector<std::string> &controller_targets() {
  static const std::vector<std::string> targets = {
      "PAD_A",         "PAD_B",         "PAD_X",       "PAD_Y",
      "PAD_LB",        "PAD_RB",        "PAD_BACK",    "PAD_START",
      "PAD_LTHUMB",    "PAD_RTHUMB",    "PAD_DPAD_UP", "PAD_DPAD_DOWN",
      "PAD_DPAD_LEFT", "PAD_DPAD_RIGHT"};
  return targets;
}

std::vector<config::GoldMapperMapping> default_mappings() {
  std::vector<config::GoldMapperMapping> mappings;
  for (char letter = 'A'; letter <= 'Z'; ++letter) {
    push_key(mappings, std::string("KEY_") + letter);
  }
  for (int number = 0; number <= 9; ++number) {
    push_key(mappings, "KEY_" + std::to_string(number));
  }
  for (int function = 1; function <= 12; ++function) {
    push_key(mappings, "KEY_F" + std::to_string(function));
  }
  for (const char *key :
       {"KEY_SPACE",     "KEY_RETURN",   "KEY_ESCAPE",   "KEY_TAB",
        "KEY_BACKSPACE", "KEY_DELETE",   "KEY_INSERT",   "KEY_HOME",
        "KEY_END",       "KEY_PAGEUP",   "KEY_PAGEDOWN", "KEY_UP",
        "KEY_DOWN",      "KEY_LEFT",     "KEY_RIGHT",    "KEY_PRINTSCREEN",
        "KEY_PAUSE",     "KEY_CAPSLOCK", "KEY_NUMLOCK",  "KEY_SCROLLLOCK",
        "KEY_LSHIFT",    "KEY_RSHIFT",   "KEY_LCTRL",    "KEY_RCTRL",
        "KEY_LALT",      "KEY_RALT",     "KEY_LWIN",     "KEY_RWIN",
        "KEY_APPS"}) {
    push_key(mappings, key);
  }
  for (int number = 0; number <= 9; ++number) {
    push_key(mappings, "KEY_NUMPAD" + std::to_string(number));
  }
  for (const char *key :
       {"KEY_MULTIPLY", "KEY_ADD", "KEY_SUBTRACT", "KEY_DECIMAL", "KEY_DIVIDE",
        "KEY_SEMICOLON", "KEY_EQUALS", "KEY_COMMA", "KEY_MINUS", "KEY_PERIOD",
        "KEY_SLASH", "KEY_GRAVE", "KEY_LBRACKET", "KEY_BACKSLASH",
        "KEY_RBRACKET", "KEY_APOSTROPHE"}) {
    push_key(mappings, key);
  }
  for (const char *mouse : {"MOUSE_LEFT", "MOUSE_RIGHT", "MOUSE_MIDDLE"}) {
    push_key(mappings, mouse);
  }
  const std::vector<std::string> &targets = controller_targets();
  for (std::size_t index = 0; index < targets.size(); ++index) {
    mappings.push_back(config::GoldMapperMapping{
        "DINPUT_" + std::to_string(index), targets[index]});
  }
  return mappings;
}

std::filesystem::path
write_runtime_config(const config::AppConfig &config,
                     const std::filesystem::path &app_data_dir) {
  const std::filesystem::path directory = app_data_dir / "GoldMapper";
  core::ensure_directory(directory);
  const std::filesystem::path path = directory / "config.json";
  const std::vector<config::GoldMapperMapping> mappings =
      config.goldmapper_mappings.has_value() ? *config.goldmapper_mappings
                                             : default_mappings();
  Json array = Json::array();
  for (const config::GoldMapperMapping &mapping : mappings) {
    array.push_back(Json{{"from", mapping.from}, {"to", mapping.to}});
  }
  Json document = Json::object();
  document["mappings"] = std::move(array);
  core::write_file(path, document.dump());
  return path;
}

GoldMapperLaunch
build_goldmapper_arguments(const config::AppConfig &config,
                           const std::filesystem::path &resources_dir,
                           const std::filesystem::path &app_data_dir,
                           const std::filesystem::path &game_exe,
                           const std::vector<std::string> &extra_args) {
  GoldMapperLaunch launch;
  if (!config.goldmapper_enabled.value_or(true)) {
    return launch;
  }
  launch.enabled = true;
  const std::filesystem::path launcher =
      resources_dir / "GoldMapperLauncher.exe";
  if (!core::file_exists(launcher)) {
    launch.error = "GoldMapperLauncher.exe not found in resources";
    return launch;
  }
  const std::filesystem::path config_path =
      write_runtime_config(config, app_data_dir);

  launch.arguments.push_back(path_argument(launcher));
  launch.arguments.push_back(path_argument(config_path));
  launch.arguments.push_back(path_argument(game_exe));
  launch.arguments.insert(launch.arguments.end(), extra_args.begin(),
                          extra_args.end());
  return launch;
}
} // namespace emerald::launch
