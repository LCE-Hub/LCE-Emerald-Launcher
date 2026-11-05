#include "Instances/Backup.hpp"
#include "Core/Fs.hpp"
#include "Instances/Installer.hpp"
#include "Instances/InstanceManager.hpp"
#include <algorithm>
#include <archive.h>
#include <archive_entry.h>
#include <cstdio>
#include <vector>
namespace emerald::instances {
namespace {
bool write_file_data(struct archive *output, const std::filesystem::path &path,
                     std::string &error) {
  std::FILE *source = std::fopen(path.string().c_str(), "rb");
  if (source == nullptr) {
    error = "Failed to read " + path.string();
    return false;
  }

  std::vector<char> buffer(64 * 1024);
  while (true) {
    const std::size_t read =
        std::fread(buffer.data(), 1, buffer.size(), source);
    if (read == 0) {
      break;
    }
    if (archive_write_data(output, buffer.data(), read) < 0) {
      std::fprintf(stderr, "backup: %s\n", archive_error_string(output));
      std::fclose(source);
      error = "Failed to write archive data";
      return false;
    }
  }
  std::fclose(source);
  return true;
}

bool write_entry(struct archive *output, const std::filesystem::path &path,
                 const std::string &archive_path, std::string &error) {
  struct archive_entry *entry = archive_entry_new();
  archive_entry_set_pathname(entry, archive_path.c_str());
  std::error_code error_code;
  if (std::filesystem::is_symlink(path, error_code)) {
    const std::filesystem::path target =
        std::filesystem::read_symlink(path, error_code);
    if (error_code) {
      archive_entry_free(entry);
      error = "Failed to read symlink " + path.string();
      return false;
    }
    archive_entry_set_filetype(entry, AE_IFLNK);
    archive_entry_set_symlink(entry, target.string().c_str());
    archive_entry_set_perm(entry, 0777);
    archive_entry_set_size(entry, 0);
    if (archive_write_header(output, entry) != ARCHIVE_OK) {
      archive_entry_free(entry);
      error = "Failed to write symlink entry";
      return false;
    }
    archive_entry_free(entry);
    return true;
  }

  if (std::filesystem::is_directory(path, error_code)) {
    archive_entry_set_filetype(entry, AE_IFDIR);
    archive_entry_set_perm(entry, 0755);
    if (archive_write_header(output, entry) != ARCHIVE_OK) {
      archive_entry_free(entry);
      error = "Failed to write directory entry";
      return false;
    }
    archive_entry_free(entry);
    return true;
  }

  const std::size_t size =
      static_cast<std::size_t>(std::filesystem::file_size(path, error_code));
  if (error_code) {
    archive_entry_free(entry);
    error = "Failed to stat " + path.string();
    return false;
  }

  archive_entry_set_filetype(entry, AE_IFREG);
  archive_entry_set_perm(entry, 0644);
  archive_entry_set_size(entry, static_cast<la_int64_t>(size));
  if (archive_write_header(output, entry) != ARCHIVE_OK) {
    archive_entry_free(entry);
    error = "Failed to write file entry";
    return false;
  }
  archive_entry_free(entry);

  if (size == 0) {
    return true;
  }
  return write_file_data(output, path, error);
}

bool write_recursive(struct archive *output,
                     const std::filesystem::path &current,
                     const std::filesystem::path &root,
                     const std::string &prefix, std::string &error) {
  std::error_code error_code;
  std::filesystem::directory_iterator it(current, error_code);
  if (error_code) {
    error = "Failed to read directory " + current.string();
    return false;
  }

  std::vector<std::filesystem::path> children;
  for (const std::filesystem::directory_entry &entry : it) {
    children.push_back(entry.path());
  }
  std::sort(children.begin(), children.end());
  for (const std::filesystem::path &child : children) {
    const std::string name = child.filename().string();
    if (!write_entry(output, child, prefix + "/" + name, error)) {
      return false;
    }
    std::error_code child_error;
    if (std::filesystem::is_directory(child, child_error) &&
        !std::filesystem::is_symlink(child, child_error)) {
      if (!write_recursive(output, child, root, prefix + "/" + name, error)) {
        return false;
      }
    }
  }
  return true;
}
} // namespace

bool create_instance_backup(const std::filesystem::path &instance_dir,
                            const std::filesystem::path &destination,
                            std::string &error) {
  std::error_code error_code;
  if (!std::filesystem::is_directory(instance_dir, error_code)) {
    error = "Instance not found";
    return false;
  }
  if (!core::ensure_directory(destination.parent_path())) {
    error = "Failed to create backup directory";
    return false;
  }

  struct archive *output = archive_write_new();
  archive_write_add_filter_gzip(output);
  archive_write_set_format_pax_restricted(output);
  if (archive_write_open_filename(output, destination.string().c_str()) !=
      ARCHIVE_OK) {
    error = "Failed to create backup";
    archive_write_free(output);
    return false;
  }

  const std::string prefix = instance_dir.filename().string();
  if (prefix.empty()) {
    error = "Invalid dir name";
    archive_write_free(output);
    return false;
  }

  bool ok = write_entry(output, instance_dir, prefix, error);
  if (ok) {
    ok = write_recursive(output, instance_dir, instance_dir, prefix, error);
  }

  archive_write_close(output);
  archive_write_free(output);
  return ok;
}

std::optional<std::string>
restore_instance_backup(const std::filesystem::path &archive,
                        const std::filesystem::path &instances_dir,
                        std::string &error) {
  if (!core::ensure_directory(instances_dir)) {
    error = "Failed to create instances directory";
    return std::nullopt;
  }

  std::string extract_error;
  if (!extract_archive(archive, instances_dir, extract_error)) {
    error = "Failed to extract backup: " + extract_error;
    return std::nullopt;
  }

  std::error_code error_code;
  std::filesystem::directory_iterator it(instances_dir, error_code);
  if (!error_code) {
    std::vector<std::filesystem::path> candidates;
    for (const std::filesystem::directory_entry &entry : it) {
      if (!entry.is_directory(error_code)) {
        continue;
      }
      candidates.push_back(entry.path());
    }
    std::sort(candidates.begin(), candidates.end());
    for (const std::filesystem::path &candidate : candidates) {
      if (std::filesystem::exists(candidate / std::string(kExecutableMarker),
                                  error_code)) {
        return candidate.filename().string();
      }
    }
  }
  return std::string("restored");
}
} // namespace emerald::instances