#include "Launch/MacosRuntime.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Core/Log.hpp"
#include "Instances/Downloader.hpp"
#include "Instances/Installer.hpp"
#include "Net/HttpClient.hpp"
#include "Platform/Platform.hpp"
#include "Platform/Process.hpp"
#include <cstdlib>
#include <filesystem>
#include <thread>
namespace emerald::launch {
struct MacosRuntime::Job {
  net::CancelToken token;
  MacosSetupProgress progress;
  std::thread thread;
  bool running = false;
};

namespace {
std::string environment(const char *name) {
  const char *value = std::getenv(name);
  return value != nullptr ? std::string(value) : std::string{};
}

std::optional<Json> fetch_release(net::HttpClient &client,
                                  const std::string &repository) {
  const net::HttpResponse response = client.get(
      "https://api.github.com/repos/" + repository + "/releases/latest");
  if (response.status < 200 || response.status >= 300) {
    return std::nullopt;
  }
  Json parsed = Json::parse(response.body, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) {
    return std::nullopt;
  }
  return parsed;
}

std::optional<Json>
find_asset(const Json &release,
           const std::function<bool(const std::string &, const std::string &)>
               &predicate) {
  const auto assets = release.find("assets");
  if (assets == release.end() || !assets->is_array()) {
    return std::nullopt;
  }
  for (const Json &asset : *assets) {
    const std::string name = asset.value("name", std::string{});
    const std::string url = asset.value("browser_download_url", std::string{});
    if (!name.empty() && !url.empty() && predicate(name, url)) {
      return asset;
    }
  }
  return std::nullopt;
}

bool is_archive(const std::string &name) {
  return name.ends_with(".tar.xz") || name.ends_with(".tar.gz");
}

bool run_wine(const std::filesystem::path &wine_binary,
              const std::vector<std::string> &arguments,
              const std::map<std::string, std::string> &environment_vars) {
  platform::ProcessSpec spec;
  spec.program = wine_binary.string();
  spec.arguments = arguments;
  spec.environment = environment_vars;
  spec.new_process_group = false;
  platform::Process process;
  std::string error;
  if (!process.spawn(spec, error)) {
    return false;
  }
  process.wait();
  return process.exit_code() == 0;
}
} // namespace

MacosRuntime::~MacosRuntime() { shutdown(); }
bool MacosRuntime::start(const std::optional<std::string> &proxy) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_ != nullptr && job_->running) {
    return false;
  }
  if (job_ != nullptr && job_->thread.joinable()) {
    job_->thread.join();
  }
  auto job = std::make_shared<Job>();
  job->running = true;
  job->progress.stage = MacosSetupStage::resolving;
  job->progress.message = "Resolving macOS compatibility runtime...";
  job_ = job;
  ++revision_;
  job->thread = std::thread(&MacosRuntime::run, this, job, proxy);
  return true;
}

void MacosRuntime::cancel() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_ != nullptr) {
    job_->token.cancel();
  }
}

void MacosRuntime::shutdown() {
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

MacosSetupProgress MacosRuntime::progress() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_ != nullptr ? job_->progress : MacosSetupProgress{};
}

bool MacosRuntime::active() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_ != nullptr && job_->running;
}

std::uint64_t MacosRuntime::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

void MacosRuntime::update(const std::shared_ptr<Job> &job,
                          MacosSetupStage stage, std::string message,
                          std::optional<double> percent) {
  std::lock_guard<std::mutex> lock(mutex_);
  job->progress.stage = stage;
  job->progress.message = std::move(message);
  job->progress.percent = percent;
  ++revision_;
}

void MacosRuntime::fail(const std::shared_ptr<Job> &job,
                        const std::string &message) {
  core::warn(std::string{"macos runtime setup: "} + message);
  update(job, MacosSetupStage::failed, message, std::nullopt);
  job->running = false;
}

