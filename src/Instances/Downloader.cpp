#include "Instances/Downloader.hpp"
#include "Core/Fs.hpp"
#include <chrono>
#include <thread>
namespace emerald::instances {
namespace {
int backoff_seconds(int attempt) {
  const int exponent = attempt > 2 ? attempt - 2 : 0;
  return 1 << exponent;
}
} // namespace

DownloadStatus download_file(
    net::HttpClient &client, const std::string &url,
    const std::filesystem::path &dest, net::CancelToken &token,
    const std::function<void(double percent)> &on_progress,
    const std::function<void(int attempt, const std::string &error)> &on_retry,
    int max_retries) {
  DownloadStatus status;
  int attempt = 0;
  while (attempt < max_retries) {
    if (!attempt || !status.cancelled) {
      std::optional<std::string> last_modified;
      std::string error;
      bool ok = false;
      if (attempt > 0) {
        std::this_thread::sleep_for(
            std::chrono::seconds(backoff_seconds(attempt)));
      }
      if (token.cancelled()) {
        status.cancelled = true;
        break;
      }
      std::function<void(double total, double now)> progress;
      if (on_progress) {
        progress = [on_progress](double total, double now) {
          if (total > 0) {
            on_progress(now / total * 100.0);
          }
        };
      }
      ok = client.download(url, dest, token, progress, last_modified, error);
      if (ok) {
        status.ok = true;
        status.last_modified = std::move(last_modified);
        return status;
      }
      status.error = error;
      status.cancelled = error == "CANCELLED";
    }
    if (status.cancelled) {
      break;
    }
    ++attempt;
    if (attempt < max_retries && on_retry) {
      on_retry(attempt + 1, status.error);
    }
  }
  return status;
}

DownloadStatus download_json(
    net::HttpClient &client, const std::string &url, net::CancelToken &token,
    const std::function<void(int attempt, const std::string &error)> &on_retry,
    int max_retries) {
  DownloadStatus status;
  int attempt = 0;
  while (attempt < max_retries) {
    if (attempt > 0) {
      std::this_thread::sleep_for(
          std::chrono::seconds(backoff_seconds(attempt)));
    }
    if (token.cancelled()) {
      status.cancelled = true;
      break;
    }
    const net::HttpResponse response = client.get(url);
    const bool success = response.status >= 200 && response.status < 300;
    if (success) {
      status.ok = true;
      status.body = response.body;
      status.last_modified = response.last_modified;
      return status;
    }
    status.error = "GET failed: " + std::to_string(response.status);
    ++attempt;
    if (attempt < max_retries && on_retry) {
      on_retry(attempt + 1, status.error);
    }
  }
  return status;
}
} // namespace emerald::instances