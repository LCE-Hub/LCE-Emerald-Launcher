#include "Instances/Workshop.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Core/Paths.hpp"
#include "Instances/Installer.hpp"
#include <algorithm>
#include <archive.h>
#include <archive_entry.h>
#include <cstdio>
#include <unordered_set>
namespace emerald::instances {
namespace {
const char *kWorkshopRawBase =
    "https://raw.githubusercontent.com/LCE-Hub/LCE-Workshop/refs/heads/main";
std::string to_lower(std::string value) {
  for (char &character : value) {
    if (character >= 'A' && character <= 'Z') {
      character = static_cast<char>(character - 'A' + 'a');
    }
  }
  return value;
}

std::vector<std::string> read_string_list(const std::filesystem::path &path) {
  std::vector<std::string> values;
  const std::optional<std::string> text = core::read_file(path);
  if (!text.has_value()) {
    return values;
  }
  Json json = Json::array();
  try {
    json = Json::parse(*text);
  } catch (const std::exception &) {
    return values;
  }
  if (!json.is_array()) {
    return values;
  }
  for (const Json &item : json) {
    if (item.is_string()) {
      values.push_back(item.get<std::string>());
    }
  }
  return values;
}

std::vector<InstalledWorkshopPackage>
read_packages(const std::filesystem::path &path) {
  std::vector<InstalledWorkshopPackage> packages;
  const std::optional<std::string> text = core::read_file(path);
  if (!text.has_value()) {
    return packages;
  }
  Json json = Json::array();
  try {
    json = Json::parse(*text);
  } catch (const std::exception &) {
    return packages;
  }
  if (!json.is_array()) {
    return packages;
  }
  for (const Json &item : json) {
    if (!item.is_object()) {
      continue;
    }
    InstalledWorkshopPackage package;
    package.id = json_optional<std::string>(item, "id").value_or("");
    package.version = json_optional<std::string>(item, "version").value_or("");
    const auto dirs = json_optional<Json>(item, "dirs");
    if (dirs.has_value() && dirs->is_array()) {
      for (const Json &dir : *dirs) {
        if (dir.is_string()) {
          package.dirs.push_back(dir.get<std::string>());
        }
      }
    }
    packages.push_back(std::move(package));
  }
  return packages;
}

std::string write_string_list(const std::filesystem::path &path,
                              const std::vector<std::string> &values) {
  Json json = Json::array();
  for (const std::string &value : values) {
    json.push_back(value);
  }
  return core::write_file(path, json.dump())
             ? std::string()
             : "Failed to write " + path.string();
}

std::string
write_packages(const std::filesystem::path &path,
               const std::vector<InstalledWorkshopPackage> &packages) {
  Json json = Json::array();
  for (const InstalledWorkshopPackage &package : packages) {
    Json entry = Json::object();
    entry["id"] = package.id;
    entry["version"] = package.version;
    entry["dirs"] = package.dirs;
    json.push_back(std::move(entry));
  }
  return core::write_file(path, json.dump())
             ? std::string()
             : "Failed to write " + path.string();
}

void replace_all(std::string &text, const std::string &from,
                 const std::string &to) {
  if (from.empty()) {
    return;
  }
  std::size_t position = 0;
  while ((position = text.find(from, position)) != std::string::npos) {
    text.replace(position, from.size(), to);
    position += to.size();
  }
}

std::string resolve_dest(const std::filesystem::path &instance_dir,
                         const std::string &placeholder) {
  if (placeholder.empty()) {
    return instance_dir.string();
  }
  const std::filesystem::path media_dir = instance_dir / "Windows64Media";
  std::string resolved = placeholder;
  replace_all(resolved, "{MediaDir}", media_dir.string());
  replace_all(resolved, "{DLCDir}", (media_dir / "DLC").string());
  replace_all(resolved, "{GameHDD}",
              (instance_dir / "Windows64" / "GameHDD").string());
  replace_all(resolved, "{MobDir}",
              (instance_dir / "Common" / "res" / "mob").string());
  return (instance_dir / std::filesystem::path(resolved)).string();
}

} // namespace

std::vector<WorkshopGroup>
group_archives(const std::map<std::string, std::string> &zips) {
  std::vector<WorkshopGroup> groups;
  std::unordered_set<std::string> consumed;
  for (const auto &[name, dest] : zips) {
    if (consumed.count(name) != 0) {
      continue;
    }
    if (to_lower(name).size() < 4 ||
        to_lower(name).compare(to_lower(name).size() - 4, 4, ".zip") != 0) {
      continue;
    }

    const std::string base = name.substr(0, name.size() - 4);
    std::vector<std::string> parts{name};
    consumed.insert(name);
    int index = 1;
    while (true) {
      char suffix[8];
      std::snprintf(suffix, sizeof(suffix), ".z%02d", index);
      const std::string candidate = base + suffix;
      if (zips.find(candidate) == zips.end()) {
        break;
      }
      parts.push_back(candidate);
      consumed.insert(candidate);
      ++index;
    }

    if (parts.size() == 1) {
      index = 1;
      while (true) {
        char suffix[16];
        std::snprintf(suffix, sizeof(suffix), ".zip.%03d", index);
        const std::string candidate = base + suffix;
        if (zips.find(candidate) == zips.end()) {
          break;
        }
        parts.push_back(candidate);
        consumed.insert(candidate);
        ++index;
      }
    }

    groups.push_back(WorkshopGroup{parts, dest});
  }

  for (const auto &[name, dest] : zips) {
    if (consumed.count(name) == 0) {
      consumed.insert(name);
      groups.push_back(WorkshopGroup{{name}, dest});
    }
  }

  return groups;
}

bool list_archive(const std::filesystem::path &archive,
                  std::vector<std::string> &out, std::string &error) {
  struct archive *input = archive_read_new();
  archive_read_support_filter_all(input);
  archive_read_support_format_all(input);
  if (archive_read_open_filename(input, archive.string().c_str(), 10240) !=
      ARCHIVE_OK) {
    error = "Failed to open " + archive.string();
    archive_read_free(input);
    return false;
  }

  struct archive_entry *entry = nullptr;
  while (archive_read_next_header(input, &entry) == ARCHIVE_OK) {
    const char *name = archive_entry_pathname(entry);
    if (name == nullptr) {
      continue;
    }
    const std::string entry_name(name);
    if (entry_name.empty() || entry_name.back() == '/' ||
        archive_entry_filetype(entry) == AE_IFDIR) {
      continue;
    }
    out.push_back(entry_name);
  }
  archive_read_free(input);
  return true;
}

std::vector<std::string>
read_workshop_files(const std::filesystem::path &instance_dir) {
  return read_string_list(instance_dir / "workshop_files.json");
}

std::vector<InstalledWorkshopPackage>
read_workshop_packages(const std::filesystem::path &instance_dir) {
  return read_packages(instance_dir / "workshop_packages.json");
}

bool WorkshopService::download_and_assemble(
    const std::filesystem::path &tmp_dir, const std::vector<std::string> &parts,
    const std::string &raw_base, std::size_t &done, std::size_t total,
    net::CancelToken &token,
    const std::function<void(double percent)> &on_progress,
    std::filesystem::path &out, std::string &error) {
  std::vector<std::filesystem::path> downloaded;
  for (const std::string &part : parts) {
    if (token.cancelled()) {
      error = "CANCELLED";
      return false;
    }

    const std::filesystem::path part_path = tmp_dir / part;
    if (!core::ensure_directory(part_path.parent_path())) {
      error = "Failed to create temporary directory";
      return false;
    }

    std::optional<std::string> last_modified;
    std::string download_error;
    if (!client_.download(raw_base + "/" + part, part_path, token, nullptr,
                          last_modified, download_error)) {
      error = "Failed to download " + part + ": " + download_error;
      return false;
    }

    ++done;
    if (on_progress) {
      const double divisor = total > 0 ? static_cast<double>(total) : 1.0;
      on_progress(static_cast<double>(done) / divisor * 100.0);
    }
    downloaded.push_back(part_path);
  }

  if (downloaded.size() == 1) {
    out = downloaded.front();
    return true;
  }

  const std::filesystem::path combined_dir = tmp_dir / "_combined";
  if (!core::ensure_directory(combined_dir)) {
    error = "Failed to create temporary directory";
    return false;
  }

  out = combined_dir / parts.front();
  std::FILE *target = std::fopen(out.string().c_str(), "wb");
  if (target == nullptr) {
    error = "Failed to create combined archive";
    return false;
  }
  for (const std::filesystem::path &part_path : downloaded) {
    std::FILE *source = std::fopen(part_path.string().c_str(), "rb");
    if (source == nullptr) {
      std::fclose(target);
      error = "Failed to read " + part_path.string();
      return false;
    }
    std::vector<char> buffer(64 * 1024);
    while (true) {
      const std::size_t read =
          std::fread(buffer.data(), 1, buffer.size(), source);
      if (read == 0) {
        break;
      }
      if (std::fwrite(buffer.data(), 1, read, target) != read) {
        std::fclose(source);
        std::fclose(target);
        error = "Failed to write combined archive";
        return false;
      }
    }
    std::fclose(source);
  }
  std::fclose(target);
  return true;
}

bool WorkshopService::install(
    const WorkshopInstallRequest &request, net::CancelToken &token,
    const std::function<void(double percent)> &on_progress,
    std::string &error) {
  const std::filesystem::path instance_dir =
      instances_.working_dir(request.instance_id);
  if (!std::filesystem::exists(instance_dir)) {
    error = "Instance not installed";
    return false;
  }

  const std::filesystem::path files_path = instance_dir / "workshop_files.json";
  const std::filesystem::path packages_path =
      instance_dir / "workshop_packages.json";
  std::vector<std::string> workshop_files = read_string_list(files_path);
  std::vector<InstalledWorkshopPackage> workshop_packages =
      read_packages(packages_path);
  workshop_packages.erase(
      std::remove_if(workshop_packages.begin(), workshop_packages.end(),
                     [&](const InstalledWorkshopPackage &package) {
                       return package.id == request.package_id;
                     }),
      workshop_packages.end());

  const std::string raw_base =
      std::string(kWorkshopRawBase) + "/" + request.package_id;
  const std::filesystem::path tmp_dir =
      core::app_data_dir() / ("workshop_tmp_" + request.package_id);
  std::error_code cleanup_error;
  std::filesystem::remove_all(tmp_dir, cleanup_error);
  if (!core::ensure_directory(tmp_dir)) {
    error = "Failed to create temporary directory";
    return false;
  }

  std::vector<std::string> package_dirs;
  const std::vector<WorkshopGroup> groups = group_archives(request.zips);
  std::size_t done_parts = 0;
  const std::size_t total_parts = request.zips.size();
  for (const WorkshopGroup &group : groups) {
    const std::filesystem::path dest_dir(
        resolve_dest(instance_dir, group.dest));
    if (!core::ensure_directory(dest_dir)) {
      std::filesystem::remove_all(tmp_dir, cleanup_error);
      error = "Failed to create destination directory";
      return false;
    }

    std::filesystem::path archive_tmp;
    if (!download_and_assemble(tmp_dir, group.parts, raw_base, done_parts,
                               total_parts, token, on_progress, archive_tmp,
                               error)) {
      std::filesystem::remove_all(tmp_dir, cleanup_error);
      return false;
    }

    std::vector<std::string> files;
    if (!list_archive(archive_tmp, files, error)) {
      std::filesystem::remove_all(tmp_dir, cleanup_error);
      return false;
    }

    for (const std::string &file : files) {
      const std::filesystem::path full = dest_dir / file;
      std::error_code file_error;
      if (!std::filesystem::is_regular_file(full, file_error)) {
        continue;
      }
      const std::filesystem::path backup =
          std::filesystem::path(full.string() + ".bak");
      std::error_code backup_error;
      if (!std::filesystem::exists(backup, backup_error)) {
        std::error_code rename_error;
        std::filesystem::rename(full, backup, rename_error);
      }
    }

    std::string extract_error;
    if (!extract_archive(archive_tmp, dest_dir, extract_error)) {
      std::filesystem::remove_all(tmp_dir, cleanup_error);
      error = "Extraction failed for " + group.parts.front();
      return false;
    }

    for (const std::string &file : files) {
      const std::string full = (dest_dir / file).string();
      if (std::find(workshop_files.begin(), workshop_files.end(), full) ==
          workshop_files.end()) {
        workshop_files.push_back(full);
      }
      if (std::find(package_dirs.begin(), package_dirs.end(), full) ==
          package_dirs.end()) {
        package_dirs.push_back(full);
      }
    }
  }

  std::filesystem::remove_all(tmp_dir, cleanup_error);
  const std::string files_error = write_string_list(files_path, workshop_files);
  if (!files_error.empty()) {
    error = files_error;
    return false;
  }

  workshop_packages.push_back(InstalledWorkshopPackage{
      request.package_id, request.version, package_dirs});
  const std::string packages_error =
      write_packages(packages_path, workshop_packages);
  if (!packages_error.empty()) {
    error = packages_error;
    return false;
  }
  return true;
}

bool WorkshopService::uninstall(const std::string &instance_id,
                                const std::string &package_id,
                                std::string &error) {
  const std::filesystem::path instance_dir =
      instances_.working_dir(instance_id);
  const std::filesystem::path packages_path =
      instance_dir / "workshop_packages.json";
  const std::filesystem::path files_path = instance_dir / "workshop_files.json";
  std::vector<InstalledWorkshopPackage> packages = read_packages(packages_path);
  std::vector<std::string> removed_dirs;
  for (const InstalledWorkshopPackage &package : packages) {
    if (package.id != package_id) {
      continue;
    }
    removed_dirs = package.dirs;
    for (const std::string &file : package.dirs) {
      const std::filesystem::path path(file);
      std::error_code file_error;
      if (!std::filesystem::is_regular_file(path, file_error)) {
        continue;
      }
      std::filesystem::remove(path, file_error);
      const std::filesystem::path backup(std::filesystem::path(file + ".bak"));
      std::error_code backup_error;
      if (std::filesystem::is_regular_file(backup, backup_error)) {
        std::error_code rename_error;
        std::filesystem::rename(backup, path, rename_error);
      }
    }
    break;
  }

  packages.erase(std::remove_if(packages.begin(), packages.end(),
                                [&](const InstalledWorkshopPackage &package) {
                                  return package.id == package_id;
                                }),
                 packages.end());
  const std::string packages_error = write_packages(packages_path, packages);
  if (!packages_error.empty()) {
    error = packages_error;
    return false;
  }

  std::vector<std::string> workshop_files = read_string_list(files_path);
  workshop_files.erase(
      std::remove_if(workshop_files.begin(), workshop_files.end(),
                     [&](const std::string &file) {
                       return std::find(removed_dirs.begin(),
                                        removed_dirs.end(),
                                        file) != removed_dirs.end();
                     }),
      workshop_files.end());
  const std::string files_error = write_string_list(files_path, workshop_files);
  if (!files_error.empty()) {
    error = files_error;
    return false;
  }
  return true;
}

std::vector<InstalledPackageEntry> WorkshopService::list_installed() const {
  std::vector<InstalledPackageEntry> result;
  const std::filesystem::path managed_root = core::instances_dir();
  std::error_code root_error;
  std::filesystem::directory_iterator root_it(managed_root, root_error);
  if (!root_error) {
    for (const std::filesystem::directory_entry &entry : root_it) {
      std::error_code entry_error;
      if (!entry.is_directory(entry_error)) {
        continue;
      }
      const std::string instance_id = entry.path().filename().string();
      for (const InstalledWorkshopPackage &package :
           read_packages(entry.path() / "workshop_packages.json")) {
        result.push_back(
            InstalledPackageEntry{instance_id, package.id, package.version});
      }
    }
  }

  if (config_.custom_editions.has_value()) {
    for (const config::CustomEdition &edition : *config_.custom_editions) {
      if (!edition.path.has_value() || edition.path->empty()) {
        continue;
      }
      const std::filesystem::path base_dir(*edition.path);
      for (const InstalledWorkshopPackage &package :
           read_packages(base_dir / "workshop_packages.json")) {
        result.push_back(
            InstalledPackageEntry{edition.id, package.id, package.version});
      }
    }
  }

  return result;
}
} // namespace emerald::instances