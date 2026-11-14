#pragma once
#include <filesystem>
namespace emerald::core {
std::filesystem::path app_data_dir();
std::filesystem::path config_file_path();
std::filesystem::path playtime_file_path();
std::filesystem::path state_file_path();
std::filesystem::path instances_dir();
std::filesystem::path executable_dir();
std::filesystem::path local_storage_dir();
std::filesystem::path webkit_website_data_dir();
} // namespace emerald::core
