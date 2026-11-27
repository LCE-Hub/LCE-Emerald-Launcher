#include "Instances/WorkshopStore.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include <algorithm>
#include <utility>
namespace emerald::instances {
namespace {
constexpr const char *kRegistryUrl =
    "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/"
    "registry.json";
constexpr const char *kVersionsUrl =
    "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/"
    "versions.json";
constexpr const char *kRawBase =
    "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main";
constexpr const char *kVersionsBase =
    "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main/"
    ".00versions";
constexpr const char *kLceOnlineBase = "https://api.mclegacyedition.xyz";
std::string sanitize_token(std::string value) {
  std::string clean;
  for (const char character : value) {
    const bool safe = (character >= 'a' && character <= 'z') ||
                      (character >= 'A' && character <= 'Z') ||
                      (character >= '0' && character <= '9') ||
                      character == '-' || character == '_' || character == '.';
    if (safe) {
      clean.push_back(character);
    }
  }
  return clean.empty() ? std::string("pkg") : clean;
}

std::string base_name(const std::string &path) {
  const std::size_t slash = path.find_last_of('/');
  return slash == std::string::npos ? path : path.substr(slash + 1);
}

std::string extension_of(const std::string &path) {
  const std::string name = base_name(path);
  const std::size_t dot = name.find_last_of('.');
  if (dot == std::string::npos) {
    return ".png";
  }
  std::string extension = name.substr(dot);
  for (char &character : extension) {
    character =
        static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  if (extension != ".png" && extension != ".jpg" && extension != ".jpeg" &&
      extension != ".gif" && extension != ".webp") {
    return ".png";
  }
  return extension;
}

std::string base64_encode(const std::string &bytes) {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((bytes.size() + 2) / 3) * 4);
  std::size_t i = 0;
  while (i + 3 <= bytes.size()) {
    const unsigned value =
        (static_cast<unsigned char>(bytes[i]) << 16) |
        (static_cast<unsigned char>(bytes[i + 1]) << 8) |
        static_cast<unsigned char>(bytes[i + 2]);
    out.push_back(alphabet[(value >> 18) & 63U]);
    out.push_back(alphabet[(value >> 12) & 63U]);
    out.push_back(alphabet[(value >> 6) & 63U]);
    out.push_back(alphabet[value & 63U]);
    i += 3;
  }
  if (i < bytes.size()) {
    const unsigned value = static_cast<unsigned char>(bytes[i])
                           << 16 |
                           (i + 1 < bytes.size()
                                ? static_cast<unsigned char>(bytes[i + 1]) << 8
                                : 0U);
    out.push_back(alphabet[(value >> 18) & 63U]);
    out.push_back(alphabet[(value >> 12) & 63U]);
    out.push_back(i + 1 < bytes.size() ? alphabet[(value >> 6) & 63U] : '=');
    out.push_back('=');
  }
  return out;
}

std::string thumbnail_mime(const std::string &source) {
  const std::string extension = extension_of(source);
  if (extension == ".jpg" || extension == ".jpeg") {
    return "image/jpeg";
  }
  if (extension == ".gif") {
    return "image/gif";
  }
  if (extension == ".webp") {
    return "image/webp";
  }
  return "image/png";
}

std::string fetch_thumbnail(net::HttpClient &client,
                            const WorkshopPackage &package,
                            const std::string &base) {
  if (package.thumbnail.empty()) {
    return std::string();
  }
  const std::string source = package.thumbnail.rfind("http", 0) == 0
                                 ? package.thumbnail
                                 : base + "/" + package.id + "/" +
                                       package.thumbnail;
  const net::HttpResponse response = client.get(source, false);
  if (response.status != 200 || response.body.empty() ||
      response.body.size() > 2U * 1024U * 1024U) {
    return std::string();
  }
  return "data:" + thumbnail_mime(source) + ";base64," +
         base64_encode(response.body);
}

WorkshopPackage parse_package(const Json &item) {
  WorkshopPackage package;
  if (!item.is_object()) {
    return package;
  }
  package.id = json_optional<std::string>(item, "id").value_or("");
  package.name = json_optional<std::string>(item, "name").value_or("");
  package.author = json_optional<std::string>(item, "author").value_or("");
  package.description =
      json_optional<std::string>(item, "description").value_or("");
  package.extended_description =
      json_optional<std::string>(item, "extended_description").value_or("");
  package.thumbnail =
      json_optional<std::string>(item, "thumbnail").value_or("");
  package.version = json_optional<std::string>(item, "version").value_or("");
  package.logo = json_optional<std::string>(item, "logo").value_or("");
  package.url = json_optional<std::string>(item, "url").value_or("");
  package.game_version =
      json_optional<std::string>(item, "game_version").value_or("");
  package.github_url =
      json_optional<std::string>(item, "github_url").value_or("");
  package.download_url =
      json_optional<std::string>(item, "download_url").value_or("");
  package.server_address =
      json_optional<std::string>(item, "server_address").value_or("");
  package.server_discord =
      json_optional<std::string>(item, "server_discord").value_or("");
  package.server_type =
      json_optional<std::string>(item, "server_type").value_or("");
  package.likes = json_optional<long long>(item, "likes").value_or(0);
  package.download_count =
      json_optional<long long>(item, "download_count").value_or(0);
  package.file_size = json_optional<long long>(item, "file_size").value_or(0);
  if (const auto categories = json_optional<Json>(item, "category");
      categories.has_value() && categories->is_array()) {
    for (const Json &category : *categories) {
      if (category.is_string()) {
        package.category.push_back(category.get<std::string>());
      }
    }
  }
  if (const auto zips = json_optional<Json>(item, "zips");
      zips.has_value() && zips->is_object()) {
    for (auto iterator = zips->begin(); iterator != zips->end(); ++iterator) {
      if (iterator.value().is_string()) {
        package.zips[iterator.key()] = iterator.value().get<std::string>();
      }
    }
  }
  if (const auto dependencies = json_optional<Json>(item, "dependencies");
      dependencies.has_value() && dependencies->is_array()) {
    for (const Json &dependency : *dependencies) {
      if (dependency.is_string()) {
        package.dependencies.push_back(dependency.get<std::string>());
      }
    }
  }
  if (const auto required = json_optional<Json>(item, "required_versions");
      required.has_value() && required->is_array()) {
    for (const Json &version : *required) {
      if (version.is_string()) {
        package.required_versions.push_back(version.get<std::string>());
      }
    }
  }
  return package;
}

WorkshopPackage server_listing_to_package(const Json &item) {
  WorkshopPackage package;
  if (!item.is_object()) {
    return package;
  }
  package.id = json_optional<std::string>(item, "id").value_or("");
  package.name = json_optional<std::string>(item, "name").value_or("");
  package.author = json_optional<std::string>(item, "owner").value_or("");
  package.description = json_optional<std::string>(item, "ip").value_or("");
  package.version = json_optional<std::string>(item, "version").value_or("");
  package.thumbnail = json_optional<std::string>(item, "icon").value_or("");
  package.server_type = json_optional<std::string>(item, "type").value_or("");
  package.server_address = json_optional<std::string>(item, "ip").value_or("");
  package.server_discord =
      json_optional<std::string>(item, "discord").value_or("");
  package.category.push_back(package.server_type);
  return package;
}
} // namespace

WorkshopStore::~WorkshopStore() {
  stop();
}

void WorkshopStore::start(const config::AppConfig &config) {
  stop();
  stopping_ = false;
  std::error_code cleanup_error;
  std::filesystem::remove_all(core::app_data_dir() / "workshop_thumbs",
                              cleanup_error);
  refresh_installed(config);
  catalog_worker_ = std::thread(&WorkshopStore::run_catalog, this, config);
  job_worker_ = std::thread(&WorkshopStore::run_jobs, this);
}

void WorkshopStore::stop() {
  stopping_ = true;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    job_cv_.notify_all();
  }
  if (catalog_worker_.joinable()) {
    catalog_worker_.join();
  }
  if (job_worker_.joinable()) {
    job_worker_.join();
  }
  for (std::thread &thread : side_threads_) {
    if (thread.joinable()) {
      thread.join();
    }
  }
  side_threads_.clear();
}

