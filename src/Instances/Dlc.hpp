#pragma once
#include "Instances/InstanceManager.hpp"
#include "Net/HttpClient.hpp"
#include <filesystem>
#include <functional>
#include <optional>
#include <string>
#include <vector>
namespace emerald::instances {
struct GitEntry {
  std::string name;
  bool is_dir = false;
};

struct GitRepoRef {
  std::string owner;
  std::string repo;
  std::string host;
  bool is_github = false;
};

bool parse_git_url(const std::string &url, GitRepoRef &out, std::string &error);
std::string git_api_url(const GitRepoRef &ref, const std::string &path,
                        const std::string &branch);
std::string git_raw_url(const GitRepoRef &ref, const std::string &branch,
                        const std::string &path);

class DlcService {
public:
  DlcService(const InstanceManager &instances, net::HttpClient &client)
      : instances_(instances), client_(client) {}

  bool list_directory(const std::string &repo_url, const std::string &branch,
                      const std::string &path, std::vector<GitEntry> &out,
                      std::string &error);

  bool download_folder(const std::string &instance_id,
                       const std::string &repo_url, const std::string &branch,
                       const std::string &dlc_folder, net::CancelToken &token,
                       const std::function<void(double percent)> &on_progress,
                       std::string &error);

private:
  bool collect_files(const GitRepoRef &ref, const std::string &branch,
                     const std::string &root_path,
                     std::vector<std::string> &out, std::string &error);

  const InstanceManager &instances_;
  net::HttpClient &client_;
};
} // namespace emerald::instances