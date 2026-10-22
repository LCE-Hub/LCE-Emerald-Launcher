#include "Ui/Style.hpp"
#include <algorithm>
#include <array>
#include <charconv>
#include <cstring>
#include <sstream>
namespace emerald::ui {
namespace {
std::string_view trim(std::string_view text) {
  while (!text.empty() && (text.front() == ' ' || text.front() == '\t' ||
                           text.front() == '\n' || text.front() == '\r')) {
    text.remove_prefix(1);
  }
  while (!text.empty() && (text.back() == ' ' || text.back() == '\t' ||
                           text.back() == '\n' || text.back() == '\r')) {
    text.remove_suffix(1);
  }
  return text;
}

bool parse_hex(std::string_view text, Color &out) {
  if (text.empty() || text.front() != '#') {
    return false;
  }
  const std::string_view digits = text.substr(1);
  auto hexDigit = [](char c) -> int {
    if (c >= '0' && c <= '9') {
      return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
      return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F') {
      return c - 'A' + 10;
    }
    return -1;
  };
  if (digits.size() == 3 || digits.size() == 4) {
    const std::array<int, 4> nibbles{
        hexDigit(digits[0]),
        hexDigit(digits[1]),
        hexDigit(digits[2]),
        digits.size() == 4 ? hexDigit(digits[3]) : 15,
    };
    for (const int nibble : nibbles) {
      if (nibble < 0) {
        return false;
      }
    }
    out.r = static_cast<uint8_t>(nibbles[0] * 17);
    out.g = static_cast<uint8_t>(nibbles[1] * 17);
    out.b = static_cast<uint8_t>(nibbles[2] * 17);
    out.a = static_cast<uint8_t>(nibbles[3] * 17);
    return true;
  }
  if (digits.size() == 6 || digits.size() == 8) {
    auto byteValue = [&](std::size_t index) -> int {
      return hexDigit(digits[index]) * 16 + hexDigit(digits[index + 1]);
    };
    const std::size_t count = digits.size() / 2;
    const int r = byteValue(0);
    const int g = byteValue(2);
    const int b = byteValue(4);
    const int a = count == 4 ? byteValue(6) : 255;
    if (r < 0 || g < 0 || b < 0 || a < 0) {
      return false;
    }
    out.r = static_cast<uint8_t>(r);
    out.g = static_cast<uint8_t>(g);
    out.b = static_cast<uint8_t>(b);
    out.a = static_cast<uint8_t>(a);
    return true;
  }
  return false;
}

bool color_name(std::string_view text, Color &out) {
  if (text == "white" || text == "white_text") {
    out = kWhite;
    return true;
  }
  if (text == "black") {
    out = kBlack;
    return true;
  }
  if (text == "transparent") {
    out = kTransparent;
    return true;
  }
  return false;
}

float parse_length(std::string_view text) {
  std::string cleaned(text);
  if (cleaned.ends_with("px")) {
    cleaned.resize(cleaned.size() - 2);
  }
  float value = 0.0F;
  const auto result =
      std::from_chars(cleaned.data(), cleaned.data() + cleaned.size(), value);
  return result.ec == std::errc{} ? value : 0.0F;
}

static void expand_sides(const std::vector<float> &sides, float &uniform,
                         std::optional<float> &top,
                         std::optional<float> &right,
                         std::optional<float> &bottom,
                         std::optional<float> &left) {
  if (sides.empty()) {
    return;
  }
  if (sides.size() > 1) {
    top = sides[0];
    right = sides[1];
    bottom = sides.size() > 2 ? sides[2] : sides[0];
    left = sides.size() > 3 ? sides[3] : sides[1];
  } else {
    uniform = sides[0];
    top.reset();
    right.reset();
    bottom.reset();
    left.reset();
  }
}

std::vector<float> parse_sides(const std::string &value) {
  std::vector<float> sides;
  std::size_t start = 0;
  while (start < value.size() && sides.size() < 4) {
    while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start]))) {
      ++start;
    }
    if (start >= value.size()) {
      break;
    }
    const std::size_t end = value.find_first_of(" \t", start);
    const std::size_t stop = end == std::string::npos ? value.size() : end;
    sides.push_back(parse_length(std::string_view(value).substr(start, stop - start)));
    start = stop;
  }
  return sides;
}

