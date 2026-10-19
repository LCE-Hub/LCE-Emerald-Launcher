#pragma once
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
namespace emerald::platform {
enum class Os {
  Linux,
  Macos,
  Windows,
};

Os current_os();
std::string_view os_name(Os os);
std::string_view os_name();
std::filesystem::path macos_runtime_dir();
std::optional<std::filesystem::path>
find_executable_recursive(const std::filesystem::path &root,
                          std::string_view file_name);
bool macos_runtime_installed();
std::string unix_path_to_wine_z_path(const std::filesystem::path &path);
void kill_process_tree(const std::filesystem::path &instance_dir);
void kill_process_tree_matching(std::string_view command_marker);
bool open_path(const std::filesystem::path &path);
} // namespace emerald::platform
