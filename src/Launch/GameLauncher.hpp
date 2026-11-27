#pragma once
#include "Launch/LaunchPlan.hpp"
#include "Platform/Process.hpp"
#include <filesystem>
#include <string>
namespace emerald::launch {
bool game_exited_ok(const std::string &log, int exit_code);
class GameLauncher {
public:
  bool start(const LaunchPlan &plan, const std::string &instance_id,
             std::string &error);
  bool running() const;
  bool poll();
  void stop();
  const std::string &instance_id() const { return instance_id_; }
  bool has_result() const { return has_result_; }
  bool last_success() const { return last_success_; }
  int last_exit_code() const { return last_exit_code_; }
  bool manual_stop() const { return manual_stop_; }
  std::string log() const;

private:
  platform::Process process_;
  std::string instance_id_;
  std::filesystem::path working_dir_;
  bool manual_stop_ = false;
  bool has_result_ = false;
  bool last_success_ = false;
  int last_exit_code_ = 0;
};
} // namespace emerald::launch