std::uint64_t WorkshopStore::revision() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return revision_;
}

WorkshopCatalog WorkshopStore::catalog() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return catalog_;
}

std::vector<InstalledPackageEntry> WorkshopStore::installed() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return installed_;
}

WorkshopJobSnapshot WorkshopStore::job() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return job_;
}

bool WorkshopStore::enqueue_installs(
    const std::vector<WorkshopInstallStep> &steps) {
  if (steps.empty()) {
    return false;
  }
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_.active() || !queue_.empty()) {
    return false;
  }
  last_queue_.clear();
  for (const WorkshopInstallStep &step : steps) {
    WorkshopJobStep entry;
    entry.uninstall = false;
    entry.package_id = step.package_id;
    entry.instance_id = step.instance_id;
    entry.zips = step.zips;
    entry.version = step.version;
    entry.label = step.label;
    entry.zips_count = step.zips.size();
    last_queue_.push_back(entry);
    queue_.push_back(std::move(entry));
  }
  job_.state = WorkshopJobState::running;
  job_.kind = "install";
  job_.percent = 0.0;
  job_.label.clear();
  job_.message.clear();
  ++revision_;
  job_cv_.notify_all();
  return true;
}

bool WorkshopStore::enqueue_uninstall(const std::string &instance_id,
                                      const std::string &package_id,
                                      const std::string &label) {
  WorkshopJobStep step;
  step.uninstall = true;
  step.package_id = package_id;
  step.instance_id = instance_id;
  step.label = label;
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_.active() || !queue_.empty()) {
    return false;
  }
  last_queue_ = {step};
  queue_.push_back(std::move(step));
  job_.state = WorkshopJobState::running;
  job_.kind = "uninstall";
  job_.percent = 0.0;
  job_.label.clear();
  job_.message.clear();
  ++revision_;
  job_cv_.notify_all();
  return true;
}

