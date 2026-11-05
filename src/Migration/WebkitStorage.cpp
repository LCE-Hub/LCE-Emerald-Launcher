#include "Core/Fs.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include "Migration/WebviewStorage.hpp"
#include <algorithm>
#include <cstdint>
#include <sqlite3.h>
#include <system_error>
namespace emerald::migration {
namespace {
void append_utf8(std::string &output, char32_t codepoint) {
  if (codepoint <= 0x7F) {
    output.push_back(static_cast<char>(codepoint));
  } else if (codepoint <= 0x7FF) {
    output.push_back(static_cast<char>(0xC0 | (codepoint >> 6)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
  } else if (codepoint <= 0xFFFF) {
    output.push_back(static_cast<char>(0xE0 | (codepoint >> 12)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
  } else {
    output.push_back(static_cast<char>(0xF0 | (codepoint >> 18)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 12) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | ((codepoint >> 6) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | (codepoint & 0x3F)));
  }
}

std::string utf16le_to_utf8(const void *data, std::size_t size) {
  const auto *bytes = static_cast<const unsigned char *>(data);
  std::string output;
  output.reserve(size / 2);
  for (std::size_t index = 0; index + 1 < size; index += 2) {
    const std::uint32_t low = bytes[index];
    const std::uint32_t high = bytes[index + 1];
    std::uint32_t unit = (high << 8) | low;
    if (unit >= 0xD800 && unit <= 0xDBFF && index + 3 < size) {
      const std::uint32_t low2 = bytes[index + 2];
      const std::uint32_t high2 = bytes[index + 3];
      const std::uint32_t next = (high2 << 8) | low2;
      if (next >= 0xDC00 && next <= 0xDFFF) {
        const std::uint32_t codepoint =
            0x10000 + ((unit - 0xD800) << 10) + (next - 0xDC00);
        append_utf8(output, static_cast<char32_t>(codepoint));
        index += 2;
        continue;
      }
    }
    append_utf8(output, static_cast<char32_t>(unit));
  }
  return output;
}

std::filesystem::path make_temp_dir() {
  static int counter = 0;
  const std::filesystem::path base = std::filesystem::temp_directory_path();
  const std::filesystem::path dir =
      base / ("emerald_migration_" + std::to_string(++counter));
  core::ensure_directory(dir);
  return dir;
}

std::vector<StorageEntry>
read_webkit_storage_file(const std::filesystem::path &source) {
  std::vector<StorageEntry> entries;
  const std::filesystem::path temp_dir = make_temp_dir();
  const std::filesystem::path db_path = temp_dir / source.filename();
  std::error_code error;
  std::filesystem::copy_file(source, db_path, error);
  if (error) {
    core::warn(std::string{"migration: cannot copy storage file "} +
               source.string());
    std::filesystem::remove_all(temp_dir, error);
    return entries;
  }

  std::filesystem::path wal_source = source;
  wal_source += "-wal";
  if (std::filesystem::exists(wal_source)) {
    std::filesystem::path wal_target = db_path;
    wal_target += "-wal";
    std::filesystem::copy_file(wal_source, wal_target, error);
  }

  sqlite3 *database = nullptr;
  const int open_result = sqlite3_open_v2(db_path.string().c_str(), &database,
                                          SQLITE_OPEN_READWRITE, nullptr);
  if (open_result != SQLITE_OK) {
    core::warn(std::string{"migration: cannot open storage database "} +
               source.string());
    if (database != nullptr) {
      sqlite3_close(database);
    }
    std::filesystem::remove_all(temp_dir, error);
    return entries;
  }

  sqlite3_stmt *statement = nullptr;
  const char *sql = "SELECT key, value FROM ItemTable";
  if (sqlite3_prepare_v2(database, sql, -1, &statement, nullptr) == SQLITE_OK) {
    while (sqlite3_step(statement) == SQLITE_ROW) {
      const unsigned char *key_text = sqlite3_column_text(statement, 0);
      StorageEntry entry;
      if (key_text != nullptr) {
        entry.key = reinterpret_cast<const char *>(key_text);
      }

      const int value_type = sqlite3_column_type(statement, 1);
      if (value_type == SQLITE_BLOB) {
        const void *blob = sqlite3_column_blob(statement, 1);
        const int blob_size = sqlite3_column_bytes(statement, 1);
        if (blob != nullptr && blob_size > 0) {
          const std::size_t size = static_cast<std::size_t>(blob_size);
          if (size % 2 == 0) {
            entry.raw = utf16le_to_utf8(blob, size);
          } else {
            entry.raw.assign(static_cast<const char *>(blob), size);
          }
        }
      } else if (value_type == SQLITE_TEXT) {
        const unsigned char *value_text = sqlite3_column_text(statement, 1);
        const int value_size = sqlite3_column_bytes(statement, 1);
        if (value_text != nullptr && value_size > 0) {
          entry.raw.assign(reinterpret_cast<const char *>(value_text),
                           static_cast<std::size_t>(value_size));
        }
      }

      if (!entry.key.empty()) {
        entries.push_back(std::move(entry));
      }
    }
  }
  sqlite3_finalize(statement);
  sqlite3_close(database);
  std::filesystem::remove_all(temp_dir, error);
  return entries;
}

std::vector<std::filesystem::path>
find_storage_files(const std::filesystem::path &root) {
  std::vector<std::filesystem::path> files;
  std::error_code error;
  if (!std::filesystem::is_directory(root, error)) {
    return files;
  }

  for (const auto &entry : std::filesystem::recursive_directory_iterator(
           root, std::filesystem::directory_options::skip_permission_denied,
           error)) {
    if (!entry.is_regular_file(error)) {
      continue;
    }
    const std::string filename = entry.path().filename().string();
    constexpr std::string_view kSuffix = ".localstorage";
    if (filename.size() >= kSuffix.size() &&
        filename.compare(filename.size() - kSuffix.size(), kSuffix.size(),
                         kSuffix) == 0) {
      files.push_back(entry.path());
    }
  }

  std::sort(files.begin(), files.end());
  std::stable_partition(
      files.begin(), files.end(), [](const std::filesystem::path &path) {
        return path.filename().string().find("tauri") == std::string::npos;
      });

  return files;
}
} // namespace

std::vector<std::filesystem::path> launcher_storage_files() {
  return find_storage_files(core::webkit_website_data_dir());
}

std::vector<StorageEntry> read_launcher_local_storage() {
  std::vector<StorageEntry> entries;
  for (const std::filesystem::path &file : launcher_storage_files()) {
    std::vector<StorageEntry> file_entries = read_webkit_storage_file(file);
    entries.insert(entries.end(), std::make_move_iterator(file_entries.begin()),
                   std::make_move_iterator(file_entries.end()));
  }
  return entries;
}
} // namespace emerald::migration