std::optional<float> parse_percent(std::string_view text) {
  if (!text.ends_with('%'))
    return std::nullopt;
  text.remove_suffix(1);
  float value = 0.0F;
  const auto result =
      std::from_chars(text.data(), text.data() + text.size(), value);
  return result.ec == std::errc{} ? std::optional<float>(value) : std::nullopt;
}
bool parse_align(std::string_view text, Align &out) {
  if (text == "start" || text == "left") {
    out = Align::Start;
    return true;
  }
  if (text == "center") {
    out = Align::Center;
    return true;
  }
  if (text == "end" || text == "right") {
    out = Align::End;
    return true;
  }
  if (text == "stretch" || text == "fill") {
    out = Align::Stretch;
    return true;
  }
  return false;
}

std::vector<std::string> split_words(std::string_view text) {
  std::vector<std::string> words;
  std::size_t start = 0;
  while (start < text.size()) {
    std::size_t end = text.find_first_of(" \t", start);
    if (end == std::string_view::npos) {
      end = text.size();
    }
    if (end > start) {
      words.emplace_back(text.substr(start, end - start));
    }
    start = end + 1;
  }
  return words;
}

std::string strip_url(std::string_view word) {
  std::string value = std::string(trim(word));
  if (value.size() >= 2 && value.front() == 'u' && value.find("url(") == 0) {
    const std::size_t open = value.find('(');
    const std::size_t close = value.rfind(')');
    if (open != std::string::npos && close != std::string::npos &&
        close > open) {
      value = value.substr(open + 1, close - open - 1);
    }
    value = std::string(trim(value));
    if (value.size() >= 2 && (value.front() == '"' || value.front() == '\'')) {
      value = value.substr(1, value.size() - 2);
    }
  }
  return value;
}

bool is_url_token(std::string_view word) {
  return word.find("url(") != std::string_view::npos;
}

bool apply_border_image(ComputedStyle &style, std::string_view value) {
  BorderImage border;
  bool haveSlices = false;
  std::vector<float> slices;
  std::vector<float> widths;
  bool afterSlash = false;
  for (const std::string &word : split_words(value)) {
    if (word == "/") {
      afterSlash = true;
      continue;
    }
    if (!afterSlash && is_url_token(word)) {
      border.source = strip_url(word);
      continue;
    }
    if (word == "fill" || word == "stretch" || word == "repeat" ||
        word == "round") {
      border.fill = word == "fill";
      continue;
    }
    if (word == "auto")
      continue;
    if (afterSlash) {
      widths.push_back(parse_length(word));
    } else {
      slices.push_back(parse_length(word));
      haveSlices = true;
    }
  }

  (void)afterSlash;
  if (border.source.empty() || !haveSlices) {
    return false;
  }

  border.sliceTop = slices[0];
  border.sliceRight = slices.size() > 1 ? slices[1] : slices[0];
  border.sliceBottom = slices.size() > 2 ? slices[2] : slices[0];
  border.sliceLeft = slices.size() > 3 ? slices[3] : slices[0];
  if (widths.empty()) {
    border.widthTop = border.sliceTop;
    border.widthRight = border.sliceRight;
    border.widthBottom = border.sliceBottom;
    border.widthLeft = border.sliceLeft;
  } else {
    border.widthTop = widths[0];
    border.widthRight = widths.size() > 1 ? widths[1] : widths[0];
    border.widthBottom = widths.size() > 2 ? widths[2] : widths[0];
    border.widthLeft = widths.size() > 3 ? widths[3] : widths[0];
  }

  style.borderImage = std::move(border);
  return true;
}

bool apply_text_shadow(ComputedStyle &style, std::string_view value) {
  const std::vector<std::string> words = split_words(value);
  if (words.size() < 2) {
    return false;
  }

  std::vector<std::string> lengths;
  Color color = style.textShadow.color;
  bool haveColor = false;
  for (const std::string &word : words) {
    Color parsed;
    if (parse_color(word, parsed)) {
      color = parsed;
      haveColor = true;
      continue;
    }
    lengths.push_back(word);
  }
  if (!haveColor || lengths.size() < 2) {
    return false;
  }

  style.textShadow.enabled = true;
  style.textShadow.color = color;
  style.textShadow.offsetX = parse_length(lengths[0]);
  style.textShadow.offsetY = parse_length(lengths[1]);
  return true;
}

