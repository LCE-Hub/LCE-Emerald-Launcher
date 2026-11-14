#pragma once
#include "Config/ConfigStore.hpp"
#include <atomic>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
namespace discord_ipc_cpp {
class DiscordIPCClient;
}

namespace emerald::integrations {
struct DiscordState {
  bool enabled = true;
  bool running = false;
  bool multiplayer = false;
  std::string username;
  std::string view;
  std::string version_name;
  std::string instance_id;
  std::string instance_logo;
  std::string downloading_id;
  std::string downloading_name;
  int download_percent = 0;
  int downloading_count = 0;
};

class DiscordRpc {
public:
  DiscordRpc();
  ~DiscordRpc();
  DiscordRpc(const DiscordRpc &) = delete;
  DiscordRpc &operator=(const DiscordRpc &) = delete;
  DiscordRpc(DiscordRpc &&) = delete;
  DiscordRpc &operator=(DiscordRpc &&) = delete;
  void configure(const config::ConfigStore &config);
  void update(const DiscordState &state);
  void shutdown();

private:
  void run();
  bool ensure_started();
  void stop_client();
  void refresh(const DiscordState &state);
  std::unique_ptr<discord_ipc_cpp::DiscordIPCClient> client_;
  bool started_ = false;
  uint64_t start_time_ = 0;
  std::thread worker_;
  std::atomic<bool> running_{false};
  std::atomic<bool> stop_{false};
  std::atomic<bool> enabled_{true};
  std::mutex state_mutex_;
  DiscordState pending_state_;
};
} // namespace emerald::integrations
