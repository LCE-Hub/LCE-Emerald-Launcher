#include "Core/EmbeddedAssets.hpp"
#include "Core/Fs.hpp"
#include <array>
#include <cstdint>
#include <vector>
namespace emerald::core::embedded {
namespace {
constexpr std::array<std::int8_t, 256> decode_table() {
  std::array<std::int8_t, 256> table{};
  for (std::int8_t &value : table) {
    value = -1;
  }
  constexpr char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (std::int8_t i = 0; i < 64; ++i) {
    table[static_cast<unsigned char>(kAlphabet[i])] = i;
  }
  return table;
}
constexpr std::array<std::int8_t, 256> kDecode = decode_table();
std::vector<unsigned char> decode(std::string_view text,
                                  std::size_t size_hint) {
  std::vector<unsigned char> bytes;
  bytes.reserve(size_hint);
  int buffer = 0;
  int bits = 0;
  for (const char ch : text) {
    const int value = kDecode[static_cast<unsigned char>(ch)];
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push_back(static_cast<unsigned char>((buffer >> bits) & 0xFF));
    }
  }
  return bytes;
}
} // namespace

std::string_view build_id() { return detail::kBuildId; }
bool is_extracted(const std::filesystem::path &root) {
  const std::optional<std::string> marker = read_file(root / ".complete");
  return marker.has_value() && *marker == std::string(build_id());
}

bool extract_to(const std::filesystem::path &root) {
  for (unsigned long long i = 0; i < detail::kFileCount; ++i) {
    const RawFile &file = detail::kFiles[i];
    const std::vector<unsigned char> bytes =
        decode(file.data, static_cast<std::size_t>(file.size));
    const std::string_view contents(
        reinterpret_cast<const char *>(bytes.data()), bytes.size());
    if (!write_file(root / file.path, contents)) {
      return false;
    }
  }
  return write_file(root / ".complete", build_id());
}
} // namespace emerald::core::embedded
