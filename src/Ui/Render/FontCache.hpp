#pragma once
#include "Ui/Types.hpp"
#include <cstdint>
#include <filesystem>
#include <map>
#include <string>
struct SDL_Renderer;
struct SDL_Texture;
struct TTF_Font;
namespace emerald::ui {
struct FontKey {
  std::string family;
  int size = 0;
  bool operator<(const FontKey &other) const {
    if (family != other.family) {
      return family < other.family;
    }
    return size < other.size;
  }
};

class FontCache {
public:
  FontCache(SDL_Renderer *renderer, std::filesystem::path font_root);
  ~FontCache();
  FontCache(const FontCache &) = delete;
  FontCache &operator=(const FontCache &) = delete;
  TTF_Font *font(const std::string &family, int size) const;
  Size size_text(const std::string &family, int size,
                 const std::string &text) const;
  SDL_Texture *render_text(const std::string &family, int size,
                           const std::string &text, Color color) const;
  int glyph_advance(const std::string &family, int size,
                    uint32_t codepoint) const;
  SDL_Texture *render_glyph(const std::string &family, int size,
                            uint32_t codepoint, Color color) const;
  void clear();

private:
  std::filesystem::path resolve(const std::string &family) const;
  SDL_Renderer *renderer_;
  std::filesystem::path font_root_;
  mutable std::map<FontKey, TTF_Font *> fonts_;
  mutable std::map<std::string, SDL_Texture *> text_cache_;
};

} // namespace emerald::ui