void apply_declaration(ComputedStyle &style, std::string_view name,
                       std::string_view value) {
  name = trim(name);
  value = trim(value);
  if (name == "width") {
    if (const auto pct = parse_percent(value)) {
      style.widthPercent = pct;
      style.width.reset();
    } else {
      style.width = parse_length(value);
      style.widthPercent.reset();
    }
  } else if (name == "height") {
    if (const auto pct = parse_percent(value)) {
      style.heightPercent = pct;
      style.height.reset();
    } else {
      style.height = parse_length(value);
      style.heightPercent.reset();
    }
  } else if (name == "max-height") {
    style.maxHeight = parse_length(value);
  } else if (name == "padding") {
    expand_sides(parse_sides(std::string(value)), style.padding,
                 style.paddingTop, style.paddingRight, style.paddingBottom,
                 style.paddingLeft);
  } else if (name == "padding-left") {
    style.paddingLeft = parse_length(value);
  } else if (name == "padding-right") {
    style.paddingRight = parse_length(value);
  } else if (name == "padding-top") {
    style.paddingTop = parse_length(value);
  } else if (name == "padding-bottom") {
    style.paddingBottom = parse_length(value);
  } else if (name == "border-width") {
    style.borderWidth = parse_length(value);
  } else if (name == "gap") {
    style.gap = parse_length(value);
  } else if (name == "margin") {
    const std::vector<float> sides = parse_sides(std::string(value));
    expand_sides(sides, style.margin, style.marginTop, style.marginRight,
                 style.marginBottom, style.marginLeft);
    if (!style.marginTop.has_value()) {
      style.marginTop = style.margin;
      style.marginBottom = style.margin;
    }
  } else if (name == "margin-left") {
    style.marginLeft = parse_length(value);
  } else if (name == "margin-right") {
    style.marginRight = parse_length(value);
  } else if (name == "margin-top") {
    style.marginTop = parse_length(value);
  } else if (name == "margin-bottom") {
    style.marginBottom = parse_length(value);
  } else if (name == "flex") {
    style.flex = parse_length(value);
  } else if (name == "background" || name == "background-color" ||
             name == "color-bg") {
    Color color;
    if (parse_color(value, color)) {
      style.background = color;
    }
  } else if (name == "background-image") {
    style.backgroundImage = std::string(trim(value));
  } else if (name == "color") {
    Color color;
    if (parse_color(value, color)) {
      style.color = color;
      style.hasColor = true;
    }
  } else if (name == "font-family" || name == "font") {
    style.fontFamily = std::string(trim(value));
  } else if (name == "font-size") {
    style.fontSize = static_cast<int>(parse_length(value));
    style.hasFontSize = true;
  } else if (name == "letter-spacing") {
    style.letterSpacing =
        value == "normal" ? 0.0F : parse_length(value);
  } else if (name == "line-height") {
    if (value == "normal") {
      style.lineHeight.reset();
    } else if (value.ends_with("px")) {
      style.lineHeight = parse_length(value);
    } else {
      style.lineHeight =
          parse_length(value) * static_cast<float>(style.fontSize);
    }
  } else if (name == "font-weight") {
    if (value == "bold" || value == "bolder") {
      style.bold = true;
    } else {
      style.bold = parse_length(value) >= 600.0F;
    }
  } else if (name == "text-align") {
    Align align = Align::Start;
    if (parse_align(value, align)) {
      style.textAlign = align;
    }
  } else if (name == "border-image") {
    apply_border_image(style, value);
  } else if (name == "opacity") {
    style.opacity = std::clamp(parse_length(value), 0.0F, 1.0F);
  } else if (name == "text-shadow") {
    apply_text_shadow(style, value);
  } else if (name == "align") {
    parse_align(value, style.align);
  } else if (name == "visible" || name == "display") {
    style.visible = value != "none";
  } else if (name == "position") {
    style.absolute = value == "absolute";
  } else if (name == "left") {
    style.left = parse_length(value);
  } else if (name == "top") {
    style.top = parse_length(value);
  }
}

} // namespace

