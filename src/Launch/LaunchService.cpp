#include "Launch/LaunchService.hpp"
#include "Core/Fs.hpp"
#include "Core/Log.hpp"
#include "Instances/InstanceManager.hpp"
#include "Instances/InstanceSync.hpp"
#include "Launch/LaunchPlan.hpp"
#include "Launch/Servers.hpp"
#include "Platform/Platform.hpp"
#include <algorithm>
namespace emerald::launch {
namespace {
bool contains_endpoint(const std::vector<config::McServer> &servers,
                       const config::McServer &server) {
  return std::any_of(servers.begin(), servers.end(),
                     [&server](const config::McServer &candidate) {
                       return candidate.ip == server.ip &&
                              candidate.port == server.port;
                     });
}
} // namespace

void LaunchService::configure(config::ConfigStore &config,
                              playtime::PlaytimeStore &playtime,
                              const std::filesystem::path &resources_dir,
                              const std::filesystem::path &app_data_dir,
                              const std::filesystem::path &dlc_source,
                              const std::filesystem::path &skin_pck) {
  config_ = &config;
  playtime_ = &playtime;
  resources_dir_ = resources_dir;
  app_data_dir_ = app_data_dir;
  dlc_source_ = dlc_source;
  skin_pck_ = skin_pck;
}

bool LaunchService::start(const std::string &instance_id,
                          const std::vector<config::McServer> &servers) {
  if (running_) {
    return false;
  }
  if (config_ == nullptr) {
    status_message_ = "Launcher is not ready";
    return false;
  }

  const config::AppConfig &config = config_->data();
  const instances::InstanceManager instance_manager(config);
  const std::filesystem::path working_dir =
      instance_manager.working_dir(instance_id);
  const std::filesystem::path game_exe =
      working_dir / std::string(instances::kExecutableMarker);
  if (!core::file_exists(game_exe)) {
    status_message_ = "Game executable not found in instance folder.";
    return false;
  }

  instances::sync_instance(working_dir, config.username, dlc_source_,
                           skin_pck_);

  std::vector<config::McServer> merged = servers;
  const std::vector<config::McServer> lce = lce_online_server();
  for (const config::McServer &server : lce) {
    if (!contains_endpoint(merged, server)) {
      merged.push_back(server);
    }
  }
  if (config.saved_servers.has_value()) {
    for (const config::McServer &server : *config.saved_servers) {
      if (!contains_endpoint(merged, server)) {
        merged.push_back(server);
      }
    }
  }
  ensure_server_list(working_dir, merged);
  LaunchContext context;
  context.config = config;
  context.instance_dir = working_dir;
  context.game_exe = game_exe;
  context.resources_dir = resources_dir_;
  context.app_data_dir = app_data_dir_;
  context.extra_args =
      config.extra_launch_args.value_or(std::vector<std::string>{});
  const std::vector<std::string> instance_args =
      instance_launch_arguments(config, instance_id);
  context.extra_args.insert(context.extra_args.end(), instance_args.begin(),
                            instance_args.end());

  if (platform::current_os() == platform::Os::Linux &&
      config.linux_runner.has_value()) {
    instances::RunnerManager runners;
    for (const instances::Runner &runner : runners.available()) {
      if (runner.id == *config.linux_runner) {
        context.runner = runner;
        break;
      }
    }
  }

  LaunchPlan plan;
  std::string error;
  if (!build_launch_plan(context, plan, error)) {
    status_message_ = error;
    return false;
  }

  if (!launcher_.start(plan, instance_id, error)) {
    status_message_ = error;
    return false;
  }

  if (playtime_ != nullptr) {
    playtime_->start_active_session(instance_id);
  }
  running_ = true;
  has_log_ = false;
  show_log_ = false;
  last_success_ = false;
  active_instance_ = instance_id;
  status_message_.clear();
  ++revision_;
  return true;
}

void LaunchService::stop() {
  if (!running_) {
    return;
  }
  launcher_.stop();
  if (playtime_ != nullptr) {
    playtime_->finish_active_session();
  }
  running_ = false;
  has_log_ = true;
  last_success_ = true;
  status_message_.clear();
  ++revision_;
}

void LaunchService::poll() {
  if (!running_) {
    return;
  }
  if (!launcher_.poll()) {
    return;
  }
  if (playtime_ != nullptr) {
    playtime_->finish_active_session();
  }
  has_log_ = true;
  last_success_ = launcher_.last_success();
  if (!last_success_) {
    status_message_ =
        "The game exited unexpectedly. Check the crash log for details.";
    show_log_ = true;
  } else {
    status_message_.clear();
  }
  running_ = false;
  ++revision_;
}

LaunchSnapshot LaunchService::snapshot() const {
  LaunchSnapshot snapshot;
  snapshot.running = running_;
  snapshot.success = last_success_;
  snapshot.has_log = has_log_;
  snapshot.instance_id = active_instance_;
  snapshot.message = status_message_;
  return snapshot;
}

std::string LaunchService::last_log() const { return launcher_.log(); }
void LaunchService::open_log() {
  show_log_ = true;
  ++revision_;
}

void LaunchService::dismiss_log() {
  show_log_ = false;
  status_message_.clear();
  ++revision_;
}

void LaunchService::clear_log() {
  has_log_ = false;
  show_log_ = false;
  status_message_.clear();
  ++revision_;
}
} // namespace emerald::launch
