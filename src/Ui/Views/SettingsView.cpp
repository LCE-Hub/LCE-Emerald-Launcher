#include "Ui/Views/SettingsView.hpp"
#include "Audio/AudioEngine.hpp"
#include "Core/Log.hpp"
#include "Instances/Editions.hpp"
#include "Ui/EditionResolver.hpp"
#include "Ui/I18n.hpp"
#include <algorithm>
#include <cstdlib>
#include <numeric>
#include <unordered_map>
namespace emerald::ui {
namespace {
using Replacements = std::vector<std::pair<std::string, std::string>>;

std::string replace_all(std::string text, const Replacements &replacements) {
  for (const auto &[token, value] : replacements) {
    const std::string placeholder = "{{" + token + "}}";
    std::size_t position = 0;
    while ((position = text.find(placeholder, position)) != std::string::npos) {
      text.replace(position, placeholder.size(), value);
      position += value.size();
    }
  }
  return text;
}

bool starts_with(std::string_view text, std::string_view prefix) {
  return text.substr(0, prefix.size()) == prefix;
}

std::vector<std::string> split_whitespace(const std::string &text) {
  std::vector<std::string> result;
  std::size_t position = 0;
  while (position < text.size()) {
    while (position < text.size() &&
           (text[position] == ' ' || text[position] == '\t')) {
      ++position;
    }
    const std::size_t start = position;
    while (position < text.size() && text[position] != ' ' &&
           text[position] != '\t') {
      ++position;
    }
    if (position > start) {
      result.push_back(text.substr(start, position - start));
    }
  }
  return result;
}

std::string trimmed(std::string text) {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t')) {
    text.erase(text.begin());
  }
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t')) {
    text.pop_back();
  }
  return text;
}

Json row_button(std::string label, std::string onclick, bool cat = false,
                bool red = false) {
  Json row = Json::object();
  row["label"] = std::move(label);
  row["onclick"] = std::move(onclick);
  row["isButton"] = true;
  row["isCat"] = cat;
  row["isRed"] = red;
  row["rowClass"] = cat   ? std::string("settings-cat")
                    : red ? std::string("row-red")
                          : std::string();
  return row;
}

Json row_toggle(std::string label, bool state, std::string onclick) {
  Json row = Json::object();
  row["label"] = std::move(label);
  row["onclick"] = std::move(onclick);
  row["isToggle"] = true;
  row["state"] = state;
  row["checked"] = state;
  return row;
}

Json row_slider(std::string label, int value, std::string onchange) {
  Json row = Json::object();
  row["label"] = std::move(label);
  row["value"] = std::to_string(value);
  row["onchange"] = std::move(onchange);
  row["isSlider"] = true;
  return row;
}

Json row_text(std::string label, std::string value, std::string onsubmit) {
  Json row = Json::object();
  row["label"] = std::move(label);
  row["value"] = std::move(value);
  row["onsubmit"] = std::move(onsubmit);
  row["isText"] = true;
  return row;
}
} // namespace

std::string SettingsView::translate(const UiServices &services,
                                    std::string_view key) const {
  if (services.i18n == nullptr) {
    return std::string(key);
  }
  return services.i18n->translate(key);
}

std::string SettingsView::interpolate(const UiServices &services,
                                      std::string_view key,
                                      const Replacements &replacements) const {
  return replace_all(translate(services, key), replacements);
}

bool SettingsView::panel_layout() const {
  if (menu_ == Menu::Main) {
    return false;
  }
  if (menu_ == Menu::Launcher && launcher_sub_ == LauncherSub::None) {
    return false;
  }
  return true;
}

std::string SettingsView::modal_text(const UiServices &services,
                                     const std::string &fallback) const {
  if (services.text_edited && services.text_edited()) {
    return services.read_text_input();
  }
  return fallback;
}

void SettingsView::reset_focus(UiServices &services) const {
  if (services.reset_focus) {
    services.reset_focus();
  }
}

void SettingsView::on_enter() {
  menu_ = Menu::Main;
  launcher_sub_ = LauncherSub::None;
  modal_ = Modal::None;
}

bool SettingsView::on_escape(UiServices &services) {
  if (modal_ != Modal::None) {
    modal_ = Modal::None;
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    return true;
  }
  if (menu_ == Menu::Launcher && launcher_sub_ != LauncherSub::None) {
    launcher_sub_ = LauncherSub::None;
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    reset_focus(services);
    return true;
  }
  if (menu_ != Menu::Main) {
    menu_ = menu_ == Menu::Language ? Menu::Launcher : Menu::Main;
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    reset_focus(services);
    return true;
  }
  return false;
}