bool parse_color(std::string_view text, Color &out) {
  text = trim(text);
  if (parse_hex(text, out)) {
    return true;
  }
  if (color_name(text, out)) {
    return true;
  }
  if (text.rfind("rgb", 0) == 0) {
    const std::size_t open = text.find('(');
    const std::size_t close = text.rfind(')');
    if (open != std::string_view::npos && close != std::string_view::npos &&
        close > open) {
      const bool has_alpha = text.rfind("rgba", 0) == 0;
      std::vector<std::string> parts;
      std::size_t start = open + 1;
      for (std::size_t i = start; i <= close; ++i) {
        if (i == close || text[i] == ',') {
          parts.emplace_back(trim(text.substr(start, i - start)));
          start = i + 1;
        }
      }
      if (parts.size() >= 3) {
        const auto number = [](const std::string &p) -> int {
          if (p.find('%') != std::string::npos) {
            return static_cast<int>(parse_length(p) * 2.55F);
          }
          return static_cast<int>(parse_length(p));
        };
        out.r = static_cast<std::uint8_t>(std::clamp(number(parts[0]), 0, 255));
        out.g = static_cast<std::uint8_t>(std::clamp(number(parts[1]), 0, 255));
        out.b = static_cast<std::uint8_t>(std::clamp(number(parts[2]), 0, 255));
        out.a = 255;
        if (has_alpha && parts.size() > 3) {
          out.a = static_cast<std::uint8_t>(
              std::clamp(static_cast<int>(parse_length(parts[3]) * 255.0F),
                         0, 255));
        }
        return true;
      }
    }
  }
  return false;
}

void apply_style_property(ComputedStyle &style, std::string_view name,
                          std::string_view value) {
  apply_declaration(style, name, value);
}

std::vector<std::string> split_declarations(std::string_view css) {
  std::vector<std::string> result;
  std::size_t start = 0;
  for (std::size_t i = 0; i < css.size(); ++i) {
    if (css[i] == ';') {
      result.emplace_back(trim(css.substr(start, i - start)));
      start = i + 1;
    }
  }
  result.emplace_back(trim(css.substr(start)));
  return result;
}

ComputedStyle parse_inline_style(std::string_view css) {
  ComputedStyle style;
  for (const std::string &declaration : split_declarations(css)) {
    const std::size_t colon = declaration.find(':');
    if (colon == std::string::npos) {
      continue;
    }
    apply_declaration(style, declaration.substr(0, colon),
                      declaration.substr(colon + 1));
  }
  return style;
}

std::vector<StyleRule> parse_style_block(std::string_view css) {
  std::vector<StyleRule> rules;
  std::size_t cursor = 0;
  while (cursor < css.size()) {
    const std::size_t braceOpen = css.find('{', cursor);
    if (braceOpen == std::string_view::npos) {
      break;
    }
    const std::size_t braceClose = css.find('}', braceOpen);
    if (braceClose == std::string_view::npos) {
      break;
    }
    StyleRule rule;
    rule.selector = std::string(trim(css.substr(cursor, braceOpen - cursor)));
    rule.declarations = split_declarations(
        css.substr(braceOpen + 1, braceClose - braceOpen - 1));
    rules.push_back(std::move(rule));
    cursor = braceClose + 1;
  }
  return rules;
}

TextStyle resolve_text_style(const ComputedStyle &style,
                             const TextStyle &inherited) {
  TextStyle result = inherited;
  if (style.hasFontSize) {
    result.fontSize = style.fontSize;
  }
  if (style.hasColor) {
    result.color = style.color;
  }
  if (!style.fontFamily.empty()) {
    result.fontFamily = style.fontFamily;
  }
  if (style.textShadow.enabled) {
    result.textShadow = style.textShadow;
  }
  if (style.letterSpacing.has_value()) {
    result.letterSpacing = *style.letterSpacing;
  }
  if (style.lineHeight.has_value()) {
    result.lineHeight = *style.lineHeight;
  }
  if (style.bold) {
    result.bold = true;
  }
  if (style.textAlign.has_value()) {
    result.textAlign = *style.textAlign;
  }
  return result;
}

