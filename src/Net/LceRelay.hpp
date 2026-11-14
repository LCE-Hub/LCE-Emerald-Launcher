#pragma once
#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
namespace emerald::lce {
class LceRelay {
public:
  LceRelay() = default;
  ~LceRelay();
  LceRelay(const LceRelay &) = delete;
  LceRelay &operator=(const LceRelay &) = delete;
  void start_host(const std::string &auth_token, std::uint16_t game_port);
  bool start_join(const std::string &auth_token,
                  const std::string &target_session, std::string &error);
  void stop_all();
  bool active() const;
  bool host_running() const;
  bool join_listening() const;
  std::string last_error() const;
private:
  void run_host(std::string token, std::uint16_t game_port);
  void run_join(std::string token, std::string session);
  void set_error(const std::string &message);
  void track(std::intptr_t socket);
  void untrack(std::intptr_t socket);
  std::vector<std::thread> workers_;
  std::atomic<bool> stopping_{false};
  std::atomic<int> host_running_{0};
  std::atomic<int> join_listening_{0};
  std::atomic<int> active_{0};
  mutable std::mutex error_mutex_;
  std::string last_error_;
  std::mutex sockets_mutex_;
  std::vector<std::intptr_t> sockets_;
};
} // namespace emerald::lce