void SettingsView::go_back(UiServices &services) {
  if (menu_ == Menu::Main) {
    if (services.navigate) {
      services.navigate("home");
    }
    return;
  }
  if (menu_ == Menu::Launcher && launcher_sub_ != LauncherSub::None) {
    launcher_sub_ = LauncherSub::None;
  } else if (menu_ == Menu::Language) {
    menu_ = Menu::Launcher;
  } else {
    menu_ = Menu::Main;
  }
  reset_focus(services);
}

Json SettingsView::data(const UiServices &services) const {
  Json data = Json::object();
  data["titleImage"] = "/images/MenuTitle.png";
  data["username"] = "";
  data["profile"] = "legacy_evolved";
  data["language"] = "en";
  if (services.config != nullptr) {
    const config::AppConfig &config = services.config->data();
    const std::string profile = config.profile.value_or("legacy_evolved");
    data["username"] = config.username;
    data["profile"] = profile;
    data["language"] = config.language.value_or("en");
    const std::optional<instances::Edition> edition =
        find_config_edition(config, profile);
    if (edition.has_value() && !edition->title_image.empty()) {
      data["titleImage"] = edition->title_image;
    }
  }
  if (services.config == nullptr) {
    data["layout"] = "panel";
    data["items"] = Json::array();
    data["backAction"] = "settings.back";
    data["backLabel"] = translate(services, "common.back");
    return data;
  }
  const config::AppConfig &config = services.config->data();
  Json items = Json::array();
  std::string back_label = translate(services, "common.done");

  if (menu_ == Menu::Main) {
    items.push_back(row_button(translate(services, "settings.audio"),
                               "settings.menu:audio"));
    items.push_back(row_button(translate(services, "settings.launcher"),
                               "settings.menu:launcher"));
    items.push_back(
        row_button(translate(services, "settings.game"), "settings.menu:game"));
    items.push_back(row_button(translate(services, "settings.controls"),
                               "settings.menu:controls"));
    items.push_back(row_button(translate(services, "settings.android"),
                               "settings.menu:android"));
    items.push_back(row_button(translate(services, "settings.credits"),
                               "settings.menu:credits"));
  } else if (menu_ == Menu::Audio) {
    const int music = static_cast<int>(config.music_vol.value_or(50));
    const int sfx = static_cast<int>(config.sfx_vol.value_or(100));
    items.push_back(row_slider(interpolate(services, "settings.music",
                                           {{"value", std::to_string(music)}}),
                               music, "settings.music"));
    items.push_back(row_slider(interpolate(services, "settings.sound",
                                           {{"value", std::to_string(sfx)}}),
                               sfx, "settings.sfx"));
    std::string track = "Unknown - Unknown";
    if (services.audio != nullptr &&
        !services.audio->current_track_name().empty()) {
      track = services.audio->current_track_name() +
              " - C418"; // neo: yeah, C418 the goat
    }
    items.push_back(row_button(track, "settings.track"));
  } else if (menu_ == Menu::Game) {
    const std::string args =
        config.extra_launch_args.has_value() &&
                !config.extra_launch_args->empty()
            ? std::accumulate(config.extra_launch_args->begin(),
                              config.extra_launch_args->end(), std::string{},
                              [](std::string a, const std::string &b) {
                                return a.empty() ? a + b : a + " " + b;
                              })
            : translate(services, "common.none");
    items.push_back(row_button(
        interpolate(services, "settings.extraLaunchArgs", {{"value", args}}),
        "settings.modal:args"));
    const std::string prefix =
        config.launch_prefix.value_or(translate(services, "common.none"));
    items.push_back(row_button(
        interpolate(services, "settings.launchPrefix", {{"value", prefix}}),
        "settings.modal:prefix"));
    const int env_count = config.launch_env_vars.has_value()
                              ? static_cast<int>(config.launch_env_vars->size())
                              : 0;
    const std::string env_display = env_count > 0
                                        ? std::to_string(env_count) + " " +
                                              translate(services, "common.set")
                                        : translate(services, "common.none");
    items.push_back(row_button(interpolate(services, "settings.launchEnvVars",
                                           {{"value", env_display}}),
                               "settings.modal:envVars"));
  } else if (menu_ == Menu::Launcher) {
    if (launcher_sub_ == LauncherSub::None) {
      items.push_back(
          row_button(translate(services, "settings.launcherDisplay"),
                     "settings.cat:display", true));
      items.push_back(
          row_button(translate(services, "settings.launcherNetwork"),
                     "settings.cat:network", true));
      items.push_back(row_button(translate(services, "settings.launcherMisc"),
                                 "settings.cat:integrations", true));
      items.push_back(row_button(translate(services, "settings.launcherLinux"),
                                 "settings.cat:linux", true));
      items.push_back(row_button(translate(services, "settings.launcherData"),
                                 "settings.cat:data", true));
    } else if (launcher_sub_ == LauncherSub::Display) {
      items.push_back(
          row_toggle(translate(services, "settings.startInFullscreen"),
                     config.start_fullscreen.value_or(false),
                     "settings.toggle:fullscreen"));
      items.push_back(row_toggle(translate(services, "settings.animations"),
                                 config.animations_enabled.value_or(true),
                                 "settings.toggle:animations"));
      items.push_back(row_toggle(translate(services, "settings.clickEffects"),
                                 config.vfx_enabled.value_or(true),
                                 "settings.toggle:vfx"));
      items.push_back(row_toggle(translate(services, "settings.skipIntro"),
                                 config.skip_intro.value_or(false),
                                 "settings.toggle:skipintro"));
      items.push_back(row_toggle(translate(services, "settings.legacyMode"),
                                 config.legacy_mode.value_or(false),
                                 "settings.toggle:legacy"));
    } else if (launcher_sub_ == LauncherSub::Network) {
      items.push_back(row_text(translate(services, "settings.httpProxy"),
                               config.http_proxy.value_or(""),
                               "settings.proxy"));
    } else if (launcher_sub_ == LauncherSub::Integrations) {
      items.push_back(row_toggle(translate(services, "settings.discordRpc"),
                                 config.rpc_enabled.value_or(true),
                                 "settings.toggle:rpc"));
      items.push_back(row_button(translate(services, "settings.languages"),
                                 "settings.menu:language", true));
    } else if (launcher_sub_ == LauncherSub::Linux) {
      items.push_back(row_button(interpolate(services, "settings.runner",
                                             {{"value", "Native / Default"}}),
                                 "settings.runner"));
      items.push_back(row_toggle(translate(services, "settings.mangohud"),
                                 config.mangohud_enabled.value_or(false),
                                 "settings.toggle:mangohud"));
      items.push_back(row_button(translate(services, "settings.downloadRunner"),
                                 "settings.downloadRunner", true));
    } else if (launcher_sub_ == LauncherSub::Data) {
      items.push_back(row_button(translate(services, "settings.exportSettings"),
                                 "settings.export", true));
      items.push_back(row_button(translate(services, "settings.importSettings"),
                                 "settings.import", true));
      items.push_back(row_button(translate(services, "settings.resetSetup"),
                                 "settings.reset:1", false, true));
    }
  } else if (menu_ == Menu::Language) {
    const std::string current = config.language.value_or("en");
    std::vector<std::pair<std::string, std::string>> languages = {
        {"en", "English"},
        {"fr", "Français (French)"},
        {"ru", "Pусский (Russian)"},
    };
    for (const auto &[code, label] : languages) {
      const bool active = current.rfind(code, 0) == 0;
      items.push_back(row_button(label + ":" + (active ? " ON" : " OFF"),
                                 "settings.lang:" + code));
    }
  } else if (menu_ == Menu::Android) {
    items.push_back(
        row_button(translate(services, "settings.containerSettings"),
                   "settings.androidContainer"));
    items.push_back(row_button(translate(services, "settings.openContainer"),
                               "settings.androidOpen"));
    items.push_back(row_button(
        interpolate(services, "settings.androidAudio",
                    {{"backend", config.android_audio_backend.value_or(
                                     "pulseaudio") == "alsa"
                                     ? "ALSA"
                                     : "PulseAudio (Default)"}}),
        "settings.androidAudio"));
  }

  if (menu_ != Menu::Main) {
    back_label = translate(services, "common.back");
  }
  items.push_back(row_button(back_label, "settings.back"));

  const bool panel = panel_layout();
  data["layout"] = panel ? "panel" : "main";
  data["mainLayout"] = !panel;
  data["panelLayout"] = panel;
  data["items"] = std::move(items);
  data["argsModal"] = modal_ == Modal::Args;
  data["prefixModal"] = modal_ == Modal::Prefix;
  data["envModal"] = modal_ == Modal::EnvVars;
  data["resetModal"] = modal_ == Modal::ResetA;
  data["resetFinalModal"] = modal_ == Modal::ResetB;
  data["argsValue"] = args_buffer_;
  data["prefixValue"] = prefix_buffer_;
  data["envValue"] = env_buffer_;
  data["extraArgsDesc"] = translate(services, "settings.extraLaunchArgsDesc");
  data["launchPrefixDesc"] = translate(services, "settings.launchPrefixDesc");
  data["launchEnvVarsDesc"] = translate(services, "settings.launchEnvVarsDesc");
  data["cancelLabel"] = translate(services, "common.cancel");
  data["saveLabel"] = translate(services, "common.save");
  data["okLabel"] = translate(services, "common.ok");
  data["backLabel"] = back_label;
  return data;
}

