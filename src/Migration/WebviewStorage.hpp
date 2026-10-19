#pragma once
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::migration {
struct StorageEntry {
  std::string key;
  std::string raw;
};

std::vector<std::filesystem::path> launcher_storage_files();
std::vector<StorageEntry> read_launcher_local_storage();
} // namespace emerald::migration
