#pragma once

#include <filesystem>
#include <map>
#include <string>
struct SDL_Renderer;
struct SDL_Texture;
namespace emerald::ui {
class TextureCache {
public:
  TextureCache(SDL_Renderer *renderer, std::filesystem::path asset_root);
  ~TextureCache();
  TextureCache(const TextureCache &) = delete;
  TextureCache &operator=(const TextureCache &) = delete;
  SDL_Texture *load(const std::string &source, bool grayscale = false) const;
  void clear();

private:
  std::filesystem::path resolve(const std::string &source) const;
  SDL_Renderer *renderer_;
  std::filesystem::path asset_root_;
  mutable std::map<std::string, SDL_Texture *> textures_;
};
} // namespace emerald::ui