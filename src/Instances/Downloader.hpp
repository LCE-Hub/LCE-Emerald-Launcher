#pragma once
#include "Core/Json.hpp"
#include "Net/HttpClient.hpp"
#include <filesystem>
#include <functional>
#include <optional>
#include <string>
namespace emerald::instances {
struct DownloadStatus {
  bool ok = false;
  bool cancelled = false;
  std::string error;
  std::optional<std::string> last_modified;
  std::string body;
};

DownloadStatus download_file(
    net::HttpClient &client, const std::string &url,
    const std::filesystem::path &dest, net::CancelToken &token,
    const std::function<void(double percent)> &on_progress = nullptr,
    const std::function<void(int attempt, const std::string &error)> &on_retry =
        nullptr,
    int max_retries = 3);

DownloadStatus download_json(
    net::HttpClient &client, const std::string &url, net::CancelToken &token,
    const std::function<void(int attempt, const std::string &error)> &on_retry =
        nullptr,
    int max_retries = 3);

} // namespace emerald::instances