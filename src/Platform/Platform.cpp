#include "Platform/Platform.hpp"
#include "Core/Paths.hpp"
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
#if defined(_WIN32)
#include <windows.h>
#else
#include <csignal>
#include <sys/types.h>
#include <unistd.h>
#endif
namespace emerald::platform {
Os current_os() {
#if defined(_WIN32)
  return Os::Windows;
#elif defined(__APPLE__)
  return Os::Macos;
#else
  return Os::Linux;
#endif
}

std::string_view os_name(Os os) {
  switch (os) {
  case Os::Windows:
    return "windows";
  case Os::Macos:
    return "macos";
  case Os::Linux:
    break;
  }
  return "linux";
}

std::string_view os_name() { return os_name(current_os()); }

std::filesystem::path macos_runtime_dir() {
  return core::app_data_dir() / "runtime";
}

std::optional<std::filesystem::path>
find_executable_recursive(const std::filesystem::path &root,
                          std::string_view file_name) {
  std::error_code error;
  std::filesystem::directory_iterator iterator(root, error);
  if (error) {
    return std::nullopt;
  }
  for (const std::filesystem::directory_entry &entry : iterator) {
    const std::filesystem::path path = entry.path();
    if (path.filename().string() == file_name) {
      return path;
    }
    std::error_code entry_error;
    if (entry.is_directory(entry_error)) {
      if (auto found = find_executable_recursive(path, file_name);
          found.has_value()) {
        return found;
      }
    }
  }
  return std::nullopt;
}

bool macos_runtime_installed() {
  const std::filesystem::path runtime = macos_runtime_dir();
  const std::filesystem::path toolkit = runtime / "toolkit";
  std::error_code error;
  if (!std::filesystem::is_directory(toolkit, error)) {
    return false;
  }
  if (find_executable_recursive(toolkit, "Game Porting Toolkit.app")
          .has_value()) {
    return true;
  }
  return find_executable_recursive(toolkit, "wine").has_value() ||
         find_executable_recursive(toolkit, "wine64").has_value();
}

std::string unix_path_to_wine_z_path(const std::filesystem::path &path) {
  const std::string text = path.string();
  std::string out;
  out.reserve(text.size() + 3);
  out += "Z:";
  for (const char character : text) {
    out += character == '/' ? '\\' : character;
  }
  return out;
}

#if defined(_WIN32)
void kill_process_tree_matching(std::string_view) {}
void kill_process_tree(const std::filesystem::path &) {}
bool open_path(const std::filesystem::path &path) {
  const std::string text = path.string();
  const HINSTANCE result = ShellExecuteA(nullptr, "open", text.c_str(), nullptr,
                                         nullptr, SW_SHOWNORMAL);
  return reinterpret_cast<std::intptr_t>(result) > 32;
}
#else
void kill_process_tree_matching(std::string_view command_marker) {
  if (command_marker.empty()) {
    return;
  }
  std::error_code error;
  std::filesystem::directory_iterator iterator("/proc", error);
  if (error) {
    return;
  }
  for (const std::filesystem::directory_entry &entry : iterator) {
    const std::string name = entry.path().filename().string();
    char *end = nullptr;
    const long pid = std::strtol(name.c_str(), &end, 10);
    if (end == name.c_str() || *end != '\0' || pid <= 0) {
      continue;
    }
    const std::filesystem::path cmdline_path =
        std::filesystem::path("/proc") / name / "cmdline";
    std::error_code read_error;
    const std::size_t size = std::filesystem::file_size(cmdline_path, read_error);
    if (read_error) {
      continue;
    }
    std::string buffer(size, '\0');
    FILE *file = std::fopen(cmdline_path.string().c_str(), "rb");
    if (file == nullptr) {
      continue;
    }
    const std::size_t read =
        std::fread(buffer.data(), 1, buffer.size(), file);
    std::fclose(file);
    buffer.resize(read);
    if (buffer.find(command_marker) != std::string::npos) {
      ::kill(static_cast<pid_t>(pid), SIGKILL);
    }
  }
}

void kill_process_tree(const std::filesystem::path &instance_dir) {
  kill_process_tree_matching(
      unix_path_to_wine_z_path(instance_dir / "Minecraft.Client.exe"));
}

bool open_path(const std::filesystem::path &path) {
  const std::string text = path.string();
  if (fork() == 0) {
    setsid();
#if defined(__APPLE__)
    execlp("open", "open", text.c_str(), static_cast<char *>(nullptr));
#else
    execlp("xdg-open", "xdg-open", text.c_str(), static_cast<char *>(nullptr));
#endif
    _exit(127);
  }
  return true;
}
#endif
} // namespace emerald::platform
