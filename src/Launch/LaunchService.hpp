#pragma once
#include "Config/ConfigSchema.hpp"
#include "Config/ConfigStore.hpp"
#include "Instances/Runners.hpp"
#include "Launch/GameLauncher.hpp"
#include "Launch/MacosRuntime.hpp"
#include "Playtime/PlaytimeStore.hpp"
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::launch {
struct LaunchSnapshot {
  bool running = false;
  bool success = false;
  bool has_log = false;
  std::string instance_id;
  std::string message;
};

class LaunchService {
public:
  void configure(config::ConfigStore &config, playtime::PlaytimeStore &playtime,
                 const std::filesystem::path &resources_dir,
                 const std::filesystem::path &app_data_dir,
                 const std::filesystem::path &dlc_source,
                 const std::filesystem::path &skin_pck);

  bool start(const std::string &instance_id,
             const std::vector<config::McServer> &servers);
  void stop();
  void poll();
  bool running() const { return running_; }
  const std::string &running_instance() const { return active_instance_; }
  LaunchSnapshot snapshot() const;
  std::string last_log() const;
  bool has_log() const { return has_log_; }
  bool show_log() const { return show_log_; }
  void open_log();
  void dismiss_log();
  std::uint64_t revision() const { return revision_; }
  void clear_log();
  MacosRuntime &macos_runtime() { return macos_; }
  const MacosRuntime &macos_runtime() const { return macos_; }

private:
  config::ConfigStore *config_ = nullptr;
  playtime::PlaytimeStore *playtime_ = nullptr;
  std::filesystem::path resources_dir_;
  std::filesystem::path app_data_dir_;
  std::filesystem::path dlc_source_;
  std::filesystem::path skin_pck_;
  GameLauncher launcher_;
  MacosRuntime macos_;
  bool running_ = false;
  bool has_log_ = false;
  bool show_log_ = false;
  bool last_success_ = false;
  std::string active_instance_;
  std::string status_message_;
  std::uint64_t revision_ = 0;
};
} // namespace emerald::launch
