#include "Net/HttpClient.hpp"
#include <cstdio>
#include <curl/curl.h>
namespace emerald::net {
namespace {
struct HeaderCapture {
  std::optional<std::string> last_modified;
  std::optional<long long> content_length;
};

struct WriteState {
  std::string *body = nullptr;
  std::FILE *file = nullptr;
  CancelToken *token = nullptr;
};

std::size_t write_body(char *data, std::size_t size, std::size_t count,
                       void *userdata) {
  auto *state = static_cast<WriteState *>(userdata);
  if (state->token != nullptr && state->token->cancelled()) {
    return 0;
  }
  if (state->body != nullptr) {
    state->body->append(data, size * count);
  } else if (state->file != nullptr) {
    const std::size_t written = std::fwrite(data, size, count, state->file);
    if (written != count) {
      return 0;
    }
  }
  return size * count;
}

std::size_t capture_header(char *data, std::size_t size, std::size_t count,
                           void *userdata) {
  auto *capture = static_cast<HeaderCapture *>(userdata);
  const std::string line(data, size * count);
  const std::size_t colon = line.find(':');
  if (colon != std::string::npos) {
    const std::string name = line.substr(0, colon);
    const char *value_start = line.data() + colon + 1;
    while (*value_start == ' ' || *value_start == '\t') {
      ++value_start;
    }
    std::string value(value_start);
    while (!value.empty() && (value.back() == '\r' || value.back() == '\n')) {
      value.pop_back();
    }
    if (name == "Last-Modified") {
      capture->last_modified = value;
    } else if (name == "Content-Length") {
      capture->content_length = std::stoll(value);
    }
  }
  return size * count;
}

struct ProgressState {
  double total = 0;
  double now = 0;
  double last_percent = 0;
  const std::function<void(double total, double now)> *on_progress = nullptr;
};

int capture_progress(void *userdata, curl_off_t total, curl_off_t now,
                     curl_off_t, curl_off_t) {
  auto *state = static_cast<ProgressState *>(userdata);
  if (total <= 0) {
    return 0;
  }
  const double percent = static_cast<double>(now) / static_cast<double>(total);
  if (percent - state->last_percent >= 0.01) {
    state->last_percent = percent;
    if (state->on_progress != nullptr) {
      (*state->on_progress)(static_cast<double>(total),
                            static_cast<double>(now));
    }
  }
  return 0;
}

class CurlSetup {
public:
  CurlSetup() { curl_global_init(CURL_GLOBAL_DEFAULT); }
  ~CurlSetup() { curl_global_cleanup(); }
};

void apply_common_options(CURL *handle, const std::string &proxy) {
  curl_easy_setopt(handle, CURLOPT_USERAGENT, "Emerald-Launcher");
  curl_easy_setopt(handle, CURLOPT_CONNECTTIMEOUT, 15L);
  curl_easy_setopt(handle, CURLOPT_TIMEOUT, 500L);
  curl_easy_setopt(handle, CURLOPT_FOLLOWLOCATION, 1L);
  // neo: dont set proxy.
}

} // namespace
void CancelToken::cancel() { cancelled_ = true; }
bool CancelToken::cancelled() const { return cancelled_; }
HttpClient::HttpClient(std::optional<std::string> proxy)
    : proxy_(proxy.value_or(std::string{})) {
  if (proxy_.find("://") == std::string::npos) {
    proxy_.insert(0, "http://");
  }
  static CurlSetup setup;
  (void)setup;
}

HttpClient::~HttpClient() = default;
HttpResponse HttpClient::get(const std::string &url) {
  HttpResponse response;
  CURL *handle = curl_easy_init();
  if (handle == nullptr) {
    return response;
  }

  HeaderCapture capture;
  WriteState state;
  state.body = &response.body;
  apply_common_options(handle, proxy_);
  curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
  curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, write_body);
  curl_easy_setopt(handle, CURLOPT_WRITEDATA, &state);
  curl_easy_setopt(handle, CURLOPT_HEADERFUNCTION, capture_header);
  curl_easy_setopt(handle, CURLOPT_HEADERDATA, &capture);
  curl_easy_setopt(handle, CURLOPT_NOSIGNAL, 1L);
  const CURLcode result = curl_easy_perform(handle);
  if (result == CURLE_OK) {
    curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &response.status);
  }
  response.last_modified = std::move(capture.last_modified);
  response.content_length = capture.content_length;
  curl_easy_cleanup(handle);
  return response;
}

bool HttpClient::download(
    const std::string &url, const std::filesystem::path &dest,
    CancelToken &token,
    const std::function<void(double total, double now)> &on_progress,
    std::optional<std::string> &last_modified, std::string &error) {
  CURL *handle = curl_easy_init();
  if (handle == nullptr) {
    error = "failed to init curl";
    return false;
  }

  HeaderCapture capture;
  WriteState state;
  state.token = &token;
  state.file = std::fopen(dest.string().c_str(), "wb");
  if (state.file == nullptr) {
    curl_easy_cleanup(handle);
    error = "failed to open destination file";
    return false;
  }

  ProgressState progress;
  progress.on_progress = &on_progress;
  apply_common_options(handle, proxy_);
  curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
  curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, write_body);
  curl_easy_setopt(handle, CURLOPT_WRITEDATA, &state);
  curl_easy_setopt(handle, CURLOPT_HEADERFUNCTION, capture_header);
  curl_easy_setopt(handle, CURLOPT_HEADERDATA, &capture);
  curl_easy_setopt(handle, CURLOPT_NOSIGNAL, 1L);
  curl_easy_setopt(handle, CURLOPT_NOPROGRESS, 0L);
  curl_easy_setopt(handle, CURLOPT_XFERINFOFUNCTION, capture_progress);
  curl_easy_setopt(handle, CURLOPT_XFERINFODATA, &progress);
  const CURLcode result = curl_easy_perform(handle);
  std::fclose(state.file);
  state.file = nullptr;
  bool ok = false;
  if (result == CURLE_OK) {
    long status = 0;
    curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &status);
    if (status >= 200 && status < 300) {
      ok = true;
    } else {
      error = "Download failed: " + std::to_string(status);
    }
  } else if (token.cancelled()) {
    error = "CANCELLED";
  } else {
    error = curl_easy_strerror(result);
  }

  if (ok) {
    last_modified = std::move(capture.last_modified);
  }
  if (on_progress && progress.total > 0) {
    on_progress(static_cast<double>(progress.total),
                static_cast<double>(progress.now));
  }

  curl_easy_cleanup(handle);
  if (!ok) {
    std::error_code error_code;
    std::filesystem::remove(dest, error_code);
  }
  return ok;
}

} // namespace emerald::net