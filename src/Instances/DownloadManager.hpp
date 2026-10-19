#pragma once
#include "Net/HttpClient.hpp"
#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
namespace emerald::instances {
enum class DownloadState {
  idle,
  running,
  finished,
  cancelled,
  failed,
};

struct DownloadSnapshot {
  DownloadState state = DownloadState::idle;
  double percent = 0.0;
  int retry_attempt = 0;
  std::string message;
  bool active() const { return state == DownloadState::running; }
};

struct DownloadRequest {
  std::string instance_id;
  std::string url;
  std::filesystem::path instance_dir;
  std::filesystem::path archive_dir;
  std::optional<std::string> proxy;
  std::string username;
  std::filesystem::path dlc_source;
  std::filesystem::path skin_pck;
};

class DownloadManager {
public:
  DownloadManager() = default;
  ~DownloadManager();
  DownloadManager(const DownloadManager &) = delete;
  DownloadManager &operator=(const DownloadManager &) = delete;
  bool start(const DownloadRequest &request);
  void cancel(const std::string &instance_id);
  void clear(const std::string &instance_id);
  DownloadSnapshot snapshot(const std::string &instance_id) const;
  bool is_active(const std::string &instance_id) const;
  std::vector<std::string> active_ids() const;
  uint64_t revision() const;
  void shutdown();

private:
  struct Job;
  void touch(const std::string &instance_id, const DownloadSnapshot &snapshot);
  void finish(const std::string &instance_id, const DownloadSnapshot &snapshot);
  mutable std::mutex mutex_;
  std::map<std::string, std::shared_ptr<Job>> jobs_;
  uint64_t revision_ = 0;
};
} // namespace emerald::instances