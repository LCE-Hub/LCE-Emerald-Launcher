#include "Integrations/SteamShortcuts.hpp"
#include "Core/Fs.hpp"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string_view>
#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#elif defined(__linux__)
#include <unistd.h>
#endif
namespace emerald::integrations {
namespace {
constexpr std::uint8_t kNull = 0; //neo: i never thought i'd need to do that ever in my life but here we are, uwu
constexpr std::uint8_t kSoh = 1;
constexpr std::uint8_t kStx = 2;
constexpr std::uint8_t kBackspace = 8;
std::uint32_t crc32(std::string_view text) {
  static std::uint32_t table[256] = {};
  static bool ready = false;
  if (!ready) {
    for (std::uint32_t i = 0; i < 256; ++i) {
      std::uint32_t value = i;
      for (int bit = 0; bit < 8; ++bit) {
        value = (value & 1) != 0 ? 0xedb88320u ^ (value >> 1) : value >> 1;
      }
      table[i] = value;
    }
    ready = true;
  }
  std::uint32_t value = 0xffffffffu;
  for (const unsigned char character : text) {
    value = table[(value ^ character) & 0xffu] ^ (value >> 8);
  }
  return value ^ 0xffffffffu;
}

std::uint32_t steam_app_id(std::string_view exe, std::string_view name) {
  std::string combined(exe);
  combined.append(name);
  return crc32(combined) | 0x80000000u;
}

void append_text(std::string &out, std::string_view key,
                 std::string_view value) {
  out.push_back(static_cast<char>(kSoh));
  out.append(key);
  out.push_back(static_cast<char>(kNull));
  out.append(value);
  out.push_back(static_cast<char>(kNull));
}

void append_u32(std::string &out, std::string_view key, std::uint32_t value) {
  out.push_back(static_cast<char>(kStx));
  out.append(key);
  out.push_back(static_cast<char>(kNull));
  for (int shift = 0; shift < 32; shift += 8) {
    out.push_back(static_cast<char>((value >> shift) & 0xffu));
  }
}

void append_bool(std::string &out, std::string_view key, bool value) {
  out.push_back(static_cast<char>(kStx));
  out.append(key);
  out.push_back(static_cast<char>(kNull));
  out.push_back(static_cast<char>(kSoh));
  out.push_back(static_cast<char>(kNull));
  out.push_back(static_cast<char>(kNull));
  out.push_back(static_cast<char>(value ? 1 : 0));
}

std::string shortcut_record(std::size_t order, std::uint32_t app_id,
                            const std::string &name, const std::string &exe,
                            const std::string &start_dir,
                            const std::string &launch_options) {
  std::string record;
  record.push_back(static_cast<char>(kNull));
  record += std::to_string(order);
  record.push_back(static_cast<char>(kNull));
  append_u32(record, "appid", app_id);
  append_text(record, "AppName", name);
  append_text(record, "Exe", exe);
  append_text(record, "StartDir", start_dir);
  append_text(record, "icon", "");
  append_text(record, "ShortcutPath", "");
  append_text(record, "LaunchOptions", launch_options);
  append_u32(record, "IsHidden", 0);
  append_bool(record, "AllowDesktopConfig", true);
  append_bool(record, "AllowOverlay", true);
  append_u32(record, "openvr", 0);
  append_u32(record, "Devkit", 0);
  append_text(record, "DevkitGameID", "");
  append_u32(record, "DevkitOverrideAppID", 0);
  append_u32(record, "LastPlayTime", 0);
  record.push_back(static_cast<char>(kNull));
  record += "tags";
  record.push_back(static_cast<char>(kNull));
  record.push_back(static_cast<char>(kBackspace));
  record.push_back(static_cast<char>(kBackspace));
  return record;
}

std::size_t find_bytes(const std::vector<std::uint8_t> &data,
                       std::string_view needle, std::size_t from) {
  if (from > data.size() || needle.empty() ||
      needle.size() > data.size() - from) {
    return std::string_view::npos;
  }
  const auto found = std::search(data.begin() + static_cast<std::ptrdiff_t>(from),
                                 data.end(), needle.begin(), needle.end());
  if (found == data.end()) {
    return std::string_view::npos;
  }
  return static_cast<std::size_t>(found - data.begin());
}

bool read_shortcut_records(const std::vector<std::uint8_t> &data,
                           std::vector<std::string> &records) {
  if (data.size() < 11 || data[0] != kNull ||
      std::memcmp(data.data() + 1, "shortcuts", 9) != 0 || data[10] != kNull) {
    return false;
  }
  std::size_t position = 11;
  while (position + 1 < data.size()) {
    if (data[position] == kBackspace && data[position + 1] == kBackspace) {
      return true;
    }
    if (data[position] != kNull) {
      return false;
    }
    const std::size_t tag =
        find_bytes(data, std::string_view("\0tags\0", 6), position);
    if (tag == std::string_view::npos) {
      return false;
    }
    const std::size_t tags_end = tag + 6;
    std::size_t end = tags_end;
    while (end + 1 < data.size() &&
           !(data[end] == kBackspace && data[end + 1] == kBackspace)) {
      ++end;
    }
    if (end + 1 >= data.size()) {
      return false;
    }
    end += 2;
    records.emplace_back(reinterpret_cast<const char *>(data.data() + position),
                         end - position);
    position = end;
  }
  return position < data.size() && data[position] == kBackspace;
}

std::string lower_copy(std::string_view value) {
  std::string result(value);
  std::transform(result.begin(), result.end(), result.begin(),
                 [](unsigned char character) {
                   return static_cast<char>(std::tolower(character));
                 });
  return result;
}

bool record_matches(const std::string &record, const std::string &name,
                    const std::string &exe) {
  std::size_t position = 0;
  if (position < record.size() &&
      static_cast<std::uint8_t>(record[position]) == kNull) {
    ++position;
    while (position < record.size() && record[position] != '\0') {
      ++position;
    }
    if (position < record.size()) {
      ++position;
    }
  }
  std::string found_name;
  std::string found_exe;
  while (position < record.size()) {
    const auto type = static_cast<std::uint8_t>(record[position]);
    if (type != kSoh && type != kStx) {
      break;
    }
    ++position;
    const std::size_t key_start = position;
    while (position < record.size() && record[position] != '\0') {
      ++position;
    }
    const std::string key =
        lower_copy(std::string_view(record).substr(key_start,
                                                    position - key_start));
    if (position < record.size()) {
      ++position;
    }
    if (type == kStx) {
      position += 4;
      continue;
    }
    const std::size_t value_start = position;
    while (position < record.size() && record[position] != '\0') {
      ++position;
    }
    const std::string value = std::string(
        std::string_view(record).substr(value_start, position - value_start));
    if (position < record.size()) {
      ++position;
    }
    if (key == "appname") {
      found_name = value;
    } else if (key == "exe") {
      found_exe = value;
    }
  }
  return found_name == name && found_exe == exe;
}

std::vector<std::filesystem::path> userdata_roots() {
  std::vector<std::filesystem::path> roots;
  const char *home_value = std::getenv("HOME");
  const std::string home = home_value != nullptr ? home_value : "";
#if defined(_WIN32)
  const char *program_files = std::getenv("ProgramFiles");
  const char *program_files_x86 = std::getenv("ProgramFiles(x86)");
  if (program_files != nullptr) {
    roots.emplace_back(std::string(program_files) + "\\Steam\\userdata");
  }
  if (program_files_x86 != nullptr) {
    roots.emplace_back(std::string(program_files_x86) + "\\Steam\\userdata");
  }
  roots.emplace_back("C:\\Program Files\\Steam\\userdata");
  roots.emplace_back("C:\\Program Files (x86)\\Steam\\userdata");
#elif defined(__APPLE__)
  if (!home.empty()) {
    roots.emplace_back(std::filesystem::path(home) / "Library" /
                       "Application Support" / "Steam" / "userdata"); //neo: i got this path from a google search.. nya lol
  }
#else
  if (!home.empty()) {
    const std::filesystem::path home_path(home);
    roots.push_back(home_path / ".steam" / "steam" / "userdata");
    roots.push_back(home_path / ".local" / "share" / "Steam" / "userdata");
    roots.push_back(home_path / ".var" / "app" / "com.valvesoftware.Steam" /
                    ".local" / "share" / "Steam" / "userdata");
  }
#endif
  return roots;
}

bool executable_path(std::string &exe, std::string &start_dir) {
#if defined(_WIN32)
  char buffer[4096] = {};
  const DWORD length = GetModuleFileNameA(nullptr, buffer, sizeof(buffer));
  if (length == 0 || length >= sizeof(buffer)) {
    return false;
  }
  exe.assign(buffer, length);
#elif defined(__APPLE__)
  char buffer[4096] = {};
  std::uint32_t length = sizeof(buffer);
  if (_NSGetExecutablePath(buffer, &length) != 0) {
    return false;
  }
  exe = buffer;
#elif defined(__linux__)
  char buffer[4096] = {};
  const ssize_t length = readlink("/proc/self/exe", buffer, sizeof(buffer));
  if (length <= 0 || static_cast<std::size_t>(length) >= sizeof(buffer)) {
    return false;
  }
  exe.assign(buffer, static_cast<std::size_t>(length));
#else
  return false;
#endif
  start_dir = std::filesystem::path(exe).parent_path().string();
  return true;
}

bool write_bytes(const std::filesystem::path &path,
                 const std::vector<std::uint8_t> &bytes) {
  std::ofstream output(path, std::ios::binary | std::ios::trunc);
  if (!output.is_open()) {
    return false;
  }
  if (!bytes.empty()) {
    output.write(reinterpret_cast<const char *>(bytes.data()),
                 static_cast<std::streamsize>(bytes.size()));
  }
  return output.good();
}

void write_artwork(const std::filesystem::path &grid_dir,
                   std::uint32_t app_id, const SteamArtwork &artwork) {
  if (!core::ensure_directory(grid_dir)) {
    return;
  }
  const std::string id = std::to_string(app_id);
  if (!artwork.panorama.empty()) {
    write_bytes(grid_dir / (id + "p.png"), artwork.panorama);
    write_bytes(grid_dir / (id + "_hero.png"), artwork.panorama);
    write_bytes(grid_dir / (id + ".png"), artwork.panorama);
  }
  if (!artwork.title.empty()) {
    write_bytes(grid_dir / (id + "_logo.png"), artwork.title);
  }
  core::write_file(grid_dir / (id + ".json"),
                   "{\"nVersion\":1,\"logoPosition\":{\"pinnedPosition\":"
                   "\"CenterCenter\",\"nWidthPct\":50,"
                   "\"nHeightPct\":50}}");
}
} // namespace

bool add_instance_shortcut(const std::string &instance_id,
                           const std::string &name,
                           const SteamArtwork &artwork, std::string &error) {
  std::string exe;
  std::string start_dir;
  std::string launch_options;
  if (std::filesystem::exists("/.flatpak-info")) {
    exe = "/usr/bin/flatpak";
    start_dir = std::getenv("HOME") != nullptr ? std::getenv("HOME") : "";
    launch_options =
        "run io.github.Emerald_Legacy_Launcher.Emerald_Legacy_Launcher "
        "\"emerald://launch/" +
        instance_id + "\"";
  } else {
    if (!executable_path(exe, start_dir)) {
      error = "Failed to locate launcher executable";
      return false;
    }
    launch_options = "\"emerald://launch/" + instance_id + "\"";
  }

  const std::uint32_t app_id = steam_app_id(exe, name);
  bool wrote_shortcut = false;
  for (const std::filesystem::path &root : userdata_roots()) {
    std::error_code error_code;
    if (!std::filesystem::is_directory(root, error_code)) {
      continue;
    }
    std::filesystem::directory_iterator iterator(root, error_code);
    if (error_code) {
      continue;
    }
    for (const std::filesystem::directory_entry &entry : iterator) {
      if (!entry.is_directory(error_code)) {
        continue;
      }
      const std::filesystem::path config_dir = entry.path() / "config";
      if (!std::filesystem::is_directory(config_dir, error_code)) {
        continue;
      }
      const std::filesystem::path shortcuts_path =
          config_dir / "shortcuts.vdf";
      std::vector<std::uint8_t> contents;
      if (std::filesystem::exists(shortcuts_path, error_code)) {
        std::ifstream input(shortcuts_path, std::ios::binary);
        if (!input.is_open()) {
          error = "Failed to read " + shortcuts_path.string();
          return false;
        }
        contents.assign(std::istreambuf_iterator<char>(input),
                        std::istreambuf_iterator<char>());
      }
      std::vector<std::string> records;
      if (!contents.empty() && !read_shortcut_records(contents, records)) {
        error = "Failed to parse " + shortcuts_path.string();
        return false;
      }
      bool duplicate = false;
      for (const std::string &record : records) {
        if (record_matches(record, name, exe)) {
          duplicate = true;
          break;
        }
      }
      if (duplicate) {
        wrote_shortcut = true;
        continue;
      }
      const std::string new_record = shortcut_record(
          records.size(), app_id, name, exe, start_dir, launch_options);
      std::string file("\0shortcuts\0", 11);
      for (const std::string &record : records) {
        file += record;
      }
      file += new_record;
      file.push_back(static_cast<char>(kBackspace));
      file.push_back(static_cast<char>(kBackspace));
      if (!core::write_file(shortcuts_path, file)) {
        error = "Failed to write " + shortcuts_path.string();
        return false;
      }
      write_artwork(config_dir / "grid", app_id, artwork);
      wrote_shortcut = true;
    }
  }
  if (!wrote_shortcut) {
    error = "Steam userdata directory not found.";
    return false;
  }
  return true;
}
} // namespace emerald::integrations
