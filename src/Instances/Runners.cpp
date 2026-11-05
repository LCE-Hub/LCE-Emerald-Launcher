#include "Instances/Runners.hpp"
#include "Core/Fs.hpp"
#include "Core/Paths.hpp"
#include "Instances/Downloader.hpp"
#include "Instances/Installer.hpp"
#include <cstdlib>
#include <unistd.h>
#include <unordered_set>
namespace emerald::instances {
namespace {
std::string environment(const char *name) {
  const char *value = std::getenv(name);
  return value != nullptr ? std::string(value) : std::string{};
}

bool is_executable_file(const std::filesystem::path &path) {
  std::error_code error;
  return std::filesystem::is_regular_file(path, error) &&
         access(path.string().c_str(), X_OK) == 0;
}

std::string find_in_path(const std::string &program) {
  const std::string path_env = environment("PATH");
  std::size_t start = 0;
  while (start <= path_env.size()) {
    const std::size_t colon = path_env.find(':', start);
    const std::string directory = path_env.substr(
        start, colon == std::string::npos ? std::string::npos : colon - start);
    if (!directory.empty()) {
      const std::filesystem::path candidate =
          std::filesystem::path(directory) / program;
      if (is_executable_file(candidate)) {
        return candidate.string();
      }
    }
    if (colon == std::string::npos) {
      break;
    }
    start = colon + 1;
  }
  return {};
}

std::string to_lower(std::string value) {
  for (char &character : value) {
    if (character >= 'A' && character <= 'Z') {
      character = static_cast<char>(character - 'A' + 'a');
    }
  }
  return value;
}
} // namespace

bool is_proton_runner(const Runner &runner) { return runner.type == "proton"; }
std::string runner_program(const Runner &runner) {
  if (is_proton_runner(runner)) {
    return (std::filesystem::path(runner.path) / "proton").string();
  }
  return runner.path;
}

std::filesystem::path RunnerManager::runners_dir() {
  return core::app_data_dir() / "runners";
}

std::vector<Runner> RunnerManager::available() const {
  std::vector<Runner> runners;
  std::unordered_set<std::string> seen;
  const auto add = [&](const std::string &id, const std::string &name,
                       const std::string &path, const std::string &type) {
    if (path.empty() || !seen.insert(path).second) {
      return;
    }
    runners.push_back(Runner{id, name, path, type});
  };

#if defined(__linux__)
  const std::string wine_path = find_in_path("wine");
  if (!wine_path.empty()) {
    add("wine", "System Wine", wine_path, "wine");
  }

  const std::filesystem::path flatpak_wine =
      "/usr/share/emerald-legacy-launcher/wine/bin/wine";
  if (is_executable_file(flatpak_wine)) {
    add("flatpaksucks", "Default for Flatpak", flatpak_wine.string(), "wine");
  }

  const std::string home = environment("HOME");
  const std::vector<std::filesystem::path> steam_paths{
      std::filesystem::path(home) / ".local/share/Steam/compatibilitytools.d",
      std::filesystem::path(home) / ".local/share/Steam/steamapps/common",
      "/usr/share/Steam/compatibilitytools.d"};

  for (const std::filesystem::path &base_path : steam_paths) {
    std::error_code error;
    std::filesystem::directory_iterator it(base_path, error);
    if (error) {
      continue;
    }
    for (const std::filesystem::directory_entry &entry : it) {
      std::error_code entry_error;
      if (!entry.is_directory(entry_error)) {
        continue;
      }
      const std::string name = entry.path().filename().string();
      if (to_lower(name).find("proton") == std::string::npos) {
        continue;
      }
      add("proton_" + name, name, entry.path().string(), "proton");
    }
  }
#endif

  const std::filesystem::path runners_path = runners_dir();
  core::ensure_directory(runners_path);
  std::error_code dir_error;
  std::filesystem::directory_iterator it(runners_path, dir_error);
  if (!dir_error) {
    for (const std::filesystem::directory_entry &entry : it) {
      std::error_code entry_error;
      if (!entry.is_directory(entry_error)) {
        continue;
      }
      const std::string dir_name = entry.path().filename().string();
      const std::filesystem::path proton_bin = entry.path() / "proton";
      const std::filesystem::path wine_bin = entry.path() / "bin" / "wine";
      if (core::file_exists(proton_bin)) {
        add("downloaded_" + dir_name, dir_name + " (downloaded)",
            entry.path().string(), "proton");
      } else if (core::file_exists(wine_bin)) {
        add("downloaded_" + dir_name, dir_name + " (downloaded)",
            wine_bin.string(), "wine");
      }
    }
  }

  return runners;
}

bool RunnerManager::download_runner(
    net::HttpClient &client, const std::string &name, const std::string &url,
    net::CancelToken &token,
    const std::function<void(double percent)> &on_progress,
    std::string &error) {
  const std::filesystem::path runners_path = runners_dir();
  if (!core::ensure_directory(runners_path)) {
    error = "Failed to create runners directory";
    return false;
  }

  const std::filesystem::path runner_dir = runners_path / name;
  std::error_code remove_error;
  std::filesystem::remove_all(runner_dir, remove_error);
  if (!core::ensure_directory(runner_dir)) {
    error = "Failed to create runner directory";
    return false;
  }

  const std::filesystem::path tarball = runners_path / (name + ".tar.gz");
  const DownloadStatus status =
      download_file(client, url, tarball, token, on_progress, nullptr, 3);
  if (!status.ok) {
    error = status.cancelled ? "CANCELLED" : status.error;
    std::filesystem::remove_all(runner_dir, remove_error);
    return false;
  }

  const bool extracted = extract_archive_strip(tarball, runner_dir, 1, error);
  std::error_code cleanup_error;
  std::filesystem::remove(tarball, cleanup_error);
  if (!extracted) {
    std::filesystem::remove_all(runner_dir, cleanup_error);
    return false;
  }
  return true;
}
} // namespace emerald::instances