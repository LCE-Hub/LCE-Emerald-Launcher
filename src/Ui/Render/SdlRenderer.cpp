#include "Ui/Render/SdlRenderer.hpp"
#include "Config/ConfigSchema.hpp"
#include "Config/ConfigStore.hpp"
#include "Ui/Style.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cmath>
#include <vector>
namespace emerald::ui {
namespace {
std::vector<uint32_t> decode_utf8(const std::string &text) {
  std::vector<uint32_t> codes;
  codes.reserve(text.size());
  std::size_t i = 0;
  while (i < text.size()) {
    const auto byte = static_cast<unsigned char>(text[i]);
    uint32_t cp = byte;
    std::size_t extra = 0;
    if (byte < 0x80U) {
      extra = 0;
    } else if ((byte & 0xE0U) == 0xC0U) {
      cp = byte & 0x1FU;
      extra = 1;
    } else if ((byte & 0xF0U) == 0xE0U) {
      cp = byte & 0x0FU;
      extra = 2;
    } else if ((byte & 0xF8U) == 0xF0U) {
      cp = byte & 0x07U;
      extra = 3;
    } else {
      ++i;
      continue;
    }
    if (i + extra >= text.size()) {
      break;
    }
    bool ok = true;
    for (std::size_t k = 1; k <= extra; ++k) {
      const auto next = static_cast<unsigned char>(text[i + k]);
      if ((next & 0xC0U) != 0x80U) {
        ok = false;
        break;
      }
      cp = (cp << 6U) | (next & 0x3FU);
    }
    if (!ok) {
      ++i;
      continue;
    }
    codes.push_back(cp);
    i += extra + 1;
  }
  return codes;
}

std::vector<int> advances_for(const FontCache &fonts, const std::string &family,
                              int size, const std::vector<uint32_t> &codes) {
  std::vector<int> advances;
  advances.reserve(codes.size());
  for (const uint32_t code : codes) {
    advances.push_back(fonts.glyph_advance(family, size, code));
  }
  return advances;
}
} // namespace
SdlRenderer::SdlRenderer(SDL_Renderer *renderer,
                         std::filesystem::path public_root)
    : renderer_(renderer), textures_(renderer, public_root),
      fonts_(renderer, std::move(public_root)) {}

std::string SdlRenderer::family_for(const ComputedStyle &style) const {
  return style.fontFamily.empty() ? default_font_ : style.fontFamily;
}

void SdlRenderer::set_texture_alpha(SDL_Texture *texture, float alpha) {
  const auto a = static_cast<uint8_t>(std::clamp(alpha, 0.0F, 1.0F) * 255.0F);
  SDL_SetTextureAlphaMod(texture, a);
}

void SdlRenderer::fill_rect(const Rect &rect, Color color) {
  SDL_SetRenderDrawColor(renderer_, color.r, color.g, color.b, color.a);
  SDL_FRect target{rect.x, rect.y, rect.width, rect.height};
  SDL_RenderFillRect(renderer_, &target);
}

void SdlRenderer::draw_image(const std::string &source, const Rect &rect,
                             float alpha) {
  SDL_Texture *texture = textures_.load(source);
  SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
  if (texture == nullptr) {
    return;
  }
  set_texture_alpha(texture, alpha);
  SDL_FRect target{rect.x, rect.y, rect.width, rect.height};
  SDL_RenderTexture(renderer_, texture, nullptr, &target);
  SDL_SetTextureAlphaMod(texture, 255);
}

void SdlRenderer::draw_image_tinted(const std::string &source, const Rect &rect,
                                    Color tint, float alpha) {
  SDL_Texture *texture = textures_.load(source);
  if (texture == nullptr) {
    return;
  }
  SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
  const auto combined_alpha = static_cast<uint8_t>(
      std::clamp(alpha, 0.0F, 1.0F) * static_cast<float>(tint.a));
  SDL_SetTextureColorMod(texture, tint.r, tint.g, tint.b);
  SDL_SetTextureAlphaMod(texture, combined_alpha);
  SDL_FRect target{rect.x, rect.y, rect.width, rect.height};
  SDL_RenderTexture(renderer_, texture, nullptr, &target);
  SDL_SetTextureColorMod(texture, 255, 255, 255);
  SDL_SetTextureAlphaMod(texture, 255);
}

void SdlRenderer::draw_nine_slice(const std::string &source, const Rect &rect,
                                  const BorderImage &b, float alpha) {
  SDL_Texture *texture = textures_.load(source);
  if (texture == nullptr) {
    return;
  }
  float tw = 0.0F;
  float th = 0.0F;
  SDL_GetTextureSize(texture, &tw, &th);
  if (tw <= 0.0F || th <= 0.0F) {
    return;
  }

  const float sl = b.sliceLeft;
  const float sr = b.sliceRight;
  const float st = b.sliceTop;
  const float sb = b.sliceBottom;
  const float wl = b.widthLeft;
  const float wr = b.widthRight;
  const float wt = b.widthTop;
  const float wb = b.widthBottom;
  const float dx = rect.x;
  const float dy = rect.y;
  const float dw = rect.width;
  const float dh = rect.height;
  const float cx = dx + wl;
  const float cy = dy + wt;
  const float cw = dw - wl - wr;
  const float ch = dh - wt - wb;
  const float scx = sl;
  const float scy = st;
  const float scw = tw - sl - sr;
  const float sch = th - st - sb;
  SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
  const uint8_t slice_alpha =
      static_cast<uint8_t>(std::clamp(alpha, 0.0F, 1.0F) * 255.0F);
  SDL_SetTextureAlphaMod(texture, slice_alpha);
  auto draw = [&](SDL_FRect src, SDL_FRect dst) {
    if (dst.w <= 0.0F || dst.h <= 0.0F || src.w <= 0.0F || src.h <= 0.0F) {
      return;
    }
    SDL_RenderTexture(renderer_, texture, &src, &dst);
  };

  draw({0, 0, sl, st}, {dx, dy, wl, wt});
  draw({tw - sr, 0, sr, st}, {dx + dw - wr, dy, wr, wt});
  draw({0, th - sb, sl, sb}, {dx, dy + dh - wb, wl, wb});
  draw({tw - sr, th - sb, sr, sb}, {dx + dw - wr, dy + dh - wb, wr, wb});
  draw({scx, 0, scw, st}, {cx, dy, cw, wt});
  draw({scx, th - sb, scw, sb}, {cx, dy + dh - wb, cw, wb});
  draw({0, scy, sl, sch}, {dx, cy, wl, ch});
  draw({tw - sr, scy, sr, sch}, {dx + dw - wr, cy, wr, ch});
  if (b.fill) {
    draw({scx, scy, scw, sch}, {cx, cy, cw, ch});
  }
}

Size SdlRenderer::image_size(const std::string &source) const {
  SDL_Texture *texture = textures_.load(source);
  if (texture == nullptr) {
    return Size{};
  }
  float width = 0.0F;
  float height = 0.0F;
  SDL_GetTextureSize(texture, &width, &height);
  return Size{width, height};
}

void SdlRenderer::draw_text(const std::string &text, const Rect &rect,
                            const ComputedStyle &style) {
  if (text.empty()) {
    return;
  }
  const std::string family = family_for(style);
  const float spacing = style.letterSpacing.value_or(0.0F);
  const bool glyph_path = spacing != 0.0F || style.bold;
  const std::vector<uint32_t> codes =
      glyph_path ? decode_utf8(text) : std::vector<uint32_t>{};
  const std::vector<int> advances =
      glyph_path ? advances_for(fonts_, family, style.fontSize, codes)
                 : std::vector<int>{};

  auto paint = [&](Color color, float offset_x, float offset_y) {
    if (!glyph_path) {
      SDL_Texture *texture =
          fonts_.render_text(family, style.fontSize, text, color);
      if (texture == nullptr) {
        return;
      }
      float width = 0.0F;
      float height = 0.0F;
      SDL_GetTextureSize(texture, &width, &height);
      SDL_SetTextureAlphaMod(texture,
                             static_cast<uint8_t>(style.opacity * 255.0F));
      SDL_FRect target{rect.x + offset_x, rect.y + offset_y, width, height};
      SDL_RenderTexture(renderer_, texture, nullptr, &target);
      SDL_SetTextureAlphaMod(texture, 255);
      return;
    }
    float pen = rect.x + offset_x;
    for (std::size_t i = 0; i < codes.size(); ++i) {
      SDL_Texture *texture =
          fonts_.render_glyph(family, style.fontSize, codes[i], color);
      if (texture != nullptr) {
        float width = 0.0F;
        float height = 0.0F;
        SDL_GetTextureSize(texture, &width, &height);
        SDL_SetTextureAlphaMod(texture,
                               static_cast<uint8_t>(style.opacity * 255.0F));
        SDL_FRect target{pen, rect.y + offset_y, width, height};
        SDL_RenderTexture(renderer_, texture, nullptr, &target);
        if (style.bold) {
          SDL_FRect bold_target{pen + 1.0F, rect.y + offset_y, width, height};
          SDL_RenderTexture(renderer_, texture, nullptr, &bold_target);
        }
        SDL_SetTextureAlphaMod(texture, 255);
      }
      pen += static_cast<float>(advances[i]) + spacing;
    }
  };

  if (style.textShadow.enabled) {
    paint(style.textShadow.color, style.textShadow.offsetX,
          style.textShadow.offsetY);
  }
  paint(style.color, 0.0F, 0.0F);
}

Size SdlRenderer::text_size(const std::string &text,
                            const ComputedStyle &style) const {
  const std::string family = family_for(style);
  const float spacing = style.letterSpacing.value_or(0.0F);
  const Size natural = fonts_.size_text(family, style.fontSize, text);
  if (spacing == 0.0F) {
    return natural;
  }
  const std::vector<uint32_t> codes = decode_utf8(text);
  if (codes.empty()) {
    return natural;
  }
  float width = 0.0F;
  for (std::size_t i = 0; i < codes.size(); ++i) {
    width += static_cast<float>(
        fonts_.glyph_advance(family, style.fontSize, codes[i]));
    if (i + 1 < codes.size()) {
      width += spacing;
    }
  }
  return Size{width, natural.height};
}

void SdlRenderer::push_clip(const Rect &rect) {
  SDL_Rect current{0, 0, 0, 0};
  SDL_GetRenderClipRect(renderer_, &current);
  clip_stack_.push_back(current);
  SDL_Rect clip{static_cast<int>(rect.x), static_cast<int>(rect.y),
                static_cast<int>(rect.width), static_cast<int>(rect.height)};
  SDL_SetRenderClipRect(renderer_, &clip);
}

void SdlRenderer::pop_clip() {
  if (clip_stack_.empty()) {
    return;
  }
  const SDL_Rect prev = clip_stack_.back();
  clip_stack_.pop_back();
  if (prev.w <= 0 || prev.h <= 0) {
    SDL_SetRenderClipRect(renderer_, nullptr);
  } else {
    SDL_SetRenderClipRect(renderer_, &prev);
  }
}

void SdlRenderer::begin_frame() {
  SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_BLEND);
  SDL_SetRenderDrawColor(renderer_, 12, 20, 16, 255);
  SDL_RenderClear(renderer_);
}

void SdlRenderer::overlays() {
  ComputedStyle textStyle;
  textStyle.fontSize = 18;
  draw_text(EMERALD_VERSION_TEXT, Rect{1200, 680, 400, 300}, textStyle);
  const std::string set_root = "/images/tooltips/" + tooltip_set_;
  float x = 50;
  for (const TooltipHint &hint : tooltips_) {
    draw_image(set_root + "/BG.png", Rect{x, 670, 35, 35});
    draw_image(set_root + "/" + hint.icon + ".png", Rect{x, 670, 35, 35});
    draw_text(hint.label, Rect{x + 35, 680, 400, 300}, textStyle);
    x += 35.0F + text_size(hint.label, textStyle).width + 24.0F;
  }
}

void SdlRenderer::end_frame() {
  overlays();
  SDL_RenderPresent(renderer_);
}
} // namespace emerald::ui