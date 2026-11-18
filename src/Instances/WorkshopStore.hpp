#pragma once
#include "Config/ConfigSchema.hpp"
#include "Instances/Workshop.hpp"
#include "Net/HttpClient.hpp"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>
namespace emerald::instances {
struct WorkshopInstallStep {
    std::string package_id;
    std::string instance_id;
    std::map<std::string, std::string> zips;
    std::string version;
    std::string label;
};
struct WorkshopPackage {
  std::string id;
  std::string name;
  std::string author;
  std::string description;
  std::string extended_description;
  std::vector<std::string> category;
  std::string thumbnail;
  std::string thumbnail_data;
  std::string version;
  std::string logo;
  std::string url;
  std::map<std::string, std::string> zips;
  std::vector<std::string> dependencies;
  std::vector<std::string> required_versions;
  std::string server_address;
  std::string server_discord;
  std::string server_type;
  std::string game_version;
  std::string github_url;
  std::string download_url;
  long long likes = 0;
  long long download_count = 0;
  long long file_size = 0;
};

struct WorkshopCatalog {
  bool loading = true;
  std::string error;
  std::vector<WorkshopPackage> packages;
  std::vector<WorkshopPackage> versions;
  std::vector<WorkshopPackage> servers;
};

enum class WorkshopJobState { idle, running, finished, failed };
struct WorkshopJobSnapshot {
  WorkshopJobState state = WorkshopJobState::idle;
  std::string kind;
  double percent = 0.0;
  std::string label;
  std::string message;
  bool active() const { return state == WorkshopJobState::running; }
};

struct WorkshopJobStep {
  bool uninstall = false;
  std::string package_id;
  std::string instance_id;
  std::map<std::string, std::string> zips;
  std::string version;
  std::string label;
  std::size_t zips_count = 0;
};

class WorkshopStore {
public:
  WorkshopStore() = default;
  ~WorkshopStore();
  WorkshopStore(const WorkshopStore &) = delete;
  WorkshopStore &operator=(const WorkshopStore &) = delete;
  void start(const config::AppConfig &config);
  void stop();
  std::uint64_t revision() const;
  WorkshopCatalog catalog() const;
  std::vector<InstalledPackageEntry> installed() const;
  WorkshopJobSnapshot job() const;
  bool enqueue_installs(const std::vector<WorkshopInstallStep> &steps);
  bool enqueue_uninstall(const std::string &instance_id,
                         const std::string &package_id,
                         const std::string &label);
  void clear_job();
  void refresh_installed(const config::AppConfig &config);
  bool
  add_version(const config::AppConfig &config, const WorkshopPackage &package);
  std::optional<config::CustomEdition> consume_pending_edition();

private:
  void run_catalog(config::AppConfig config);
  void run_jobs();
  mutable std::mutex mutex_;
  WorkshopCatalog catalog_;
  std::vector<InstalledPackageEntry> installed_;
  WorkshopJobSnapshot job_;
  std::deque<WorkshopJobStep> queue_;
  std::vector<WorkshopJobStep> last_queue_;
  std::optional<config::CustomEdition> pending_edition_;
  std::uint64_t revision_ = 0;
  config::AppConfig job_config_;
  std::thread catalog_worker_;
  std::thread job_worker_;
  std::vector<std::thread> side_threads_;
  std::mutex job_mutex_;
  std::condition_variable job_cv_;
  std::atomic<bool> stopping_{false};
};
} // namespace emerald::instances
