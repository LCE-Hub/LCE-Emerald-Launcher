#pragma once
#include "Instances/InstanceManager.hpp"
#include "Net/HttpClient.hpp"
#include <filesystem>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <vector>
namespace emerald::instances {
struct InstalledWorkshopPackage {
  std::string id;
  std::string version;
  std::vector<std::string> dirs;
};

struct InstalledPackageEntry {
  std::string instance_id;
  std::string package_id;
  std::string version;
};

struct WorkshopInstallRequest {
  std::string instance_id;
  std::map<std::string, std::string> zips;
  std::string package_id;
  std::string version;
};

struct WorkshopGroup {
  std::vector<std::string> parts;
  std::string dest;
};

std::vector<WorkshopGroup>
group_archives(const std::map<std::string, std::string> &zips);
bool list_archive(const std::filesystem::path &archive,
                  std::vector<std::string> &out, std::string &error);

std::vector<std::string>
read_workshop_files(const std::filesystem::path &instance_dir);
std::vector<InstalledWorkshopPackage>
read_workshop_packages(const std::filesystem::path &instance_dir);
class WorkshopService {
public:
  WorkshopService(const InstanceManager &instances,
                  const config::AppConfig &config, net::HttpClient &client)
      : instances_(instances), config_(config), client_(client) {}

  bool install(const WorkshopInstallRequest &request, net::CancelToken &token,
               const std::function<void(double percent)> &on_progress,
               std::string &error);

  bool uninstall(const std::string &instance_id, const std::string &package_id,
                 std::string &error);

  std::vector<InstalledPackageEntry> list_installed() const;

private:
  bool
  download_and_assemble(const std::filesystem::path &tmp_dir,
                        const std::vector<std::string> &parts,
                        const std::string &raw_base, std::size_t &done,
                        std::size_t total, net::CancelToken &token,
                        const std::function<void(double percent)> &on_progress,
                        std::filesystem::path &out, std::string &error);

  const InstanceManager &instances_;
  const config::AppConfig &config_;
  net::HttpClient &client_;
};
} // namespace emerald::instances