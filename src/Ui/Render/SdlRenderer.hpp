#pragma once
#include "Ui/Element.hpp"
#include "Ui/Render/FontCache.hpp"
#include "Ui/Render/TextureCache.hpp"
#include "Ui/RenderContext.hpp"
#include <filesystem>
#include <string>
#include <vector>
struct SDL_Renderer;
struct SDL_Rect;
namespace emerald::ui {
struct TooltipHint {
  std::string icon;
  std::string label;
};

class SdlRenderer : public RenderContext, public MeasureContext {
public:
  SdlRenderer(SDL_Renderer *renderer, std::filesystem::path public_root);
  void set_default_font(std::string family) {
    default_font_ = std::move(family);
  }
  const std::string &default_font() const { return default_font_; }
  SDL_Renderer *handle() const { return renderer_; }
  void fill_rect(const Rect &rect, Color color) override;
  void draw_image(const std::string &source, const Rect &rect,
                  float alpha = 1.0F) override;
  void draw_image_tinted(const std::string &source, const Rect &rect,
                         Color tint, float alpha = 1.0F) override;
  void draw_nine_slice(const std::string &source, const Rect &rect,
                       const BorderImage &border) override;
  Size image_size(const std::string &source) const override;
  void draw_text(const std::string &text, const Rect &rect,
                 const ComputedStyle &style) override;
  Size text_size(const std::string &text,
                 const ComputedStyle &style) const override;
  void push_clip(const Rect &rect) override;
  void pop_clip() override;
  void begin_frame();
  void end_frame();
  TextureCache &textures() { return textures_; }
  FontCache &fonts() { return fonts_; }
  void set_input_device(bool gamepad) { gamepad_input_ = gamepad; }
  void set_tooltips(std::vector<TooltipHint> tooltips) {
    tooltips_ = std::move(tooltips);
  }
  void set_tooltip_set(std::string set) { tooltip_set_ = std::move(set); }

private:
  std::string family_for(const ComputedStyle &style) const;
  void set_texture_alpha(SDL_Texture *texture, float alpha);
  void overlays();
  SDL_Renderer *renderer_;
  TextureCache textures_;
  FontCache fonts_;
  std::string default_font_ = "/fonts/Mojangles.ttf";
  std::vector<SDL_Rect> clip_stack_;
  bool gamepad_input_ = true;
  std::vector<TooltipHint> tooltips_;
  std::string tooltip_set_ = "Durango";
};

} // namespace emerald::ui