#include "Instances/DownloadManager.hpp"
#include "Core/Log.hpp"
#include "Instances/Installer.hpp"
#include "Instances/InstanceSync.hpp"
#include <atomic>
namespace emerald::instances {
struct DownloadManager::Job {
  net::CancelToken token;
  std::atomic<bool> finished{false};
  std::thread worker;
  DownloadSnapshot snapshot;
};

DownloadManager::~DownloadManager() { shutdown(); }
void DownloadManager::shutdown() {
  std::map<std::string, std::shared_ptr<Job>> jobs;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    jobs.swap(jobs_);
  }
  for (auto &[id, job] : jobs) {
    job->token.cancel();
  }
  for (auto &[id, job] : jobs) {
    if (job->worker.joinable()) {
      job->worker.join();
    }
  }
}

uint64_t DownloadManager::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

bool DownloadManager::start(const DownloadRequest &request) {
  if (request.instance_id.empty() || request.url.empty()) {
    return false;
  }

  auto job = std::make_shared<Job>();
  job->snapshot.state = DownloadState::running;
  job->snapshot.message = "";
  std::shared_ptr<Job> previous;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto existing = jobs_.find(request.instance_id);
    if (existing != jobs_.end()) {
      if (!existing->second->finished.load()) {
        return false;
      }
      previous = existing->second;
    }
    jobs_[request.instance_id] = job;
    ++revision_;
  }
  if (previous != nullptr && previous->worker.joinable()) {
    previous->worker.join();
  }

  DownloadManager *self = this;
  job->worker = std::thread([self, job, request] {
    core::info("download: start " + request.instance_id + " <- " +
               request.url);
    net::HttpClient client(request.proxy);
    net::CancelToken &token = job->token;
    DownloadSnapshot snapshot;
    snapshot.state = DownloadState::running;
    int log_step = -1;
    const DownloadStatus status = install_instance_archive(
        client, request.url, request.instance_dir, request.archive_dir, token,
        [&](double percent) {
          snapshot.percent = percent;
          const int step = static_cast<int>(percent) / 5;
          if (step != log_step) {
            log_step = step;
            core::info("  " + request.instance_id + " " +
                       std::to_string(static_cast<int>(percent)) + "%");
          }
          self->touch(request.instance_id, snapshot);
        });

    if (!status.ok) {
      if (status.cancelled) {
        snapshot.state = DownloadState::cancelled;
        snapshot.message = "CANCELLED";
        core::info("  " + request.instance_id + " cancelled");
      } else {
        snapshot.state = DownloadState::failed;
        snapshot.message = status.error;
        core::warn("  " + request.instance_id + " failed: " + status.error);
      }
      self->finish(request.instance_id, snapshot);
      return;
    }

    snapshot.state = DownloadState::finished;
    snapshot.percent = 100.0;
    snapshot.message = "Installed";
    core::info("  " + request.instance_id + " installed");
    self->finish(request.instance_id, snapshot);
    sync_instance(request.instance_dir, request.username, request.dlc_source,
                  request.skin_pck);
  });

  return true;
}

void DownloadManager::touch(const std::string &instance_id,
                            const DownloadSnapshot &snapshot) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto found = jobs_.find(instance_id);
  if (found == jobs_.end()) {
    return;
  }
  found->second->snapshot = snapshot;
  ++revision_;
}

void DownloadManager::finish(const std::string &instance_id,
                             const DownloadSnapshot &snapshot) {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto found = jobs_.find(instance_id);
  if (found == jobs_.end()) {
    return;
  }
  found->second->snapshot = snapshot;
  found->second->finished.store(true);
  ++revision_;
}

void DownloadManager::cancel(const std::string &instance_id) {
  std::shared_ptr<Job> job;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto found = jobs_.find(instance_id);
    if (found == jobs_.end()) {
      return;
    }
    job = found->second;
  }
  job->token.cancel();
}

void DownloadManager::clear(const std::string &instance_id) {
  std::shared_ptr<Job> job;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto found = jobs_.find(instance_id);
    if (found == jobs_.end()) {
      return;
    }
    if (!found->second->finished.load()) {
      return;
    }
    job = found->second;
    jobs_.erase(found);
    ++revision_;
  }
  if (job->worker.joinable()) {
    job->worker.join();
  }
}

DownloadSnapshot
DownloadManager::snapshot(const std::string &instance_id) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto found = jobs_.find(instance_id);
  if (found == jobs_.end()) {
    return DownloadSnapshot{};
  }
  return found->second->snapshot;
}

bool DownloadManager::is_active(const std::string &instance_id) const {
  return snapshot(instance_id).active();
}

std::vector<std::string> DownloadManager::active_ids() const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::string> ids;
  for (const auto &[id, job] : jobs_) {
    if (!job->finished.load() && job->snapshot.active()) {
      ids.push_back(id);
    }
  }
  return ids;
}

std::vector<std::string> DownloadManager::known_ids() const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::string> ids;
  ids.reserve(jobs_.size());
  for (const auto &[id, job] : jobs_) {
    ids.push_back(id);
  }
  return ids;
}
} // namespace emerald::instances