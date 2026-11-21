#pragma once
#include "Instances/DownloadManager.hpp"
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
namespace emerald::instances {
class RunnerDownloader {
public:
  RunnerDownloader() = default;
  ~RunnerDownloader();
  RunnerDownloader(const RunnerDownloader &) = delete;
  RunnerDownloader &operator=(const RunnerDownloader &) = delete;
  void set_report_target(DownloadManager *target) { report_ = target; }
  bool start(const std::string &name, const std::string &url);
  void cancel();
  void shutdown();
  bool active() const;
  std::optional<double> percent() const;
  std::string error() const;
  std::uint64_t revision() const;

private:
  struct Job;
  void set_percent(const std::shared_ptr<Job> &job, double value);
  DownloadManager *report_target() const;
  mutable std::mutex mutex_;
  std::shared_ptr<Job> job_;
  DownloadManager *report_ = nullptr;
  std::string report_id_;
  std::uint64_t revision_ = 0;
};
} // namespace emerald::instances
