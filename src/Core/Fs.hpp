#pragma once
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>
namespace emerald::core {
bool file_exists(const std::filesystem::path &path);
bool ensure_directory(const std::filesystem::path &path);
std::optional<std::string> read_file(const std::filesystem::path &path);
bool write_file(const std::filesystem::path &path, std::string_view contents);
bool write_file_atomic(const std::filesystem::path &path,
                       std::string_view contents);
bool copy_directory(const std::filesystem::path &from,
                    const std::filesystem::path &to);
bool copy_file(const std::filesystem::path &from,
               const std::filesystem::path &to);
} // namespace emerald::core
