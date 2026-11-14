#pragma once
#include "Config/ConfigSchema.hpp"
#include "Instances/Editions.hpp"
#include "lazuli/Notifications.hpp"
#include <atomic>
#include <cstdint>
#include <mutex>
#include <set>
#include <string>
#include <string_view>
#include <thread>
#include <vector>
namespace emerald::instances {
struct PendingNotification {
  std::string title_key;
  std::string message;
  std::string default_title;
  lazuli::ToastVariant variant = lazuli::ToastVariant::Update;
  std::string on_click;
};

class UpdateChecker {
public:
  UpdateChecker();
  ~UpdateChecker();
  UpdateChecker(const UpdateChecker &) = delete;
  UpdateChecker &operator=(const UpdateChecker &) = delete;
  UpdateChecker(UpdateChecker &&) = delete;
  UpdateChecker &operator=(UpdateChecker &&) = delete;
  void start(const config::AppConfig &config,
             const std::vector<Edition> &editions);
  void stop();
  bool has_update(std::string_view edition_id) const;
  void clear_update(std::string_view edition_id);
  std::vector<PendingNotification> drain_notifications();
  std::uint64_t revision() const;

private:
  void run(config::AppConfig config, std::vector<Edition> editions);
  mutable std::mutex mutex_;
  std::thread worker_;
  std::atomic<bool> cancelled_{false};
  std::set<std::string> updates_available_;
  std::vector<PendingNotification> pending_notifications_;
  std::uint64_t revision_ = 0;
};
}
