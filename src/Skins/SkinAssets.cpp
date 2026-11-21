#include "Skins/SkinAssets.hpp"
#include <stb_image.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBIW_NO_STDIO
#include <stb_image.h>
#include <stb_image_write.h>
#include "Core/Log.hpp"
#include <algorithm>
#include <array>
#include <cctype>
#include <cstdlib>
namespace emerald::skins {
std::string seeded_id(const std::string &name) {
  int hash = 0;
  for (const char character : name) {
    hash = (hash << 5) - hash + static_cast<int>(character);
    hash |= 0;
  }
  long long magnitude = hash < 0 ? -static_cast<long long>(hash)
                                 : static_cast<long long>(hash);
  std::string digits = std::to_string(magnitude);
  while (digits.size() < 8) {
    digits = "0" + digits;
  }
  return digits.substr(digits.size() - 8);
}

std::optional<std::string> base64_encode(const std::uint8_t *data,
                                         std::size_t size) {
  if (data == nullptr && size != 0) {
    return std::nullopt;
  }
  static constexpr std::array<char, 65> alphabet = {
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '/', '='};
  std::string output;
  output.reserve(((size + 2) / 3) * 4);
  for (std::size_t index = 0; index < size; index += 3) {
    const std::uint32_t first = data[index];
    const std::uint32_t second =
        index + 1 < size ? data[index + 1] : 0;
    const std::uint32_t third =
        index + 2 < size ? data[index + 2] : 0;
    const std::uint32_t triple = (first << 16) | (second << 8) | third;
    output.push_back(alphabet[(triple >> 18) & 0x3F]);
    output.push_back(alphabet[(triple >> 12) & 0x3F]);
    output.push_back(index + 1 < size ? alphabet[(triple >> 6) & 0x3F] : '=');
    output.push_back(index + 2 < size ? alphabet[triple & 0x3F] : '=');
  }
  return output;
}

std::optional<std::vector<std::uint8_t>> base64_decode(const std::string &text) {
  static auto value_of = [](char character) -> int {
    if (character >= 'A' && character <= 'Z') {
      return character - 'A';
    }
    if (character >= 'a' && character <= 'z') {
      return character - 'a' + 26;
    }
    if (character >= '0' && character <= '9') {
      return character - '0' + 52;
    }
    if (character == '+') {
      return 62;
    }
    if (character == '/') {
      return 63;
    }
    return -1;
  };
  std::vector<std::uint8_t> output;
  output.reserve(text.size() / 4 * 3);
  std::uint32_t accumulator = 0;
  int bits = 0;
  for (const char character : text) {
    if (character == '=' || character == '\n' || character == '\r' ||
        character == ' ' || character == '\t') {
      continue;
    }
    const int value = value_of(character);
    if (value < 0) {
      return std::nullopt;
    }
    accumulator = (accumulator << 6) | static_cast<std::uint32_t>(value);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push_back(
          static_cast<std::uint8_t>((accumulator >> bits) & 0xFFU));
    }
  }
  return output;
}

bool is_data_url(const std::string &source) {
  return source.rfind("data:", 0) == 0;
}

std::optional<std::string> data_url_base64(const std::string &source) {
  static constexpr std::string_view marker = ";base64,";
  if (!is_data_url(source)) {
    return std::nullopt;
  }
  const std::size_t separator = source.find(marker);
  if (separator == std::string::npos) {
    return std::nullopt;
  }
  return source.substr(separator + marker.size());
}

std::optional<RgbaImage>
decode_png_bytes(const std::vector<std::uint8_t> &bytes) {
  if (bytes.empty()) {
    return std::nullopt;
  }
  int width = 0;
  int height = 0;
  int channels = 0;
  std::uint8_t *pixels = stbi_load_from_memory(
      bytes.data(), static_cast<int>(bytes.size()), &width, &height,
      &channels, 4);
  if (pixels == nullptr) {
    return std::nullopt;
  }
  RgbaImage image;
  image.width = width;
  image.height = height;
  image.pixels.assign(
      pixels, pixels + static_cast<std::size_t>(width) *
                            static_cast<std::size_t>(height) * 4);
  stbi_image_free(pixels);
  return image;
}

std::optional<RgbaImage>
load_skin_source(const std::string &source,
                 const std::filesystem::path &public_root) {
  if (source.empty()) {
    return std::nullopt;
  }
  if (is_data_url(source)) {
    const std::optional<std::string> encoded = data_url_base64(source);
    if (!encoded.has_value()) {
      return std::nullopt;
    }
    const std::optional<std::vector<std::uint8_t>> bytes =
        base64_decode(*encoded);
    if (!bytes.has_value()) {
      return std::nullopt;
    }
    return decode_png_bytes(*bytes);
  }
  if (source.rfind("blob:", 0) == 0) {
    return std::nullopt;
  }
  std::filesystem::path path;
  if (source.front() == '/') {
    path = public_root / source.substr(1);
  } else {
    path = source;
  }
  std::FILE *file = std::fopen(path.string().c_str(), "rb");
  if (file == nullptr) {
    core::warn(std::string{"skins: failed to open image "} + path.string());
    return std::nullopt;
  }
  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  std::vector<std::uint8_t> bytes;
  if (size > 0) {
    bytes.resize(static_cast<std::size_t>(size));
    if (std::fread(bytes.data(), 1, bytes.size(), file) != bytes.size()) {
      bytes.clear();
    }
  }
  std::fclose(file);
  if (bytes.empty()) {
    return std::nullopt;
  }
  return decode_png_bytes(bytes);
}

std::optional<std::vector<std::uint8_t>> encode_png(const RgbaView &image) {
  if (image.pixels == nullptr || image.width <= 0 || image.height <= 0) {
    return std::nullopt;
  }
  const int stride = image.width * 4;
  int output_size = 0;
  std::uint8_t *encoded = stbi_write_png_to_mem(
      image.pixels, stride, image.width, image.height, 4, &output_size);
  if (encoded == nullptr || output_size <= 0) {
    if (encoded != nullptr) {
      std::free(encoded);
    }
    return std::nullopt;
  }
  std::vector<std::uint8_t> output(
      encoded, encoded + static_cast<std::size_t>(output_size));
  std::free(encoded);
  return output;
}

std::optional<std::vector<std::uint8_t>> reencode_png(const RgbaImage &image) {
  RgbaView view{image.width, image.height, image.pixels.data()};
  return encode_png(view);
}
} // namespace emerald::skins