void MacosRuntime::run(const std::shared_ptr<Job> &job,
                       std::optional<std::string> proxy) {
#if defined(__x86_64__) || defined(_M_X64)
  const bool is_intel = true;
#else
  const bool is_intel = false;
#endif
  const std::string repository =
      is_intel ? "Gcenx/macOS_Wine_builds" : "Gcenx/game-porting-toolkit";
  const std::filesystem::path runtime_dir = platform::macos_runtime_dir();
  const std::filesystem::path toolkit_dir = runtime_dir / "toolkit";
  const std::filesystem::path prefix_dir = runtime_dir / "prefix";
  if (!core::ensure_directory(runtime_dir)) {
    fail(job, "Unable to create runtime directory");
    return;
  }

  net::HttpClient client(proxy);
  update(job, MacosSetupStage::resolving,
         "Resolving macOS compatibility runtime...", std::nullopt);
  const std::optional<Json> release = fetch_release(client, repository);
  if (!release.has_value()) {
    fail(job, "Failed to resolve the latest runtime release");
    return;
  }
  const std::optional<Json> asset = find_asset(
      *release, [is_intel](const std::string &name, const std::string &) {
        if (!is_archive(name)) {
          return false;
        }
        return is_intel ? name.find("staging") != std::string::npos : true;
      });
  if (!asset.has_value()) {
    fail(job, "No compatible runtime asset found in latest release");
    return;
  }
  const std::string asset_name = asset->value("name", std::string{});
  const std::string asset_url =
      asset->value("browser_download_url", std::string{});
  const std::string tag = release->value("tag_name", std::string{});
  const std::filesystem::path archive_path =
      runtime_dir / ("gptk_" + asset_name);
  update(job, MacosSetupStage::downloading,
         "Downloading runtime (" + tag + ")...", 0.0);
  {
    std::string error;
    const instances::DownloadStatus status =
        instances::download_file(client, asset_url, archive_path, job->token,
                                 [this, job](double percent) {
                                   update(job, MacosSetupStage::downloading,
                                          "Downloading runtime...", percent);
                                 });
    if (!status.ok) {
      fail(job, status.cancelled ? "Setup cancelled" : status.error);
      return;
    }
  }
  if (job->token.cancelled()) {
    fail(job, "Setup cancelled");
    return;
  }

  std::error_code error_code;
  const std::uintmax_t size =
      std::filesystem::file_size(archive_path, error_code);
  if (error_code || size < 100000000) {
    fail(job, "Downloaded runtime archive is too small");
    return;
  }

  update(job, MacosSetupStage::extracting, "Extracting runtime...",
         std::nullopt);
  std::filesystem::remove_all(toolkit_dir, error_code);
  std::string error;
  if (!instances::extract_archive(archive_path, toolkit_dir, error)) {
    fail(job, "Extraction failed: " + error);
    return;
  }
  std::filesystem::remove(archive_path, error_code);
  core::ensure_directory(prefix_dir);
  const std::optional<std::filesystem::path> primary =
      is_intel ? platform::find_executable_recursive(toolkit_dir, "wine")
               : platform::find_executable_recursive(toolkit_dir, "wine64");
  const std::optional<std::filesystem::path> secondary =
      is_intel ? platform::find_executable_recursive(toolkit_dir, "wine64")
               : platform::find_executable_recursive(toolkit_dir, "wine");
  const std::optional<std::filesystem::path> wine_binary =
      primary.has_value() ? primary : secondary;
  if (!wine_binary.has_value()) {
    fail(job, "Unable to locate wine binary inside runtime");
    return;
  }
  const std::filesystem::path wine_bin_dir = wine_binary->parent_path();
  update(job, MacosSetupStage::initializing, "Initializing Wine prefix...",
         std::nullopt);
  std::map<std::string, std::string> wine_env;
  wine_env["WINEPREFIX"] = prefix_dir.string();
  wine_env["WINEARCH"] = "win64";
  wine_env["WINEDEBUG"] = "-all";
  wine_env["WINEESYNC"] = "1";
  wine_env["WINEDLLOVERRIDES"] = "winemenubuilder.exe=d;mscoree,mshtml=";
  wine_env["MTL_HUD_ENABLED"] = "0";
  wine_env["PATH"] = wine_bin_dir.string() + ":" + environment("PATH");
  if (!run_wine(*wine_binary, {"wineboot", "-u"}, wine_env)) {
    fail(job, "Wine prefix initialization failed");
    return;
  }

  if (is_intel) {
    update(job, MacosSetupStage::dxvk_downloading, "Fetching latest DXVK...",
           std::nullopt);
    const std::optional<Json> dxvk_release =
        fetch_release(client, "Gcenx/DXVK-macOS");
    if (!dxvk_release.has_value()) {
      fail(job, "Failed to resolve DXVK release");
      return;
    }
    const std::optional<Json> dxvk_asset = find_asset(
        *dxvk_release, [](const std::string &name, const std::string &) {
          return is_archive(name) && name.find("builtin") == std::string::npos;
        });
    if (!dxvk_asset.has_value()) {
      fail(job, "No compatible DXVK asset found");
      return;
    }
    const std::string dxvk_name = dxvk_asset->value("name", std::string{});
    const std::string dxvk_url =
        dxvk_asset->value("browser_download_url", std::string{});
    const std::filesystem::path dxvk_archive =
        runtime_dir / ("dxvk_" + dxvk_name);
    {
      const instances::DownloadStatus status = instances::download_file(
          client, dxvk_url, dxvk_archive, job->token,
          [this, job](double percent) {
            update(job, MacosSetupStage::dxvk_downloading,
                   "Downloading DXVK...", percent);
          });
      if (!status.ok) {
        fail(job, status.cancelled ? "Setup cancelled" : status.error);
        return;
      }
    }

    update(job, MacosSetupStage::dxvk_extracting, "Extracting DXVK...",
           std::nullopt);
    const std::filesystem::path dxvk_dir = runtime_dir / "dxvk";
    std::filesystem::remove_all(dxvk_dir, error_code);
    if (!instances::extract_archive(dxvk_archive, dxvk_dir, error)) {
      fail(job, "DXVK extraction failed: " + error);
      return;
    }
    std::filesystem::remove(dxvk_archive, error_code);
    update(job, MacosSetupStage::patching, "Patching runtime with DXVK...",
           std::nullopt);
    const std::filesystem::path system32 =
        prefix_dir / "drive_c" / "windows" / "system32";
    const std::filesystem::path syswow64 =
        prefix_dir / "drive_c" / "windows" / "syswow64";
    core::ensure_directory(system32);
    core::ensure_directory(syswow64);
    const auto copy_dlls = [](const std::filesystem::path &source,
                              const std::filesystem::path &destination) {
      std::error_code iterator_error;
      std::filesystem::directory_iterator it(source, iterator_error);
      if (iterator_error) {
        return;
      }
      for (const std::filesystem::directory_entry &entry : it) {
        if (entry.path().extension() == ".dll") {
          core::copy_file(entry.path(), destination / entry.path().filename());
        }
      }
    };
    copy_dlls(dxvk_dir / "x64", system32);
    copy_dlls(dxvk_dir / "x32", syswow64);
    for (const char *dll_name : {"d3d11", "dxgi"}) {
      run_wine(*wine_binary,
               {"reg", "add", "HKCU\\Software\\Wine\\DllOverrides", "/v",
                dll_name, "/t", "REG_SZ", "/d", "native,builtin", "/f"},
               wine_env);
    }
    std::filesystem::remove_all(dxvk_dir, error_code);
  }

  update(job, MacosSetupStage::done, "Setup complete.", 100.0);
  job->running = false;
}
} // namespace emerald::launch
