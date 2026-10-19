#pragma once
#include "Config/ConfigSchema.hpp"
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::launch {
std::vector<config::GoldMapperMapping> default_mappings();
const std::vector<std::string> &controller_targets();
std::filesystem::path
write_runtime_config(const config::AppConfig &config,
                     const std::filesystem::path &app_data_dir);

struct GoldMapperLaunch {
  bool enabled = false;
  std::vector<std::string> arguments;
  std::string error;
};

GoldMapperLaunch
build_goldmapper_arguments(const config::AppConfig &config,
                           const std::filesystem::path &resources_dir,
                           const std::filesystem::path &app_data_dir,
                           const std::filesystem::path &game_exe,
                           const std::vector<std::string> &extra_args);
} // namespace emerald::launch
