#pragma once
#include "Ui/Types.hpp"
#include <optional>
#include <string>
#include <string_view>
#include <vector>
namespace emerald::ui {
struct BorderImage {
  std::string source;
  float sliceTop = 0.0F;
  float sliceRight = 0.0F;
  float sliceBottom = 0.0F;
  float sliceLeft = 0.0F;
  float widthTop = 0.0F;
  float widthRight = 0.0F;
  float widthBottom = 0.0F;
  float widthLeft = 0.0F;
  bool fill = true;
};

struct TextShadow {
  bool enabled = false;
  Color color = Color{63, 63, 63, 255};
  float offsetX = 1.0F;
  float offsetY = 1.0F;
};

struct TextStyle {
  std::string fontFamily;
  int fontSize = 16;
  Color color = kWhite;
  TextShadow textShadow;
  float letterSpacing = 0.0F;
  float lineHeight = 0.0F;
  bool bold = false;
  Align textAlign = Align::Start;
};

struct ComputedStyle {
  std::optional<float> width;
  std::optional<float> height;
  std::optional<float> maxHeight;
  std::optional<float> widthPercent;
  std::optional<float> heightPercent;
  float padding = 0.0F;
  std::optional<float> paddingLeft;
  std::optional<float> paddingRight;
  std::optional<float> paddingTop;
  std::optional<float> paddingBottom;
  float gap = 0.0F;
  float margin = 0.0F;
  std::optional<float> marginTop;
  std::optional<float> marginBottom;
  std::optional<float> marginLeft;
  std::optional<float> marginRight;
  float borderWidth = 0.0F;
  float flex = 0.0F;
  std::optional<Color> background;
  std::optional<std::string> backgroundImage;
  std::optional<BorderImage> borderImage;
  std::string fontFamily;
  int fontSize = 16;
  Color color = kWhite;
  bool hasColor = false;
  bool hasFontSize = false;
  TextShadow textShadow;
  std::optional<float> letterSpacing;
  std::optional<float> lineHeight;
  bool bold = false;
  std::optional<Align> textAlign;
  float opacity = 1.0F;
  Align align = Align::Stretch;
  bool visible = true;
  bool hovered = false;
  bool absolute = false;
  float left = 0.0F;
  float top = 0.0F;
  static ComputedStyle merge(const ComputedStyle &base,
                             const ComputedStyle &overlay);
};

TextStyle resolve_text_style(const ComputedStyle &style,
                             const TextStyle &inherited);

struct StyleRule {
  std::string selector;
  std::vector<std::string> declarations;
};

struct StyleSheet {
  std::vector<StyleRule> rules;
  ComputedStyle applyTo(const ComputedStyle &base, const std::string &tag,
                        const std::string &id,
                        const std::vector<std::string> &classes,
                        bool hovered = false) const;
};

bool parse_color(std::string_view text, Color &out);
std::vector<float> parse_sides(const std::string &value);
void apply_style_property(ComputedStyle &style, std::string_view name,
                          std::string_view value);
ComputedStyle parse_inline_style(std::string_view css);
std::vector<StyleRule> parse_style_block(std::string_view css);
} // namespace emerald::ui