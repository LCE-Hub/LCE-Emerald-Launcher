#include "Ui/Render/FontCache.hpp"
#include "Core/Log.hpp"
#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>
namespace emerald::ui {
FontCache::FontCache(SDL_Renderer *renderer, std::filesystem::path font_root)
    : renderer_(renderer), font_root_(std::move(font_root)) {
  if (!TTF_Init()) {
    core::error(std::string{"TTF_Init failed: "} + SDL_GetError());
  }
}

FontCache::~FontCache() {
  clear();
  TTF_Quit();
}

std::filesystem::path FontCache::resolve(const std::string &family) const {
  std::filesystem::path path(family);
  if (path.is_absolute() && std::filesystem::exists(path)) {
    return path;
  }
  std::string relative = family;
  if (relative.empty()) {
    relative = "Mojangles.ttf";
  }
  if (relative.front() == '/') {
    relative.erase(0, 1);
  }
  return font_root_ / relative;
}

TTF_Font *FontCache::font(const std::string &family, int size) const {
  const FontKey key{family, size};
  const auto cached = fonts_.find(key);
  if (cached != fonts_.end()) {
    return cached->second;
  }

  const std::filesystem::path path = resolve(family);
  TTF_Font *loaded =
      TTF_OpenFont(path.string().c_str(), static_cast<float>(size));
  if (loaded == nullptr) {
    core::warn(std::string{"font: failed to open "} + path.string() + ": " +
               SDL_GetError());
    fonts_[key] = nullptr;
    return nullptr;
  }
  fonts_[key] = loaded;
  return loaded;
}

Size FontCache::size_text(const std::string &family, int size,
                          const std::string &text) const {
  TTF_Font *loaded = font(family, size);
  if (loaded == nullptr || text.empty()) {
    return Size{0.0F, static_cast<float>(size)};
  }
  int width = 0;
  int height = 0;
  if (!TTF_GetStringSize(loaded, text.c_str(), 0, &width, &height)) {
    return Size{0.0F, static_cast<float>(size)};
  }
  return Size{static_cast<float>(width), static_cast<float>(height)};
}

SDL_Texture *FontCache::render_text(const std::string &family, int size,
                                    const std::string &text,
                                    Color color) const {
  const std::string key =
      family + '\x1f' + std::to_string(size) + '\x1f' +
      std::to_string(color.r) + ',' + std::to_string(color.g) + ',' +
      std::to_string(color.b) + ',' + std::to_string(color.a) + '\x1f' + text;
  const auto cached = text_cache_.find(key);
  if (cached != text_cache_.end()) {
    return cached->second;
  }

  TTF_Font *loaded = font(family, size);
  if (loaded == nullptr || text.empty()) {
    text_cache_[key] = nullptr;
    return nullptr;
  }
  const SDL_Color sdl_color{color.r, color.g, color.b, color.a};
  SDL_Surface *surface =
      TTF_RenderText_Blended(loaded, text.c_str(), 0, sdl_color);
  if (surface == nullptr) {
    text_cache_[key] = nullptr;
    return nullptr;
  }
  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer_, surface);
  SDL_DestroySurface(surface);
  if (texture != nullptr) {
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  }
  text_cache_[key] = texture;
  return texture;
}

int FontCache::glyph_advance(const std::string &family, int size,
                             uint32_t codepoint) const {
  TTF_Font *loaded = font(family, size);
  if (loaded == nullptr) {
    return 0;
  }
  int minx = 0;
  int maxx = 0;
  int miny = 0;
  int maxy = 0;
  int advance = 0;
  if (!TTF_GetGlyphMetrics(loaded, codepoint, &minx, &maxx, &miny, &maxy,
                           &advance)) {
    return 0;
  }
  return advance;
}

SDL_Texture *FontCache::render_glyph(const std::string &family, int size,
                                     uint32_t codepoint, Color color) const {
  const std::string key =
      std::string{"\x01glyph"} + family + '\x1f' + std::to_string(size) + '\x1f' +
      std::to_string(codepoint) + '\x1f' + std::to_string(color.r) + ',' +
      std::to_string(color.g) + ',' + std::to_string(color.b) + ',' +
      std::to_string(color.a);
  const auto cached = text_cache_.find(key);
  if (cached != text_cache_.end()) {
    return cached->second;
  }
  TTF_Font *loaded = font(family, size);
  if (loaded == nullptr) {
    text_cache_[key] = nullptr;
    return nullptr;
  }
  const SDL_Color sdl_color{color.r, color.g, color.b, color.a};
  SDL_Surface *surface =
      TTF_RenderGlyph_Blended(loaded, codepoint, sdl_color);
  if (surface == nullptr || surface->w <= 0 || surface->h <= 0) {
    if (surface != nullptr) {
      SDL_DestroySurface(surface);
    }
    text_cache_[key] = nullptr;
    return nullptr;
  }
  SDL_Texture *texture = SDL_CreateTextureFromSurface(renderer_, surface);
  SDL_DestroySurface(surface);
  if (texture != nullptr) {
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  }
  text_cache_[key] = texture;
  return texture;
}

void FontCache::clear() {
  for (auto &[key, texture] : text_cache_) {
    (void)key;
    if (texture != nullptr) {
      SDL_DestroyTexture(texture);
    }
  }
  text_cache_.clear();
  for (auto &[key, loaded] : fonts_) {
    (void)key;
    if (loaded != nullptr) {
      TTF_CloseFont(loaded);
    }
  }
  fonts_.clear();
}
} // namespace emerald::ui