void WorkshopStore::clear_job() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (job_.active() || !queue_.empty()) {
    return;
  }
  job_ = WorkshopJobSnapshot{};
  ++revision_;
}

void WorkshopStore::refresh_installed(const config::AppConfig &config) {
  net::HttpClient client(config.http_proxy);
  InstanceManager instances(config);
  WorkshopService service(instances, config, client);
  const std::vector<InstalledPackageEntry> installed = service.list_installed();
  std::lock_guard<std::mutex> lock(mutex_);
  installed_ = installed;
  ++revision_;
}

bool WorkshopStore::add_version(const config::AppConfig &config,
                                const WorkshopPackage &package) {
  if (package.url.empty()) {
    return false;
  }
  config::AppConfig local = config;
  WorkshopPackage local_package = package;
  std::thread side([this, local, local_package] {
    net::HttpClient client(local.http_proxy);
    std::string logo;
    if (!local_package.logo.empty()) {
      const std::string logo_url = std::string(kVersionsBase) + "/" +
                                   local_package.id + "/" + local_package.logo;
      const std::filesystem::path logos_dir = core::app_data_dir() / "logos";
      if (core::ensure_directory(logos_dir)) {
        const std::filesystem::path destination =
            logos_dir /
            (sanitize_token(local_package.id) + extension_of(logo_url));
        std::optional<std::string> last_modified;
        std::string error;
        net::CancelToken token;
        if (client.download(logo_url, destination, token, nullptr,
                            last_modified, error)) {
          logo = destination.string();
        }
      }
    }
    config::CustomEdition edition;
    edition.id = local_package.id;
    edition.name = local_package.name;
    edition.desc = local_package.description;
    edition.url = local_package.url;
    edition.category = local_package.category;
    if (!logo.empty()) {
      edition.logo = logo;
    }
    std::lock_guard<std::mutex> lock(mutex_);
    pending_edition_ = std::move(edition);
    ++revision_;
  });
  side_threads_.push_back(std::move(side));
  return true;
}

std::optional<config::CustomEdition> WorkshopStore::consume_pending_edition() {
  std::lock_guard<std::mutex> lock(mutex_);
  std::optional<config::CustomEdition> edition = std::move(pending_edition_);
  pending_edition_.reset();
  return edition;
}

