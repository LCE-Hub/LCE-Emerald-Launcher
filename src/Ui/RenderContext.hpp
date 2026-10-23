#pragma once
#include "Ui/Style.hpp"
#include "Ui/Types.hpp"
#include <string>
namespace emerald::ui {
class RenderContext {
public:
  virtual ~RenderContext() = default;
  virtual void fill_rect(const Rect &rect, Color color) = 0;
  virtual void draw_image(const std::string &source, const Rect &rect,
                          float alpha = 1.0F) = 0;
  virtual void draw_image_tinted(const std::string &source, const Rect &rect,
                                 Color tint, float alpha = 1.0F) = 0;
  virtual void draw_nine_slice(const std::string &source, const Rect &rect,
                               const BorderImage &border, float alpha = 1.0F) = 0;
  virtual Size image_size(const std::string &source) const = 0;
  virtual void draw_text(const std::string &text, const Rect &rect,
                         const ComputedStyle &style) = 0;
  virtual void push_clip(const Rect &rect) = 0;
  virtual void pop_clip() = 0;
};
} // namespace emerald::ui