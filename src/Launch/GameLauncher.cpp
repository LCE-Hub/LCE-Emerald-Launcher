#include "Launch/GameLauncher.hpp"
#include "Platform/Platform.hpp"
#include <string>
#include <vector>
namespace emerald::launch {
bool game_exited_ok(const std::string &log, int exit_code) {
  if (platform::current_os() == platform::Os::Windows) {
    return exit_code == 0;
  }
  std::vector<std::string> lines;
  std::size_t position = 0;
  while (position < log.size()) {
    const std::size_t newline = log.find('\n', position);
    lines.push_back(log.substr(position, newline == std::string::npos
                                             ? std::string::npos
                                             : newline - position));
    if (newline == std::string::npos) {
      break;
    }
    position = newline + 1;
  }
  const std::size_t last = lines.size() > 3 ? lines.size() - 3 : 0;
  for (std::size_t index = last; index < lines.size(); ++index) {
    if (lines[index].find("AppPolicyGetProcessTerminationMethod") !=
        std::string::npos) {
      return true;
    }
  }
  return false;
}

bool GameLauncher::start(const LaunchPlan &plan, const std::string &instance_id,
                         std::string &error) {
  manual_stop_ = false;
  has_result_ = false;
  last_success_ = false;
  last_exit_code_ = 0;
  platform::ProcessSpec spec;
  spec.program = plan.program;
  spec.arguments = plan.arguments;
  spec.working_dir = plan.working_dir;
  spec.environment = plan.environment;
  spec.remove_environment = plan.remove_environment;
  spec.new_process_group = plan.new_process_group;
  spec.no_window = plan.no_window;
  if (!process_.spawn(spec, error)) {
    return false;
  }
  instance_id_ = instance_id;
  working_dir_ = plan.working_dir;
  return true;
}

bool GameLauncher::running() const {
  return process_.started() && process_.running();
}

bool GameLauncher::poll() {
  if (!process_.started() || has_result_) {
    return false;
  }
  int exit_code = 0;
  if (!process_.poll(exit_code)) {
    return false;
  }
  last_exit_code_ = exit_code;
  const std::string output = process_.log();
  last_success_ = manual_stop_ || game_exited_ok(output, exit_code);
  has_result_ = true;
  return true;
}

void GameLauncher::stop() {
  manual_stop_ = true;
  if (process_.started() && process_.running()) {
    if (!working_dir_.empty()) {
      platform::kill_process_tree(working_dir_);
    }
    process_.terminate();
  }
}

std::string GameLauncher::log() const { return process_.log(); }
} // namespace emerald::launch
