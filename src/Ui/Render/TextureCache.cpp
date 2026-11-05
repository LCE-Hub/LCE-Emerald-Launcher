#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO
#define STBI_NO_HDR
#include "Ui/Render/TextureCache.hpp"
#include "Core/Log.hpp"
#include "Skins/SkinAssets.hpp"
#include "Ui/Render/SvgRaster.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <optional>
#include <stb_image.h>
#include <vector>
namespace emerald::ui {
namespace {
bool is_svg(const std::filesystem::path &path) {
  std::string ext = path.extension().string();
  std::transform(ext.begin(), ext.end(), ext.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return ext == ".svg";
}

std::vector<unsigned char> read_bytes(const std::filesystem::path &path) {
  std::vector<unsigned char> data;
  std::FILE *file = std::fopen(path.string().c_str(), "rb");
  if (file == nullptr) {
    return data;
  }
  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  if (size > 0) {
    data.resize(static_cast<std::size_t>(size));
    std::fread(data.data(), 1, data.size(), file);
  }
  std::fclose(file);
  return data;
}

std::optional<std::vector<unsigned char>>
decode_data_bytes(const std::string &source) {
  const std::optional<std::string> payload = skins::data_url_base64(source);
  if (!payload.has_value()) {
    return std::nullopt;
  }
  const std::optional<std::vector<std::uint8_t>> decoded =
      skins::base64_decode(*payload);
  if (!decoded.has_value() || decoded->empty()) {
    return std::nullopt;
  }
  return std::vector<unsigned char>(decoded->begin(), decoded->end());
}

SDL_Texture *make_nearest_texture(SDL_Renderer *renderer,
                                  const unsigned char *pixels, int width,
                                  int height) {
  SDL_Surface *surface = SDL_CreateSurfaceFrom(
      width, height, SDL_PIXELFORMAT_RGBA32,
      const_cast<unsigned char *>(pixels),
      width * 4);
  SDL_Texture *texture = nullptr;
  if (surface != nullptr) {
    texture = SDL_CreateTextureFromSurface(renderer, surface);
    SDL_DestroySurface(surface);
  }
  if (texture != nullptr) {
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  }
  return texture;
}

} // namespace
TextureCache::TextureCache(SDL_Renderer *renderer,
                           std::filesystem::path asset_root)
    : renderer_(renderer), asset_root_(std::move(asset_root)) {}

TextureCache::~TextureCache() { clear(); }
std::filesystem::path TextureCache::resolve(const std::string &source) const {
  if (source.empty()) {
    return {};
  }
  std::filesystem::path path(source);
  if (path.is_absolute() && std::filesystem::exists(path)) {
    return path;
  }
  std::string relative = source;
  if (relative.front() == '/') {
    relative.erase(0, 1);
  }
  return asset_root_ / relative;
}

SDL_Texture *TextureCache::load(const std::string &source, bool grayscale) const {
  const std::string key = grayscale ? (source + ":grayscale") : source;
  const auto cached = textures_.find(key);
  if (cached != textures_.end()) {
    return cached->second;
  }

  std::vector<unsigned char> bytes;
  std::filesystem::path path;
  if (source.rfind("data:", 0) == 0) {
    std::optional<std::vector<unsigned char>> decoded = decode_data_bytes(source);
    if (!decoded.has_value()) {
      core::warn(std::string{"texture: data url decode failed "});
      textures_[key] = nullptr;
      return nullptr;
    }
    bytes = std::move(*decoded);
  } else {
    path = resolve(source);
    bytes = read_bytes(path);
    if (bytes.empty()) {
      core::warn(std::string{"texture: not found "} + path.string());
      textures_[key] = nullptr;
      return nullptr;
    }
  }

  if (is_svg(path)) {
    std::vector<unsigned char> rgba;
    int svg_width = 0;
    int svg_height = 0;
    const std::string svg_text(bytes.begin(), bytes.end());
    SDL_Texture *texture = nullptr;
    if (rasterize_svg(svg_text, rgba, svg_width, svg_height)) {
      texture = make_nearest_texture(renderer_, rgba.data(), svg_width,
                                     svg_height);
      if (texture != nullptr) {
        SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_LINEAR);
        SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
      }
    } else {
      core::warn(std::string{"texture: svg decode failed "} + path.string());
    }
    textures_[key] = texture;
    return texture;
  }

  int width = 0;
  int height = 0;
  int channels = 0;
  unsigned char *pixels =
      stbi_load_from_memory(bytes.data(), static_cast<int>(bytes.size()),
                            &width, &height, &channels, 4);
  SDL_Texture *texture = nullptr;
  if (pixels == nullptr) {
    core::warn(std::string{"texture: decode failed "} + path.string());
  } else {
    texture = make_nearest_texture(renderer_, pixels, width, height);
    stbi_image_free(pixels);
  }
  if (texture == nullptr) {
    textures_[key] = nullptr;
    return nullptr;
  }
  textures_[key] = texture;
  return texture;
}

void TextureCache::clear() {
  for (auto &[key, texture] : textures_) {
    (void)key;
    if (texture != nullptr) {
      SDL_DestroyTexture(texture);
    }
  }
  textures_.clear();
}
} // namespace emerald::ui