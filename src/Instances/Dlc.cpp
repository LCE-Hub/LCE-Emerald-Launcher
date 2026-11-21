#include "Instances/Dlc.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
namespace emerald::instances {
namespace {
std::vector<std::string> path_segments(const std::string &path) {
  std::vector<std::string> segments;
  std::size_t start = 0;
  while (start <= path.size()) {
    const std::size_t slash = path.find('/', start);
    const std::string piece = path.substr(
        start, slash == std::string::npos ? std::string::npos : slash - start);
    if (!piece.empty()) {
      segments.push_back(piece);
    }
    if (slash == std::string::npos) {
      break;
    }
    start = slash + 1;
  }
  return segments;
}

bool parse_json_entries(const Json &json, std::vector<GitEntry> &out) {
  if (!json.is_array()) {
    return false;
  }
  for (const Json &item : json) {
    const std::optional<std::string> name =
        json_optional<std::string>(item, "name");
    const std::optional<std::string> type =
        json_optional<std::string>(item, "type");
    if (!name.has_value() || !type.has_value()) {
      continue;
    }
    out.push_back(GitEntry{*name, *type == "dir"});
  }
  return true;
}

Json parse_or_null(const std::string &text, std::string &error) {
  Json json = Json::object();
  try {
    json = Json::parse(text);
  } catch (const std::exception &exception) {
    error = std::string("Failed to parse response: ") + exception.what();
  }
  return json;
}
} // namespace

bool parse_git_url(const std::string &url, GitRepoRef &out,
                   std::string &error) {
  const std::size_t scheme = url.find("://");
  if (scheme == std::string::npos) {
    error = "Invalid URL";
    return false;
  }
  const std::size_t host_start = scheme + 3;
  const std::size_t path_start = url.find('/', host_start);
  if (path_start == std::string::npos || path_start == host_start) {
    error = "No host in URL";
    return false;
  }

  out.host = url.substr(host_start, path_start - host_start);
  const std::vector<std::string> segments =
      path_segments(url.substr(path_start));
  if (segments.size() < 2) {
    error = "Invalid repo URL: need owner and repo";
    return false;
  }
  out.owner = segments[0];
  out.repo = segments[1];
  const std::string suffix = ".git";
  if (out.repo.size() > suffix.size() &&
      out.repo.compare(out.repo.size() - suffix.size(), suffix.size(),
                       suffix) == 0) {
    out.repo = out.repo.substr(0, out.repo.size() - suffix.size());
  }
  out.is_github =
      out.host == "github.com" || out.host == "raw.githubusercontent.com";
  return true;
}

std::string git_api_url(const GitRepoRef &ref, const std::string &path,
                        const std::string &branch) {
  std::string api_path;
  if (!path.empty() && path != "." && path != "/") {
    std::string trimmed = path;
    while (!trimmed.empty() && trimmed.front() == '/') {
      trimmed.erase(trimmed.begin());
    }
    api_path = "/" + trimmed;
  }

  if (ref.is_github) {
    return "https://api.github.com/repos/" + ref.owner + "/" + ref.repo +
           "/contents" + api_path + "?ref=" + branch;
  }
  return "https://" + ref.host + "/api/v1/repos/" + ref.owner + "/" + ref.repo +
         "/contents" + api_path + "?ref=" + branch;
}

std::string git_raw_url(const GitRepoRef &ref, const std::string &branch,
                        const std::string &path) {
  if (ref.is_github) {
    return "https://raw.githubusercontent.com/" + ref.owner + "/" + ref.repo +
           "/" + branch + "/" + path;
  }
  return "https://" + ref.host + "/" + ref.owner + "/" + ref.repo +
         "/raw/branch/" + branch + "/" + path;
}

bool DlcService::list_directory(const std::string &repo_url,
                                const std::string &branch,
                                const std::string &path,
                                std::vector<GitEntry> &out,
                                std::string &error) {
  GitRepoRef ref;
  if (!parse_git_url(repo_url, ref, error)) {
    return false;
  }

  const net::HttpResponse response =
      client_.get(git_api_url(ref, path, branch));
  if (response.status == 404) {
    return true;
  }
  if (response.status < 200 || response.status >= 300) {
    error = "Git API returned " + std::to_string(response.status);
    return false;
  }

  std::string parse_error;
  const Json json = parse_or_null(response.body, parse_error);
  if (!parse_error.empty()) {
    error = parse_error;
    return false;
  }

  if (json.is_array()) {
    parse_json_entries(json, out);
    return true;
  }
  if (json.is_object()) {
    const std::optional<std::string> type =
        json_optional<std::string>(json, "type");
    if (type.value_or("") != "dir") {
      return true;
    }
    const std::optional<std::string> sub_path =
        json_optional<std::string>(json, "path");
    return list_directory(repo_url, branch, sub_path.value_or(""), out, error);
  }
  return true;
}

bool DlcService::collect_files(const GitRepoRef &ref, const std::string &branch,
                               const std::string &root_path,
                               std::vector<std::string> &out,
                               std::string &error) {
  std::vector<std::string> pending{root_path};
  while (!pending.empty()) {
    const std::string dir = pending.back();
    pending.pop_back();
    const net::HttpResponse response =
        client_.get(git_api_url(ref, dir, branch));
    if (response.status < 200 || response.status >= 300) {
      error =
          "Failed to list " + dir + ": HTTP " + std::to_string(response.status);
      return false;
    }

    std::string parse_error;
    const Json json = parse_or_null(response.body, parse_error);
    if (!parse_error.empty()) {
      error = parse_error;
      return false;
    }

    if (!json.is_array()) {
      if (!json.is_object()) {
        continue;
      }
      const std::optional<std::string> type =
          json_optional<std::string>(json, "type");
      if (type.value_or("") == "dir") {
        continue;
      }
      out.push_back(dir);
      continue;
    }

    for (const Json &entry : json) {
      const std::optional<std::string> name =
          json_optional<std::string>(entry, "name");
      const std::optional<std::string> type =
          json_optional<std::string>(entry, "type");
      if (!name.has_value() || !type.has_value()) {
        continue;
      }
      const std::string full_path = dir.empty() ? *name : dir + "/" + *name;
      if (*type == "dir") {
        pending.push_back(full_path);
      } else {
        out.push_back(full_path);
      }
    }
  }
  return true;
}

bool DlcService::download_folder(
    const std::string &instance_id, const std::string &repo_url,
    const std::string &branch, const std::string &dlc_folder,
    net::CancelToken &token,
    const std::function<void(double percent)> &on_progress,
    std::string &error) {
  GitRepoRef ref;
  if (!parse_git_url(repo_url, ref, error)) {
    return false;
  }

  std::vector<std::string> files;
  if (!collect_files(ref, branch, dlc_folder, files, error)) {
    return false;
  }
  if (files.empty()) {
    error = "No files found in '" + dlc_folder + "' folder";
    return false;
  }

  const std::filesystem::path dest = instances_.working_dir(instance_id) /
                                     "Windows64Media" / "DLC" / dlc_folder;
  if (!core::ensure_directory(dest)) {
    error = "Failed to create DLC directory";
    return false;
  }

  const std::string prefix = dlc_folder + "/";
  const double total = static_cast<double>(files.size());
  for (std::size_t index = 0; index < files.size(); ++index) {
    const std::string &file_path = files[index];
    std::string relative = file_path;
    if (relative.compare(0, prefix.size(), prefix) == 0) {
      relative = relative.substr(prefix.size());
    }

    const std::filesystem::path target = dest / relative;
    if (!core::ensure_directory(target.parent_path())) {
      error = "Failed to create directory for " + file_path;
      return false;
    }

    std::optional<std::string> last_modified;
    std::string download_error;
    if (!client_.download(git_raw_url(ref, branch, file_path), target, token,
                          nullptr, last_modified, download_error)) {
      error = "Failed to download " + file_path + ": " + download_error;
      return false;
    }

    if (on_progress) {
      on_progress((static_cast<double>(index) + 1.0) / total * 100.0);
    }
  }
  return true;
}
} // namespace emerald::instances