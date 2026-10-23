#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO
#define STBI_NO_HDR
#include "Ui/Render/TextureCache.hpp"
#include "Core/Log.hpp"
#include "Ui/Render/SvgRaster.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cctype>
#include <cstdio>
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

  const std::filesystem::path path = resolve(source);
  const std::vector<unsigned char> bytes = read_bytes(path);
  if (bytes.empty()) {
    core::warn(std::string{"texture: not found "} + path.string());
    textures_[source] = nullptr;
    return nullptr;
  }

  if (is_svg(path)) {
    std::vector<unsigned char> rgba;
    int svg_width = 0;
    int svg_height = 0;
    const std::string svg_text(bytes.begin(), bytes.end());
    SDL_Texture *texture = nullptr;
    if (rasterize_svg(svg_text, rgba, svg_width, svg_height)) {
      SDL_Surface *surface =
          SDL_CreateSurfaceFrom(svg_width, svg_height, SDL_PIXELFORMAT_RGBA32,
                                rgba.data(), svg_width * 4);
      if (surface != nullptr) {
        texture = SDL_CreateTextureFromSurface(renderer_, surface);
        SDL_DestroySurface(surface);
      }
    } else {
      core::warn(std::string{"texture: svg decode failed "} + path.string());
    }
    if (texture != nullptr) {
      SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
      SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
    }
    textures_[source] = texture;
    return texture;
  }

  int width = 0;
  int height = 0;
  int channels = 0;
  unsigned char *pixels =
      stbi_load_from_memory(bytes.data(), static_cast<int>(bytes.size()),
                            &width, &height, &channels, 4);
  if (pixels == nullptr) {
    core::warn(std::string{"texture: decode failed "} + path.string());
    textures_[source] = nullptr;
    return nullptr;
  }

  SDL_Surface *surface = SDL_CreateSurfaceFrom(
      width, height, SDL_PIXELFORMAT_RGBA32, pixels, width * 4);
  SDL_Texture *texture = nullptr;
  if (surface != nullptr) {
    texture = SDL_CreateTextureFromSurface(renderer_, surface);
    SDL_DestroySurface(surface);
  }
  stbi_image_free(pixels);
  if (texture != nullptr) {
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  }
  textures_[source] = texture;
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