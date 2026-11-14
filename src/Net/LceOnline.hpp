#pragma once
#include "Config/ConfigStore.hpp"
#include "Net/HttpClient.hpp"
#include "Net/LceRelay.hpp"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <thread>
#include <vector>
namespace emerald::lce {
struct SocialEntry {
  std::string username;
  std::string display_name;
};

struct InviteEntry {
  std::string id;
  std::string from_username;
  std::string from_display;
};

struct AcceptedInvite {
  std::string invite_id;
  std::string from;
  std::string session;
};

struct LceSessionState {
  bool signed_in = false;
  std::string token;
  std::string username;
  std::string display_name;
};

struct LceSnapshot {
  bool signed_in = false;
  std::string username;
  std::string display_name;
  bool hosting = false;
  bool busy = false;
  std::string error;
  std::vector<SocialEntry> friends;
  std::vector<SocialEntry> requests;
  std::vector<InviteEntry> invites;
  std::optional<AcceptedInvite> accepted_invite;
};

struct LceNotification {
  enum class Kind { FriendRequest, Invite };
  Kind kind = Kind::FriendRequest;
  std::string name;
};

class LceOnlineService {
public:
  LceOnlineService() = default;
  ~LceOnlineService();
  LceOnlineService(const LceOnlineService &) = delete;
  LceOnlineService &operator=(const LceOnlineService &) = delete;
  void configure(config::ConfigStore &config);
  LceSnapshot snapshot() const;
  std::uint64_t revision() const;
  std::vector<LceNotification> drain_notifications();
  std::optional<LceSessionState> consume_session();
  void kick();
  void login(const std::string &username, const std::string &password);
  void register_account(const std::string &username,
                        const std::string &password);
  void logout();
  void send_request(const std::string &target);
  void accept_request(const std::string &from);
  void decline_request(const std::string &from);
  void remove_friend(const std::string &from);
  void send_invite(const std::string &target);
  void accept_invite(const std::string &from, const std::string &invite_id);
  void decline_invite(const std::string &from);
  void clear_accepted_invite();
  void dismiss_error();
  void start_hosting();
  void stop_hosting();
  bool start_join(const std::string &target_session, std::string &error);
  LceRelay &relay() { return relay_; }

private:
  void post(std::function<void()> job);
  void post_busy(std::function<void()> job);
  void run_worker();
  void refresh_now();
  void apply_session(const LceSessionState &session);
  void set_error(const std::string &message);
  void bump();
  config::ConfigStore *config_ = nullptr;
  net::HttpClient client_;
  LceRelay relay_;
  mutable std::mutex mutex_;
  LceSnapshot snapshot_;
  LceSessionState session_;
  bool session_dirty_ = false;
  std::set<std::string> seen_requests_;
  std::set<std::string> seen_invites_;
  bool seeded_ = false;
  std::vector<LceNotification> pending_notifications_;
  std::uint64_t revision_ = 0;
  std::mutex job_mutex_;
  std::condition_variable job_cv_;
  std::deque<std::function<void()>> jobs_;
  std::thread worker_;
  std::atomic<bool> stopping_{false};
  std::atomic<bool> worker_started_{false};
  std::optional<std::chrono::steady_clock::time_point> last_refresh_;
};
} // namespace emerald::lce
