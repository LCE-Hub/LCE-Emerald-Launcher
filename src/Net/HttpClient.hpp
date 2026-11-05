#pragma once
#include "Core/Json.hpp"
#include <filesystem>
#include <functional>
#include <optional>
#include <string>
namespace emerald::net {
class CancelToken {
public:
  void cancel();
  bool cancelled() const;

private:
  bool cancelled_ = false;
};

struct HttpResponse {
  long status = 0;
  std::string body;
  std::optional<std::string> last_modified;
  std::optional<long long> content_length;
};

class HttpClient {
public:
  explicit HttpClient(std::optional<std::string> proxy = std::nullopt);
  ~HttpClient();
  HttpClient(const HttpClient &) = delete;
  HttpClient &operator=(const HttpClient &) = delete;
  HttpResponse get(const std::string &url);
  bool
  download(const std::string &url, const std::filesystem::path &dest,
           CancelToken &token,
           const std::function<void(double total, double now)> &on_progress,
           std::optional<std::string> &last_modified, std::string &error);

private:
  std::string proxy_;
};

} // namespace emerald::net