#pragma once
#include <cstdint>
namespace emerald::ui {
struct Color {
  uint8_t r = 0;
  uint8_t g = 0;
  uint8_t b = 0;
  uint8_t a = 255;
};

struct Vec2 {
  float x = 0.0F;
  float y = 0.0F;
};

struct Size {
  float width = 0.0F;
  float height = 0.0F;
};

struct Rect {
  float x = 0.0F;
  float y = 0.0F;
  float width = 0.0F;
  float height = 0.0F;
  bool contains(const Vec2 &point) const {
    return point.x >= x && point.x < x + width && point.y >= y &&
           point.y < y + height;
  }
};

enum class Align {
  Start,
  Center,
  End,
  Stretch,
};

enum class ImageFit {
  Stretch,
  Contain,
  Cover,
};

inline constexpr Color kWhite{255, 255, 255, 255};
inline constexpr Color kBlack{0, 0, 0, 255};
inline constexpr Color kTransparent{0, 0, 0, 0};
} // namespace emerald::ui