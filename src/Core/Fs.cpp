#include "Core/Fs.hpp"
#include <fstream>
#include <system_error>
namespace emerald::core {
namespace {
std::filesystem::path temp_sibling_path(const std::filesystem::path &path) {
  std::filesystem::path temp = path;
  temp += ".tmp";
  return temp;
}
} // namespace

bool file_exists(const std::filesystem::path &path) {
  std::error_code error;
  return std::filesystem::is_regular_file(path, error);
}

bool ensure_directory(const std::filesystem::path &path) {
  if (path.empty()) {
    return false;
  }
  std::error_code error;
  std::filesystem::create_directories(path, error);
  return std::filesystem::is_directory(path, error);
}

std::optional<std::string> read_file(const std::filesystem::path &path) {
  std::ifstream stream{path, std::ios::binary};
  if (!stream) {
    return std::nullopt;
  }
  std::string contents;
  stream.seekg(0, std::ios::end);
  const std::streamoff size = stream.tellg();
  if (size > 0) {
    contents.resize(static_cast<std::size_t>(size));
    stream.seekg(0, std::ios::beg);
    stream.read(contents.data(), size);
  }
  return contents;
}

bool write_file(const std::filesystem::path &path, std::string_view contents) {
  if (path.has_parent_path() && !ensure_directory(path.parent_path())) {
    return false;
  }
  std::ofstream stream{path, std::ios::binary | std::ios::trunc};
  if (!stream) {
    return false;
  }
  stream.write(contents.data(), static_cast<std::streamsize>(contents.size()));
  return static_cast<bool>(stream);
}

bool write_file_atomic(const std::filesystem::path &path,
                       std::string_view contents) {
  const std::filesystem::path temp = temp_sibling_path(path);
  if (!write_file(temp, contents)) {
    return false;
  }
  std::error_code error;
  std::filesystem::rename(temp, path, error);
  if (error) {
    std::filesystem::remove(temp, error);
    return false;
  }
  return true;
}

bool copy_file(const std::filesystem::path &from,
               const std::filesystem::path &to) {
  std::error_code error;
  if (!ensure_directory(to.parent_path())) {
    return false;
  }
  std::filesystem::copy_file(
      from, to, std::filesystem::copy_options::overwrite_existing, error);
  return !error;
}

bool copy_directory(const std::filesystem::path &from,
                    const std::filesystem::path &to) {
  std::error_code error;
  std::filesystem::create_directories(to, error);
  if (error) {
    return false;
  }
  for (const std::filesystem::directory_entry &entry :
       std::filesystem::directory_iterator(from, error)) {
    if (error) {
      return false;
    }
    const std::filesystem::path target = to / entry.path().filename();
    if (entry.is_directory()) {
      if (!copy_directory(entry.path(), target)) {
        return false;
      }
    } else {
      std::filesystem::copy_file(
          entry.path(), target,
          std::filesystem::copy_options::overwrite_existing, error);
      if (error) {
        return false;
      }
    }
  }
  return true;
}
} // namespace emerald::core