ComputedStyle ComputedStyle::merge(const ComputedStyle &base,
                                   const ComputedStyle &overlay) {
  ComputedStyle result = base;
  if (overlay.width.has_value()) {
    result.width = overlay.width;
  }
  if (overlay.height.has_value()) {
    result.height = overlay.height;
  }
  if (overlay.maxHeight.has_value()) {
    result.maxHeight = overlay.maxHeight;
  }
  if (overlay.widthPercent.has_value()) {
    result.widthPercent = overlay.widthPercent;
  }
  if (overlay.height.has_value()) {
    result.heightPercent = overlay.heightPercent;
  }
  if (overlay.padding != 0.0F) {
    result.padding = overlay.padding;
  }
  if (overlay.paddingLeft.has_value()) {
    result.paddingLeft = overlay.paddingLeft;
  }
  if (overlay.paddingRight.has_value()) {
    result.paddingRight = overlay.paddingRight;
  }
  if (overlay.paddingTop.has_value()) {
    result.paddingTop = overlay.paddingTop;
  }
  if (overlay.paddingBottom.has_value()) {
    result.paddingBottom = overlay.paddingBottom;
  }
  if (overlay.borderWidth != 0.0F) {
    result.borderWidth = overlay.borderWidth;
  }
  if (overlay.gap != 0.0F) {
    result.gap = overlay.gap;
  }
  if (overlay.margin != 0.0F) {
    result.margin = overlay.margin;
    result.marginTop = overlay.marginTop;
    result.marginBottom = overlay.marginBottom;
  }
  if (overlay.marginTop.has_value()) {
    result.marginTop = overlay.marginTop;
  }
  if (overlay.marginBottom.has_value()) {
    result.marginBottom = overlay.marginBottom;
  }
  if (overlay.marginLeft.has_value()) {
    result.marginLeft = overlay.marginLeft;
  }
  if (overlay.marginRight.has_value()) {
    result.marginRight = overlay.marginRight;
  }
  if (overlay.flex != 0.0F) {
    result.flex = overlay.flex;
  }
  if (overlay.background.has_value()) {
    result.background = overlay.background;
  }
  if (overlay.backgroundImage.has_value()) {
    result.backgroundImage = overlay.backgroundImage;
  }
  if (overlay.borderImage.has_value()) {
    result.borderImage = overlay.borderImage;
  }
  if (overlay.textShadow.enabled) {
    result.textShadow = overlay.textShadow;
  }
  if (overlay.opacity > 0.0F && overlay.opacity < 1.0F) {
    result.opacity = overlay.opacity;
  }
  if (!overlay.fontFamily.empty()) {
    result.fontFamily = overlay.fontFamily;
  }
  if (overlay.hasFontSize) {
    result.fontSize = overlay.fontSize;
    result.hasFontSize = true;
  }
  if (overlay.hasColor) {
    result.color = overlay.color;
    result.hasColor = true;
  }
  if (overlay.letterSpacing.has_value()) {
    result.letterSpacing = overlay.letterSpacing;
  }
  if (overlay.lineHeight.has_value()) {
    result.lineHeight = overlay.lineHeight;
  }
  if (overlay.bold) {
    result.bold = true;
  }
  if (overlay.textAlign.has_value()) {
    result.textAlign = overlay.textAlign;
  }
  if (overlay.align != Align::Stretch) {
    result.align = overlay.align;
  }
  if (overlay.absolute) {
    result.absolute = true;
  }
  if (overlay.left != 0.0F) {
    result.left = overlay.left;
  }
  if (overlay.top != 0.0F) {
    result.top = overlay.top;
  }
  if (overlay.visible) {
    result.visible = true;
  }
  return result;
}

ComputedStyle StyleSheet::applyTo(const ComputedStyle &base,
                                  const std::string &tag, const std::string &id,
                                  const std::vector<std::string> &classes,
                                  bool hovered) const {
  ComputedStyle result = base;
  for (const StyleRule &rule : rules) {
    std::string_view selector = rule.selector;
    bool wantsHover = false;
    const std::size_t hoverPos = selector.find(":hover");
    if (hoverPos != std::string_view::npos) {
      if (!hovered) {
        continue;
      }
      wantsHover = true;
      selector.remove_suffix(selector.size() - hoverPos);
    }

    bool matches = false;
    if (!selector.empty()) {
      if (selector[0] == '.') {
        const std::string className(selector.substr(1));
        for (const std::string &cls : classes) {
          if (cls == className) {
            matches = true;
            break;
          }
        }
      } else if (selector[0] == '#') {
        matches = id == selector.substr(1);
      } else {
        matches = tag == selector;
      }
    }
    if (!matches) {
      continue;
    }
    if (wantsHover) {
      result.hovered = true;
    }
    for (const std::string &declaration : rule.declarations) {
      const std::size_t colon = declaration.find(':');
      if (colon == std::string::npos) {
        continue;
      }
      apply_declaration(result, declaration.substr(0, colon),
                        declaration.substr(colon + 1));
    }
  }
  return result;
}

} // namespace emerald::ui