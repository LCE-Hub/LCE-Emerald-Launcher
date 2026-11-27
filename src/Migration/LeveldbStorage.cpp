#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Migration/WebviewStorage.hpp"
#include <system_error>
namespace emerald::migration {
std::vector<std::filesystem::path> launcher_storage_files() {
  std::vector<std::filesystem::path> files;
  const std::filesystem::path directory = core::app_data_dir() / "EBWebView" /
                                          "Default" / "Local Storage" /
                                          "leveldb";

  std::error_code error;
  if (std::filesystem::is_directory(directory, error)) {
    files.push_back(directory);
  }
  return files;
}

std::vector<StorageEntry> read_launcher_local_storage() {
  core::warn(
      "migration: WebView2 leveldb todo here lmao"); // neo: TODO: implement
  return {};
}

} // namespace emerald::migration