bool SettingsView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }
  config::AppConfig &config = services.config->data();

  if (name == "settings.back") {
    go_back(services);
    return true;
  }

  if (starts_with(name, "settings.menu:")) {
    const std::string menu = std::string(name.substr(14));
    if (menu == "audio") {
      menu_ = Menu::Audio;
      reset_focus(services);
      return true;
    }
    if (menu == "launcher") {
      menu_ = Menu::Launcher;
      reset_focus(services);
      return true;
    }
    if (menu == "game") {
      menu_ = Menu::Game;
      reset_focus(services);
      return true;
    }
    if (menu == "language") {
      menu_ = Menu::Language;
      reset_focus(services);
      return true;
    }
    if (menu == "android") {
      menu_ = Menu::Android;
      reset_focus(services);
      return true;
    }
    if (menu == "credits") {
      if (services.navigate) {
        services.navigate("credits");
      }
      return true;
    }
    core::info(std::string{"settings: not implemented -> "} +
               std::string(name));
    return true;
  }

  if (starts_with(name, "settings.cat:")) {
    const std::string sub = std::string(name.substr(13));
    if (sub == "display") {
      launcher_sub_ = LauncherSub::Display;
    } else if (sub == "network") {
      launcher_sub_ = LauncherSub::Network;
    } else if (sub == "integrations") {
      launcher_sub_ = LauncherSub::Integrations;
    } else if (sub == "linux") {
      launcher_sub_ = LauncherSub::Linux;
    } else if (sub == "data") {
      launcher_sub_ = LauncherSub::Data;
    } else {
      return false;
    }
    reset_focus(services);
    return true;
  }

  if (starts_with(name, "settings.toggle:")) {
    const std::string which = std::string(name.substr(16));
    if (which == "rpc") {
      config.rpc_enabled = !config.rpc_enabled.value_or(true);
    } else if (which == "animations") {
      config.animations_enabled = !config.animations_enabled.value_or(true);
    } else if (which == "vfx") {
      config.vfx_enabled = !config.vfx_enabled.value_or(true);
    } else if (which == "fullscreen") {
      config.start_fullscreen = !config.start_fullscreen.value_or(false);
    } else if (which == "legacy") {
      config.legacy_mode = !config.legacy_mode.value_or(false);
    } else if (which == "mangohud") {
      config.mangohud_enabled = !config.mangohud_enabled.value_or(false);
    } else if (which == "skipintro") {
      config.skip_intro = !config.skip_intro.value_or(false);
    } else if (which == "perf") {
      config.apple_silicon_performance_boost =
          !config.apple_silicon_performance_boost.value_or(false);
    } else {
      return false;
    }
    services.config->save();
    return true;
  }

  if (starts_with(name, "settings.music:")) {
    const int value =
        std::clamp(std::atoi(std::string(name.substr(15)).c_str()), 0, 100);
    config.music_vol = static_cast<std::uint32_t>(value);
    if (services.audio != nullptr) {
      services.audio->set_music_volume(static_cast<std::uint32_t>(value));
    }
    services.config->save();
    return true;
  }
  if (starts_with(name, "settings.sfx:")) {
    const int value =
        std::clamp(std::atoi(std::string(name.substr(13)).c_str()), 0, 100);
    config.sfx_vol = static_cast<std::uint32_t>(value);
    if (services.audio != nullptr) {
      services.audio->set_sfx_volume(static_cast<std::uint32_t>(value));
      services.audio->play_press();
    }
    services.config->save();
    return true;
  }
  if (name == "settings.track") {
    if (services.audio != nullptr) {
      services.audio->skip_track(1);
    }
    return true;
  }

  if (name == "settings.proxy") {
    const std::string value =
        trimmed(modal_text(services, config.http_proxy.value_or("")));
    if (value.empty()) {
      config.http_proxy.reset();
    } else {
      config.http_proxy = value;
    }
    services.config->save();
    return true;
  }

  if (starts_with(name, "settings.modal:")) {
    const std::string which = std::string(name.substr(15));
    if (which == "args") {
      args_buffer_ =
          config.extra_launch_args.has_value()
              ? std::accumulate(config.extra_launch_args->begin(),
                                config.extra_launch_args->end(), std::string{},
                                [](std::string a, const std::string &b) {
                                  return a.empty() ? a + b : a + " " + b;
                                })
              : "";
      modal_ = Modal::Args;
    } else if (which == "prefix") {
      prefix_buffer_ = config.launch_prefix.value_or("");
      modal_ = Modal::Prefix;
    } else if (which == "envVars") {
      env_buffer_.clear();
      if (config.launch_env_vars.has_value()) {
        for (const auto &[key, value] : *config.launch_env_vars) {
          env_buffer_ += key + "=" + value + "\n";
        }
      }
      modal_ = Modal::EnvVars;
    } else {
      return false;
    }
    return true;
  }

  if (starts_with(name, "settings.modal.save:")) {
    const std::string which = std::string(name.substr(20));
    if (which == "args") {
      const std::string value = trimmed(modal_text(services, args_buffer_));
      if (value.empty()) {
        config.extra_launch_args.reset();
      } else {
        config.extra_launch_args = split_whitespace(value);
      }
    } else if (which == "prefix") {
      const std::string value = trimmed(modal_text(services, prefix_buffer_));
      if (value.empty()) {
        config.launch_prefix.reset();
      } else {
        config.launch_prefix = value;
      }
    } else if (which == "envVars") {
      const std::string value = modal_text(services, env_buffer_);
      if (trimmed(value).empty()) {
        config.launch_env_vars.reset();
      } else {
        std::unordered_map<std::string, std::string> vars;
        std::string line;
        for (const char character : value) {
          if (character == '\n') {
            const std::size_t equal = line.find('=');
            if (equal != std::string::npos && equal > 0) {
              vars[trimmed(line.substr(0, equal))] =
                  trimmed(line.substr(equal + 1));
            }
            line.clear();
          } else {
            line += character;
          }
        }
        if (!line.empty()) {
          const std::size_t equal = line.find('=');
          if (equal != std::string::npos && equal > 0) {
            vars[trimmed(line.substr(0, equal))] =
                trimmed(line.substr(equal + 1));
          }
        }
        if (vars.empty()) {
          config.launch_env_vars.reset();
        } else {
          config.launch_env_vars = std::move(vars);
        }
      }
    } else {
      return false;
    }
    modal_ = Modal::None;
    services.config->save();
    return true;
  }

  if (name == "settings.modal.cancel") {
    modal_ = Modal::None;
    return true;
  }

  if (name == "settings.reset:1") {
    modal_ = Modal::ResetA;
    return true;
  }
  if (name == "settings.reset:ok") {
    modal_ = Modal::ResetB;
    return true;
  }
  if (name == "settings.reset:cancel") {
    modal_ = Modal::None;
    return true;
  }
  if (name == "settings.reset:final") {
    modal_ = Modal::None;
    config::AppConfig fresh;
    fresh.setup_completed = false;
    config = std::move(fresh);
    services.config->save();
    menu_ = Menu::Main;
    launcher_sub_ = LauncherSub::None;
    if (services.navigate) {
      services.navigate("home");
    }
    return true;
  }

  if (starts_with(name, "settings.lang:")) {
    const std::string language = std::string(name.substr(14));
    config.language = language;
    services.config->save();
    if (services.change_language) {
      services.change_language(language);
    }
    return true;
  }

  core::info(std::string{"settings: not implemented -> "} + std::string(name));
  return true;
}
} // namespace emerald::ui