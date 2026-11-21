#pragma once
#include <filesystem>
#include <string>
#include <string_view>
namespace emerald::core::embedded {
struct RawFile {
  const char *path;
  const char *data;
  unsigned long long size;
};
namespace detail {
extern const char kBuildId[];
extern const unsigned long long kFileCount;
extern const RawFile kFiles[];
} // namespace detail

std::string_view build_id();
bool is_extracted(const std::filesystem::path &root);
bool extract_to(const std::filesystem::path &root);
} // namespace emerald::core::embedded
