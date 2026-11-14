#include "Launch/LaunchPlan.hpp"
#include "Core/Fs.hpp"
#include "Launch/GoldMapper.hpp"
#include "Platform/Platform.hpp"
#include <cstdlib>
#include <utility>
namespace emerald::launch {
namespace {
std::string environment_value(const char *name) {
  const char *value = std::getenv(name);
  return value != nullptr ? std::string(value) : std::string();
}

bool environment_defined(const char *name) {
  return std::getenv(name) != nullptr;
}

void append_goldmapper(const config::AppConfig &config,
                       const LaunchContext &context,
                       std::vector<std::string> &arguments,
                       std::string &error) {
  const GoldMapperLaunch goldmapper = build_goldmapper_arguments(
      config, context.resources_dir, context.app_data_dir, context.game_exe,
      context.extra_args);
  if (goldmapper.enabled) {
    if (!goldmapper.error.empty()) {
      error = goldmapper.error;
      return;
    }
    arguments.insert(arguments.end(), goldmapper.arguments.begin(),
                     goldmapper.arguments.end());
    return;
  }
  arguments.push_back(context.game_exe.string());
  arguments.insert(arguments.end(), context.extra_args.begin(),
                   context.extra_args.end());
}

void apply_config_environment(const config::AppConfig &config,
                              LaunchPlan &plan) {
  if (config.launch_env_vars.has_value()) {
    for (const auto &[key, value] : *config.launch_env_vars) {
      plan.environment[key] = value;
    }
  }
}

bool build_linux_plan(const LaunchContext &context, LaunchPlan &plan,
                      std::string &error) {
  const config::AppConfig &config = context.config;
  if (!context.runner.has_value() || context.runner->path.empty()) {
    error = "No Linux runner selected in settings.";
    return false;
  }
  const instances::Runner &runner = *context.runner;
  const bool is_proton = instances::is_proton_runner(runner);
  std::string runner_program = instances::runner_program(runner);
  std::vector<std::string> arguments;
  if (is_proton) {
    arguments.push_back("run");
    const std::filesystem::path compat_data =
        context.instance_dir / "proton_prefix";
    core::ensure_directory(compat_data);
    plan.environment["STEAM_COMPAT_DATA_PATH"] = compat_data.string();
    if (!environment_defined("STEAM_COMPAT_CLIENT_INSTALL_PATH")) {
      plan.environment["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = "";
    }
    if (!environment_defined("SteamAppId")) {
      plan.environment["SteamAppId"] = "480";
    }
  }

  std::string program = runner_program;
  if (config.mangohud_enabled.value_or(false)) {
    arguments.insert(arguments.begin(), program);
    program = "mangohud";
  }

  append_goldmapper(config, context, arguments, error);
  if (!error.empty()) {
    return false;
  }

  apply_launch_prefix(config, program, arguments);
  plan.program = program;
  plan.arguments = std::move(arguments);
  plan.working_dir = context.instance_dir;
  plan.new_process_group = true;
  plan.remove_environment = {"LD_PRELOAD", "PYTHONPATH", "PYTHONHOME",
                             "LD_LIBRARY_PATH", "QT_PLUGIN_PATH"};
  apply_config_environment(config, plan);
  plan.environment["WINEDEBUG"] = "+debugstr";
  return true;
}

bool build_macos_plan(const LaunchContext &context, LaunchPlan &plan,
                      std::string &error) {
  const config::AppConfig &config = context.config;
  const std::filesystem::path runtime_dir = platform::macos_runtime_dir();
  const std::filesystem::path toolkit_dir = runtime_dir / "toolkit";
  const std::filesystem::path prefix_dir = runtime_dir / "prefix";
  if (!std::filesystem::is_directory(toolkit_dir) ||
      !std::filesystem::is_directory(prefix_dir)) {
    error = "macOS Compatibility is not set up. Open Settings and run Setup "
            "macOS Compatibility.";
    return false;
  }

  std::optional<std::filesystem::path> gptk_no_hud =
      platform::find_executable_recursive(toolkit_dir,
                                          "gameportingtoolkit-no-hud");
  if (!gptk_no_hud.has_value()) {
    gptk_no_hud =
        platform::find_executable_recursive(toolkit_dir, "gameportingtoolkit");
  }

#if defined(__x86_64__) || defined(_M_X64)
  const bool is_intel = true;
#else
  const bool is_intel = false;
#endif
  const std::optional<std::filesystem::path> primary =
      is_intel ? platform::find_executable_recursive(toolkit_dir, "wine")
               : platform::find_executable_recursive(toolkit_dir, "wine64");
  const std::optional<std::filesystem::path> secondary =
      is_intel ? platform::find_executable_recursive(toolkit_dir, "wine64")
               : platform::find_executable_recursive(toolkit_dir, "wine");
  const std::optional<std::filesystem::path> wine_binary =
      primary.has_value() ? primary : secondary;
  if (!wine_binary.has_value()) {
    error = "Unable to locate wine binary inside runtime.";
    return false;
  }
  const std::filesystem::path wine_bin_dir = wine_binary->parent_path();
  std::string program;
  std::vector<std::string> arguments;
  if (gptk_no_hud.has_value()) {
    program = gptk_no_hud->string();
    arguments.push_back(prefix_dir.string());
    arguments.push_back(platform::unix_path_to_wine_z_path(context.game_exe));
  } else {
    program = wine_binary->string();
    arguments.push_back(context.game_exe.string());
  }

  append_goldmapper(config, context, arguments, error);
  if (!error.empty()) {
    return false;
  }

  apply_launch_prefix(config, program, arguments);
  plan.program = program;
  plan.arguments = std::move(arguments);
  plan.working_dir = context.instance_dir;
  plan.new_process_group = true;
  apply_config_environment(config, plan);
  plan.environment["WINEPREFIX"] = prefix_dir.string();
  plan.environment["WINEDEBUG"] = "+debugstr";
  const bool perf_boost =
      config.apple_silicon_performance_boost.value_or(false);
  if (perf_boost) {
#if defined(__aarch64__) || defined(__arm64__) || defined(_M_ARM64)
    plan.environment["WINE_MSYNC"] = "1";
    plan.environment["MVK_ALLOW_METAL_FENCES"] = "1";
#else
    plan.environment["WINEESYNC"] = "1";
#endif
  } else {
    plan.environment["WINEESYNC"] = "1";
  }
  plan.environment["WINEDLLOVERRIDES"] =
      "winemenubuilder.exe=d;mscoree,mshtml=";
  plan.environment["MTL_HUD_ENABLED"] = "0";
  plan.environment["MVK_CONFIG_RESUME_LOST_DEVICE"] = "1";
  plan.environment["PATH"] =
      wine_bin_dir.string() + ":" + environment_value("PATH");
  return true;
}

bool build_generic_plan(const LaunchContext &context, LaunchPlan &plan,
                        std::string &error) {
  const config::AppConfig &config = context.config;
  std::string program;
  std::vector<std::string> arguments;
  const GoldMapperLaunch goldmapper = build_goldmapper_arguments(
      config, context.resources_dir, context.app_data_dir, context.game_exe,
      context.extra_args);
  if (goldmapper.enabled) {
    if (!goldmapper.error.empty()) {
      error = goldmapper.error;
      return false;
    }
    if (goldmapper.arguments.empty()) {
      error = "GoldMapper produced no arguments";
      return false;
    }
    program = goldmapper.arguments.front();
    arguments.assign(goldmapper.arguments.begin() + 1,
                     goldmapper.arguments.end());
  } else {
    program = context.game_exe.string();
    arguments = context.extra_args;
  }

  apply_launch_prefix(config, program, arguments);
  plan.program = program;
  plan.arguments = std::move(arguments);
  plan.working_dir = context.instance_dir;
  plan.new_process_group = true;
  plan.no_window = platform::current_os() == platform::Os::Windows;
  apply_config_environment(config, plan);
  return true;
}
} // namespace

std::vector<std::string>
instance_launch_arguments(const config::AppConfig &config,
                          const std::string &instance_id) {
  if (!config.instance_launch_args.has_value()) {
    return {};
  }
  const auto found = config.instance_launch_args->find(instance_id);
  if (found == config.instance_launch_args->end()) {
    return {};
  }
  return found->second.args;
}

void apply_launch_prefix(const config::AppConfig &config, std::string &program,
                         std::vector<std::string> &arguments) {
  if (!config.launch_prefix.has_value()) {
    return;
  }
  const std::string trimmed = *config.launch_prefix;
  std::size_t begin = trimmed.find_first_not_of(" \t");
  if (begin == std::string::npos) {
    return;
  }
  const std::size_t end = trimmed.find_last_not_of(" \t");
  const std::string text = trimmed.substr(begin, end - begin + 1);
  std::vector<std::string> parts;
  std::size_t position = 0;
  while (position < text.size()) {
    const std::size_t start = text.find_first_not_of(" \t", position);
    if (start == std::string::npos) {
      break;
    }
    const std::size_t stop = text.find_first_of(" \t", start);
    parts.push_back(text.substr(
        start, stop == std::string::npos ? std::string::npos : stop - start));
    if (stop == std::string::npos) {
      break;
    }
    position = stop + 1;
  }
  if (parts.empty()) {
    return;
  }

  std::vector<std::string> prefixed(parts.begin() + 1, parts.end());
  prefixed.push_back(program);
  prefixed.insert(prefixed.end(), arguments.begin(), arguments.end());
  program = parts.front();
  arguments = std::move(prefixed);
}

bool build_launch_plan(const LaunchContext &context, LaunchPlan &plan,
                       std::string &error) {
  error.clear();
  switch (platform::current_os()) {
  case platform::Os::Linux:
    return build_linux_plan(context, plan, error);
  case platform::Os::Macos:
    return build_macos_plan(context, plan, error);
  case platform::Os::Windows:
    break;
  }
  return build_generic_plan(context, plan, error);
}
} // namespace emerald::launch
