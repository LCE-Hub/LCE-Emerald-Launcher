#pragma once
#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>
namespace emerald::skins {
struct PixelColor {
  std::uint8_t r = 0;
  std::uint8_t g = 0;
  std::uint8_t b = 0;
  std::uint8_t a = 255;
};

struct RgbaImage {
  int width = 0;
  int height = 0;
  std::vector<std::uint8_t> pixels;
};

struct RgbaView {
  int width = 0;
  int height = 0;
  const std::uint8_t *pixels = nullptr;
};

std::string seeded_id(const std::string &name);
std::optional<std::string> base64_encode(const std::uint8_t *data,
                                         std::size_t size);
std::optional<std::vector<std::uint8_t>> base64_decode(const std::string &text);
std::optional<std::string> data_url_base64(const std::string &source);
bool is_data_url(const std::string &source);
std::optional<RgbaImage> decode_png_bytes(const std::vector<std::uint8_t> &bytes);
std::optional<RgbaImage>
load_skin_source(const std::string &source,
                 const std::filesystem::path &public_root);
std::optional<std::vector<std::uint8_t>>
encode_png(const RgbaView &image);
std::optional<std::vector<std::uint8_t>>
reencode_png(const RgbaImage &image);
} // namespace emerald::skins
