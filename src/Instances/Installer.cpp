#include "Instances/Installer.hpp"
#include "Core/Fs.hpp"
#include "Instances/InstanceManager.hpp"
#include "Instances/Workshop.hpp"
#include <archive.h>
#include <archive_entry.h>
#include <string_view>
#include <sys/stat.h>
#include <vector>
namespace emerald::instances {
namespace {
bool safe_path_within(const std::filesystem::path &base,
                      const std::filesystem::path &target) {
  const std::filesystem::path root = std::filesystem::weakly_canonical(base);
  std::error_code error;
  const std::filesystem::path resolved =
      std::filesystem::weakly_canonical(target, error);
  const std::string root_str = root.string();
  const std::string target_str = error ? target.string() : resolved.string();
  if (target_str.size() < root_str.size()) {
    return false;
  }
  if (target_str.compare(0, root_str.size(), root_str) != 0) {
    return false;
  }
  return target_str.size() == root_str.size() ||
         target_str[root_str.size()] == '/';
}

void write_from_archive(struct archive *archive, struct archive_entry *entry,
                        const std::filesystem::path &dest) {
  const mode_t mode = archive_entry_perm(entry);
  const void *buffer = nullptr;
  size_t size = 0;
  la_ssize_t offset = 0;
  std::FILE *out = std::fopen(dest.string().c_str(), "wb");
  if (out == nullptr) {
    return;
  }
  while (archive_read_data_block(archive, &buffer, &size, &offset) ==
         ARCHIVE_OK) {
    const size_t written = std::fwrite(buffer, 1, size, out);
    if (written != size) {
      break;
    }
  }
  std::fclose(out);
  if (mode != 0) {
    chmod(dest.string().c_str(), static_cast<mode_t>(mode) & 0777);
  }
}

bool names_match_keep(const std::filesystem::path &child,
                      const std::vector<std::string> &keep) {
  const std::string name = child.filename().string();
  for (const std::string &entry : keep) {
    if (entry == name) {
      return true;
    }
  }
  return false;
}

bool is_workshop_path(const std::filesystem::path &child,
                      const std::vector<std::string> &workshop_files) {
  const std::string child_str = child.string();
  for (const std::string &workshop : workshop_files) {
    if (workshop.empty()) {
      continue;
    }
    if (child_str.compare(0, workshop.size(), workshop) == 0 ||
        workshop.compare(0, child_str.size(), child_str) == 0) {
      return true;
    }
  }
  return false;
}

bool move_entry(const std::filesystem::path &source,
                const std::filesystem::path &target) {
  std::error_code error;
  std::filesystem::rename(source, target, error);
  if (!error) {
    return true;
  }
  error.clear();
  if (std::filesystem::is_directory(source, error)) {
    error.clear();
    if (!core::copy_directory(source, target)) {
      return false;
    }
  } else {
    if (!core::copy_file(source, target)) {
      return false;
    }
  }
  std::error_code remove_error;
  std::filesystem::remove_all(source, remove_error);
  return true;
}
} // namespace

bool extract_archive(const std::filesystem::path &archive,
                     const std::filesystem::path &dest, std::string &error) {
  return extract_archive_strip(archive, dest, 0, error);
}

bool extract_archive_strip(const std::filesystem::path &archive,
                           const std::filesystem::path &dest,
                           int strip_components, std::string &error) {
  if (!core::ensure_directory(dest)) {
    error = "Failed to create destination directory";
    return false;
  }

  struct archive *input = archive_read_new();
  archive_read_support_filter_all(input);
  archive_read_support_format_all(input);
  if (archive_read_open_filename(input, archive.string().c_str(), 10240) !=
      ARCHIVE_OK) {
    error = archive_error_string(input);
    archive_read_free(input);
    return false;
  }

  struct archive_entry *entry = nullptr;
  bool ok = true;
  while (archive_read_next_header(input, &entry) == ARCHIVE_OK) {
    const std::string entry_path = archive_entry_pathname(entry);
    if (entry_path.empty()) {
      continue;
    }

    std::string relative = entry_path;
    for (int skipped = 0; skipped < strip_components; ++skipped) {
      const std::size_t slash = relative.find('/');
      if (slash == std::string::npos) {
        relative.clear();
        break;
      }
      relative.erase(0, slash + 1);
    }
    if (relative.empty()) {
      continue;
    }

    const std::filesystem::path target = dest / std::filesystem::path(relative);
    if (!safe_path_within(dest, target)) {
      error = "Archive entry escapes destination";
      ok = false;
      break;
    }
    if (archive_entry_filetype(entry) == AE_IFDIR) {
      core::ensure_directory(target);
      continue;
    }
    if (archive_entry_filetype(entry) == AE_IFLNK) {
      const char *link = archive_entry_symlink(entry);
      if (link != nullptr) {
        std::error_code link_error;
        std::filesystem::remove(target, link_error);
        std::filesystem::create_symlink(link, target, link_error);
      }
      continue;
    }
    core::ensure_directory(target.parent_path());
    write_from_archive(input, entry, target);
  }

  const int read_result = archive_read_free(input);
  if (!ok) {
    return false;
  }
  if (read_result != ARCHIVE_OK) {
    error = "Archive read failed";
    return false;
  }
  return true;
}

void prune_instance(const std::filesystem::path &instance_dir,
                    const std::vector<std::string> &keep,
                    const std::vector<std::string> &workshop_files) {
  std::error_code error;
  std::filesystem::directory_iterator it(instance_dir, error);
  if (error) {
    return;
  }
  for (const std::filesystem::directory_entry &entry : it) {
    const std::filesystem::path child = entry.path();
    if (names_match_keep(child, keep)) {
      continue;
    }
    if (is_workshop_path(child, workshop_files)) {
      continue;
    }
    remove_all(child, error);
    error.clear();
  }
}

void flatten_instance(const std::filesystem::path &instance_dir) {
  std::error_code error;
  std::filesystem::directory_iterator it(instance_dir, error);
  if (error) {
    return;
  }

  std::filesystem::path inner_dir;
  for (const std::filesystem::directory_entry &entry : it) {
    const std::filesystem::path &child = entry.path();
    if (!std::filesystem::is_directory(child, error)) {
      continue;
    }
    error.clear();
    if (!std::filesystem::exists(child / std::string(kExecutableMarker),
                                 error)) {
      continue;
    }
    inner_dir = child;
    break;
  }
  if (inner_dir.empty()) {
    return;
  }

  std::error_code move_error;
  std::vector<std::filesystem::path> inner_entries;
  for (const std::filesystem::directory_entry &entry :
       std::filesystem::directory_iterator(inner_dir, move_error)) {
    inner_entries.push_back(entry.path());
  }
  move_error.clear();

  bool complete = true;
  for (const std::filesystem::path &source : inner_entries) {
    const std::filesystem::path target = instance_dir / source.filename();
    if (names_match_keep(source, keep_list()) &&
        std::filesystem::exists(target, move_error)) {
      move_error.clear();
      continue;
    }
    if (!move_entry(source, target)) {
      complete = false;
    }
  }
  if (!complete) {
    return;
  }
  std::error_code remove_error;
  std::filesystem::remove_all(inner_dir, remove_error);
}

DownloadStatus install_instance_archive(
    net::HttpClient &client, const std::string &url,
    const std::filesystem::path &instance_dir,
    const std::filesystem::path &archive_dir, net::CancelToken &token,
    const std::function<void(double percent)> &on_progress) {
  DownloadStatus status;
  if (!core::ensure_directory(archive_dir)) {
    status.error = "Failed to create archive directory";
    return status;
  }
  if (!core::ensure_directory(instance_dir)) {
    status.error = "Failed to create instance directory";
    return status;
  }

  const std::filesystem::path archive = archive_dir / "instance.tar.gz";
  status = download_file(client, url, archive, token, on_progress);
  if (!status.ok) {
    return status;
  }
  if (token.cancelled()) {
    status.cancelled = true;
    return status;
  }
  prune_instance(instance_dir, keep_list(), read_workshop_files(instance_dir));
  std::string error;
  const bool extracted = extract_archive(archive, instance_dir, error);
  std::error_code cleanup_error;
  std::filesystem::remove(archive, cleanup_error);
  if (!extracted) {
    status.error = error;
    return status;
  }
  flatten_instance(instance_dir);
  if (status.last_modified) {
    core::write_file_atomic(instance_dir / "update_timestamp.txt",
                            *status.last_modified);
  }
  return status;
}
} // namespace emerald::instances