void WorkshopStore::run_catalog(config::AppConfig config) {
  net::HttpClient client(config.http_proxy);
  WorkshopCatalog local;
  const auto fetch_json = [&client](const std::string &url, Json &out) {
    const net::HttpResponse response = client.get(url);
    if (response.status != 200 || response.body.empty()) {
      return false;
    }
    try {
      out = Json::parse(response.body);
      return true;
    } catch (const std::exception &) {
      return false;
    }
  };

  Json registry;
  if (fetch_json(kRegistryUrl, registry)) {
    if (const auto list = registry.find("packages");
        list != registry.end() && list->is_array()) {
      for (const Json &item : *list) {
        local.packages.push_back(parse_package(item));
      }
    }
  } else {
    local.error = "registry";
  }

  Json versions;
  if (fetch_json(kVersionsUrl, versions)) {
    if (const auto list = versions.find("versionlist");
        list != versions.end() && list->is_array()) {
      for (const Json &item : *list) {
        local.versions.push_back(parse_package(item));
      }
    }
  }

  Json servers;
  if (fetch_json(std::string(kLceOnlineBase) + "/servers", servers)) {
    if (servers.is_array()) {
      for (const Json &item : servers) {
        local.servers.push_back(server_listing_to_package(item));
      }
    }
  }
  {
    std::lock_guard<std::mutex> lock(mutex_);
    catalog_.loading = false;
    if (!local.error.empty() && local.packages.empty()) {
      catalog_.error = local.error;
    }
    catalog_.packages = local.packages;
    catalog_.versions = local.versions;
    catalog_.servers = local.servers;
    ++revision_;
  }

  const auto sync_thumbnail = [&](std::vector<WorkshopPackage> &stored_list,
                                  const WorkshopPackage &package) {
    std::lock_guard<std::mutex> lock(mutex_);
    for (WorkshopPackage &stored : stored_list) {
      if (stored.id == package.id) {
        stored.thumbnail_data = package.thumbnail_data;
        break;
      }
    }
    ++revision_;
  };

  for (const WorkshopPackage &package : local.packages) {
    if (stopping_) {
      return;
    }
    WorkshopPackage loaded = package;
    loaded.thumbnail_data = fetch_thumbnail(client, loaded, kRawBase);
    sync_thumbnail(catalog_.packages, loaded);
  }
  for (const WorkshopPackage &package : local.versions) {
    if (stopping_) {
      return;
    }
    WorkshopPackage loaded = package;
    loaded.thumbnail_data = fetch_thumbnail(client, loaded, kVersionsBase);
    sync_thumbnail(catalog_.versions, loaded);
  }
  for (const WorkshopPackage &package : local.servers) {
    if (stopping_) {
      return;
    }
    WorkshopPackage loaded = package;
    loaded.thumbnail_data = fetch_thumbnail(client, loaded, std::string());
    sync_thumbnail(catalog_.servers, loaded);
  }
}

void WorkshopStore::run_jobs() {
  while (true) {
    WorkshopJobStep step;
    {
      std::unique_lock<std::mutex> lock(mutex_);
      job_cv_.wait(lock, [this] { return stopping_ || !queue_.empty(); });
      if (stopping_) {
        return;
      }
      step = queue_.front();
      queue_.pop_front();
      job_.state = WorkshopJobState::running;
      job_.kind = step.uninstall ? "uninstall" : "install";
      job_.label.clear();
      job_.percent = 0.0;
      job_.message.clear();
      ++revision_;
    }

    net::HttpClient client(job_config_.http_proxy);
    InstanceManager instances(job_config_);
    WorkshopService service(instances, job_config_, client);
    net::CancelToken token;
    std::string error;
    bool ok = false;
    std::size_t done_zips = 0;
    std::size_t total_zips = step.zips_count;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      for (const WorkshopJobStep &queued : queue_) {
        total_zips += queued.zips_count;
      }
    }

    const auto on_progress = [&](double percent) {
      std::size_t done = 0;
      if (step.zips_count > 0) {
        done = static_cast<std::size_t>(
            static_cast<double>(step.zips_count) * percent / 100.0 + 0.5);
        done = std::min(done, step.zips_count);
      }
      std::lock_guard<std::mutex> lock(mutex_);
      job_.percent = static_cast<double>(done_zips + done) /
                     static_cast<double>(total_zips > 0 ? total_zips : 1) *
                     100.0;
      job_.label = step.label;
      ++revision_;
    };

    if (step.uninstall) {
      ok = service.uninstall(step.instance_id, step.package_id, error);
    } else {
      WorkshopInstallRequest request;
      request.instance_id = step.instance_id;
      request.package_id = step.package_id;
      request.zips = step.zips;
      request.version = step.version;
      ok = service.install(request, token, on_progress, error);
    }

    if (!ok) {
      std::lock_guard<std::mutex> lock(mutex_);
      job_.state = WorkshopJobState::failed;
      job_.message = error.empty()
                         ? (step.uninstall ? "Failed to remove "
                                           : "Failed to install ") +
                               step.package_id
                         : error;
      ++revision_;
      continue;
    }

    refresh_installed(job_config_);
    std::lock_guard<std::mutex> lock(mutex_);
    done_zips += step.zips_count;
    job_.percent = static_cast<double>(done_zips) /
                   static_cast<double>(total_zips > 0 ? total_zips : 1) * 100.0;
    if (queue_.empty()) {
      job_.state = WorkshopJobState::finished;
    }
    ++revision_;
  }
}
} // namespace emerald::instances
