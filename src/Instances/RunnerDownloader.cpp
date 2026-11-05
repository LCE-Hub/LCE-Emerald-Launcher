#include "Instances/RunnerDownloader.hpp"
#include "Core/Log.hpp"
#include "Instances/Runners.hpp"
#include "Net/HttpClient.hpp"
namespace emerald::instances {
struct RunnerDownloader::Job {
  net::CancelToken token;
  std::optional<double> percent;
  std::thread thread;
  bool running = false;
  std::string error;
};

RunnerDownloader::~RunnerDownloader() { shutdown(); }
DownloadManager *RunnerDownloader::report_target() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return report_;
}

bool RunnerDownloader::start(const std::string &name, const std::string &url) {
  std::shared_ptr<Job> job;
  std::string id;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (job_ != nullptr && job_->running) {
      return false;
    }
    if (job_ != nullptr && job_->thread.joinable()) {
      job_->thread.join();
    }
    job = std::make_shared<Job>();
    job->running = true;
    job->percent = 0.0;
    id = "runner_" + name;
    report_id_ = id;
    job_ = job;
    ++revision_;
  }
  if (report_ != nullptr) {
    report_->track_external(id, true, 0.0, {});
  }
  job->thread = std::thread(
      [this, job, name, url, id] {
        net::HttpClient client;
        std::string error;
        const bool ok = RunnerManager::download_runner(
            client, name, url, job->token,
            [this, job](double percent) { set_percent(job, percent); }, error);
        double end_percent = 0.0;
        if (ok) {
          end_percent = 100.0;
        } else {
          core::warn(std::string{"runner download: "} + error);
        }
        {
          std::lock_guard<std::mutex> lock(mutex_);
          job->running = false;
          job->percent = ok ? std::optional<double>(100.0) : job->percent;
          job->error = ok ? std::string{} : error;
          ++revision_;
        }
        if (DownloadManager *target = report_target()) {
          target->track_external(id, false, end_percent,
                                 ok ? std::string{} : error);
        }
      });
  return true;
}

void RunnerDownloader::cancel() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_ != nullptr) {
    job_->token.cancel();
  }
}

void RunnerDownloader::shutdown() {
  std::shared_ptr<Job> job;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    job = job_;
    if (job != nullptr) {
      job->token.cancel();
    }
  }
  if (job != nullptr && job->thread.joinable()) {
    job->thread.join();
  }
}

bool RunnerDownloader::active() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_ != nullptr && job_->running;
}

std::optional<double> RunnerDownloader::percent() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_ != nullptr ? job_->percent : std::nullopt;
}

std::string RunnerDownloader::error() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_ != nullptr ? job_->error : std::string{};
}

std::uint64_t RunnerDownloader::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

void RunnerDownloader::set_percent(const std::shared_ptr<Job> &job,
                                   double value) {
  DownloadManager *target = nullptr;
  std::string id;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    job->percent = value;
    ++revision_;
    target = report_;
    id = report_id_;
  }
  if (target != nullptr) {
    target->track_external(id, true, value, {});
  }
}
} // namespace emerald::instances
