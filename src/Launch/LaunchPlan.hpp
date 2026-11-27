#pragma once
#include "Config/ConfigSchema.hpp"
#include "Instances/Runners.hpp"
#include <filesystem>
#include <map>
#include <optional>
#include <string>
#include <vector>
namespace emerald::launch {
struct LaunchPlan {
  std::string program;
  std::vector<std::string> arguments;
  std::map<std::string, std::string> environment;
  std::vector<std::string> remove_environment;
  std::filesystem::path working_dir;
  bool new_process_group = true;
  bool no_window = false;
};

struct LaunchContext {
  config::AppConfig config;
  std::optional<instances::Runner> runner;
  std::filesystem::path instance_dir;
  std::filesystem::path game_exe;
  std::filesystem::path resources_dir;
  std::filesystem::path app_data_dir;
  std::vector<std::string> extra_args;
};

bool build_launch_plan(const LaunchContext &context, LaunchPlan &plan,
                       std::string &error);

std::vector<std::string>
instance_launch_arguments(const config::AppConfig &config,
                          const std::string &instance_id);

void apply_launch_prefix(const config::AppConfig &config, std::string &program,
                         std::vector<std::string> &arguments);
} // namespace emerald::launch
