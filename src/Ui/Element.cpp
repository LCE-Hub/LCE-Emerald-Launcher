#include "Ui/Element.hpp"
#include "Ui/RenderContext.hpp"
#include <algorithm>
#include <cstdlib>
#include <utility>
namespace emerald::ui {
namespace {
std::size_t visible_children(const std::vector<ElementPtr> &children) {
  std::size_t count = 0;
  for (const ElementPtr &child : children) {
    if (child->style().visible && !child->style().absolute) {
      ++count;
    }
  }
  return count;
}

void arrange_absolute(const ElementPtr &child, const Rect &container) {
  const ComputedStyle &style = child->style();
  child->arrange(Rect{container.x + style.left, container.y + style.top,
                      style.width.value_or(child->measured().width),
                      style.height.value_or(child->measured().height)});
}

void render_box(RenderContext &context, const Element &element) {
  const ComputedStyle &style = element.visual_style();
  const float alpha = style.opacity;
  if (style.borderImage.has_value()) {
    context.draw_nine_slice(style.borderImage->source, element.bounds(),
                            *style.borderImage);
  } else {
    if (style.background.has_value()) {
      Color bg = *style.background;
      bg.a = static_cast<uint8_t>(bg.a * alpha);
      context.fill_rect(element.bounds(), bg);
    }
    if (style.backgroundImage.has_value()) {
      context.draw_image(*style.backgroundImage, element.bounds(), alpha);
    }
  }
}

ImageFit parse_fit(std::string_view value) {
  if (value == "contain" || value == "aspect" || value == "fit") {
    return ImageFit::Contain;
  }
  if (value == "cover") {
    return ImageFit::Cover;
  }
  return ImageFit::Stretch;
}

Rect fit_rect(Size content, const Rect &bounds, ImageFit fit) {
  if (fit == ImageFit::Stretch || content.width <= 0.0F ||
      content.height <= 0.0F) {
    return bounds;
  }
  const float scaleX = bounds.width / content.width;
  const float scaleY = bounds.height / content.height;
  const float scale = fit == ImageFit::Cover ? std::max(scaleX, scaleY)
                                             : std::min(scaleX, scaleY);
  const float width = content.width * scale;
  const float height = content.height * scale;
  return Rect{
      bounds.x + (bounds.width - width) * 0.5F,
      bounds.y + (bounds.height - height) * 0.5F,
      width,
      height,
  };
}

class ColumnElement : public Element {
public:
  std::string_view tag() const override { return "column"; }
  void measure(const MeasureContext &context, const TextStyle &text) override {
    const TextStyle childText = resolve_text_style(style_, text);
    float contentWidth = 0.0F;
    float contentHeight = 0.0F;
    for (ElementPtr &child : children_) {
      child->measure(context, childText);
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      contentWidth = std::max(contentWidth, child->measured().width);
      contentHeight += child->measured().height;
      if (child->style().marginTop.has_value()) {
        contentHeight += *child->style().marginTop;
      }
      if (child->style().marginBottom.has_value()) {
        contentHeight += *child->style().marginBottom;
      }
    }
    const std::size_t count = visible_children(children_);
    if (count > 1) {
      contentHeight += style_.gap * static_cast<float>(count - 1);
    }
    measured_.width = clamped_width(contentWidth + inset() * 2.0F);
    measured_.height = clamped_height(contentHeight + inset() * 2.0F);
  }
  void arrange(const Rect &rect) override {
    bounds_ = rect;
    const float innerX = rect.x + inset();
    float cursorY = rect.y + inset();
    const float innerWidth = std::max(0.0F, rect.width - inset() * 2.0F);
    const float innerHeight = std::max(0.0F, rect.height - inset() * 2.0F);
    const std::size_t count = visible_children(children_);
    std::size_t index = 0;
    for (ElementPtr &child : children_) {
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      const float childWidth =
          child->style().widthPercent ? child->resolve_w(innerWidth)
          : child->style().width      ? *child->style().width
          : child->style().align == Align::Stretch ? innerWidth
                                                   : child->measured().width;
      const float childHeight = child->resolve_h(innerHeight);
      float childX = innerX;
      if (child->style().align == Align::Center) {
        childX = innerX + (innerWidth - childWidth) * 0.5F;
      } else if (child->style().align == Align::End) {
        childX = innerX + innerWidth - childWidth;
      }
      if (child->style().marginTop.has_value()) {
        cursorY += *child->style().marginTop;
      }
      child->arrange(Rect{childX, cursorY, childWidth, childHeight});
      cursorY += childHeight;
      if (child->style().marginBottom.has_value()) {
        cursorY += *child->style().marginBottom;
      }
      if (index + 1 < count) {
        cursorY += style_.gap;
      }
      ++index;
    }
    for (ElementPtr &child : children_) {
      if (child->style().visible && child->style().absolute) {
        arrange_absolute(child, rect);
      }
    }
  }

  void render(RenderContext &context, const TextStyle &text) const override {
    if (!style_.visible) {
      return;
    }
    render_box(context, *this);
    const TextStyle childText = resolve_text_style(visual_style(), text);
    for (const ElementPtr &child : children_) {
      if (child->style().visible) {
        child->render(context, childText);
      }
    }
  }
};

class RowElement : public Element {
public:
  std::string_view tag() const override { return "row"; }
  void measure(const MeasureContext &context, const TextStyle &text) override {
    const TextStyle childText = resolve_text_style(style_, text);
    float contentWidth = 0.0F;
    float contentHeight = 0.0F;
    for (ElementPtr &child : children_) {
      child->measure(context, childText);
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      if (child->style().flex <= 0.0F) {
        contentWidth += child->measured().width;
      }
      contentHeight = std::max(contentHeight, child->measured().height);
    }
    const std::size_t count = visible_children(children_);
    if (count > 1) {
      contentWidth += style_.gap * static_cast<float>(count - 1);
    }
    measured_.width = clamped_width(contentWidth + inset() * 2.0F);
    measured_.height = clamped_height(contentHeight + inset() * 2.0F);
  }
  void arrange(const Rect &rect) override {
    bounds_ = rect;
    const float innerY = rect.y + inset();
    float cursorX = rect.x + inset();
    const float innerWidth = std::max(0.0F, rect.width - inset() * 2.0F);
    const float innerHeight = std::max(0.0F, rect.height - inset() * 2.0F);
    const std::size_t count = visible_children(children_);
    float fixed = 0.0F, flexTotal = 0.0F;
    for (ElementPtr &c : children_) {
      if (!c->style().visible || c->style().absolute)
        continue;
      if (c->style().flex > 0.0F)
        flexTotal += c->style().flex;
      else
        fixed += c->resolve_w(innerWidth);
    }
    if (count > 1)
      fixed += style_.gap * float(count - 1);
    const float remaining = std::max(0.0F, innerWidth - fixed);
    std::size_t index = 0;
    for (ElementPtr &child : children_) {
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      const float childWidth = child->style().flex > 0.0F
                                   ? remaining * child->style().flex / flexTotal
                                   : child->resolve_w(innerWidth);
      const float childHeight =
          child->style().heightPercent ? child->resolve_h(innerHeight)
          : child->style().align == Align::Stretch ? innerHeight
                                                   : child->measured().height;
      float childY = innerY;
      if (child->style().align == Align::Center) {
        childY = innerY + (innerHeight - childHeight) * 0.5F;
      } else if (child->style().align == Align::End) {
        childY = innerY + innerHeight - childHeight;
      }
      child->arrange(Rect{cursorX, childY, childWidth, childHeight});
      cursorX += childWidth;
      if (index + 1 < count) {
        cursorX += style_.gap;
      }
      ++index;
    }
    for (ElementPtr &child : children_) {
      if (child->style().visible && child->style().absolute) {
        arrange_absolute(child, rect);
      }
    }
  }

  void render(RenderContext &context, const TextStyle &text) const override {
    if (!style_.visible) {
      return;
    }
    render_box(context, *this);
    const TextStyle childText = resolve_text_style(visual_style(), text);
    for (const ElementPtr &child : children_) {
      if (child->style().visible) {
        child->render(context, childText);
      }
    }
  }
};

class ImageElement : public Element {
public:
  std::string_view tag() const override { return "image"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    const std::string source = attribute("src");
    if (!source.empty() && !style_.backgroundImage.has_value()) {
      style_.backgroundImage = source;
    }
    measured_.width = style_.width.value_or(0.0F);
    measured_.height = style_.height.value_or(0.0F);
  }

  void render(RenderContext &context, const TextStyle &) const override {
    const ComputedStyle &visual = visual_style();
    if (!visual.visible || !visual.backgroundImage.has_value()) {
      return;
    }
    const Rect target = fit_rect(context.image_size(*visual.backgroundImage),
                                 bounds_, parse_fit(attribute("fit")));
    if (visual.background.has_value()) {
      context.draw_image_tinted(*visual.backgroundImage, target,
                                *visual.background, visual.opacity);
    } else {
      context.draw_image(*visual.backgroundImage, target, visual.opacity);
    }
  }
};

class LabelElement : public Element {
public:
  std::string_view tag() const override { return "label"; }
  void measure(const MeasureContext &context, const TextStyle &text) override {
    text_ = attribute("text");
    const TextStyle resolved = resolve_text_style(style_, text);
    ComputedStyle sizing = style_;
    sizing.fontFamily = resolved.fontFamily;
    sizing.fontSize = resolved.fontSize;
    sizing.letterSpacing = resolved.letterSpacing;
    sizing.bold = resolved.bold;
    const Size natural = context.text_size(text_, sizing);
    line_height_ = resolved.lineHeight > 0.0F ? resolved.lineHeight
                                              : natural.height;
    leading_ = std::max(0.0F, (line_height_ - natural.height) * 0.5F);
    text_align_ = resolved.textAlign;
    lines_.clear();
    if (style_.width.has_value()) {
      wrap_lines(text_, *style_.width, context, sizing);
      if (lines_.empty()) {
        lines_.emplace_back(std::string{}, 0.0F);
      }
      measured_.width = *style_.width;
      measured_.height = line_height_ * static_cast<float>(lines_.size());
    } else {
      lines_.emplace_back(text_, natural.width);
      measured_ = natural;
      if (line_height_ > 0.0F) {
        measured_.height = line_height_;
      }
    }
    if (style_.width.has_value()) {
      measured_.width = *style_.width;
    }
    if (style_.height.has_value()) {
      measured_.height = *style_.height;
    }
  }

  void render(RenderContext &context, const TextStyle &text) const override {
    if (!style_.visible) {
      return;
    }
    const ComputedStyle visual = visual_style();
    const TextStyle resolved = resolve_text_style(visual, text);
    ComputedStyle effective = visual;
    effective.fontFamily = resolved.fontFamily;
    effective.fontSize = resolved.fontSize;
    effective.color = resolved.color;
    effective.textShadow = resolved.textShadow;
    effective.letterSpacing = resolved.letterSpacing;
    effective.bold = resolved.bold;
    for (std::size_t i = 0; i < lines_.size(); ++i) {
      const auto &[line, line_width] = lines_[i];
      float x = bounds_.x;
      if (text_align_ == Align::Center) {
        x = bounds_.x + (bounds_.width - line_width) * 0.5F;
      } else if (text_align_ == Align::End) {
        x = bounds_.x + bounds_.width - line_width;
      }
      const float y = bounds_.y + line_height_ * static_cast<float>(i) +
                      leading_;
      context.draw_text(line, Rect{x, y, line_width, line_height_}, effective);
    }
  }

private:
  void wrap_lines(const std::string &text, float max_width,
                  const MeasureContext &context, const ComputedStyle &sizing) {
    std::vector<std::string> words;
    std::size_t start = 0;
    while (start < text.size()) {
      std::size_t end = text.find(' ', start);
      if (end == std::string::npos) {
        end = text.size();
      }
      if (end > start) {
        words.emplace_back(text.substr(start, end - start));
      }
      start = end + 1;
    }
    std::string current;
    for (const std::string &word : words) {
      if (current.empty()) {
        current = word;
        continue;
      }
      const std::string candidate = current + ' ' + word;
      if (context.text_size(candidate, sizing).width <= max_width) {
        current = candidate;
      } else {
        lines_.emplace_back(current, context.text_size(current, sizing).width);
        current = word;
      }
    }
    if (!current.empty()) {
      lines_.emplace_back(current, context.text_size(current, sizing).width);
    }
  }

  std::string text_;
  std::vector<std::pair<std::string, float>> lines_;
  float line_height_ = 0.0F;
  float leading_ = 0.0F;
  Align text_align_ = Align::Start;
};

class ButtonElement : public Element {
public:
  std::string_view tag() const override { return "button"; }
  void measure(const MeasureContext &context, const TextStyle &text) override {
    const TextStyle childText = resolve_text_style(style_, text);
    float contentWidth = 0.0F;
    float contentHeight = 0.0F;
    for (ElementPtr &child : children_) {
      child->measure(context, childText);
      contentWidth = std::max(contentWidth, child->measured().width);
      contentHeight = std::max(contentHeight, child->measured().height);
    }
    const float padX = style_.padding > 0.0F ? style_.padding : 12.0F;
    const float padY = style_.padding > 0.0F ? style_.padding : 8.0F;
    measured_.width = clamped_width(contentWidth + padX * 2.0F);
    measured_.height = clamped_height(contentHeight + padY * 2.0F);
  }

  void arrange(const Rect &rect) override {
    bounds_ = rect;
    for (ElementPtr &child : children_) {
      const float childWidth = child->measured().width;
      const float childHeight = child->measured().height;
      child->arrange(Rect{
          rect.x + (rect.width - childWidth) * 0.5F,
          rect.y + (rect.height - childHeight) * 0.5F,
          childWidth,
          childHeight,
      });
    }
  }

  void render(RenderContext &context, const TextStyle &text) const override {
    if (!style_.visible) {
      return;
    }
    render_box(context, *this);
    const TextStyle childText = resolve_text_style(visual_style(), text);
    for (const ElementPtr &child : children_) {
      child->render(context, childText);
    }
  }
};

class ScrollElement : public Element {
public:
  std::string_view tag() const override { return "scroll"; }
  void measure(const MeasureContext &context, const TextStyle &text) override {
    const TextStyle childText = resolve_text_style(style_, text);
    content_height_ = 0.0F;
    float contentWidth = 0.0F;
    autoscroll_duration_ = 0.0F;
    autoscroll_from_ = 50.0F;
    autoscroll_to_ = -200.0F;
    if (const std::string &auto_scroll = attribute("autoscroll");
        !auto_scroll.empty()) {
      autoscroll_duration_ = std::atof(auto_scroll.c_str());
      if (!attribute("autoscroll-from").empty()) {
        autoscroll_from_ = std::atof(attribute("autoscroll-from").c_str());
      }
      if (!attribute("autoscroll-to").empty()) {
        autoscroll_to_ = std::atof(attribute("autoscroll-to").c_str());
      }
    }
    for (ElementPtr &child : children_) {
      child->measure(context, childText);
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      contentWidth = std::max(contentWidth, child->measured().width);
      content_height_ += child->measured().height;
      if (child->style().marginTop.has_value()) {
        content_height_ += *child->style().marginTop;
      }
      if (child->style().marginBottom.has_value()) {
        content_height_ += *child->style().marginBottom;
      }
    }
    const std::size_t count = visible_children(children_);
    if (count > 1) {
      content_height_ += style_.gap * static_cast<float>(count - 1);
    }
    const float content_height = content_height_ + inset() * 2.0F;
    const float cap =
        style_.height.value_or(style_.maxHeight.value_or(content_height));
    measured_.width = clamped_width(contentWidth + inset() * 2.0F);
    measured_.height = std::min(content_height, cap);
  }

  void arrange(const Rect &rect) override {
    bounds_ = rect;
    const float view_height = rect.height - inset() * 2.0F;
    const float max_scroll = std::max(0.0F, content_height_ - view_height);
    if (autoscroll_duration_ <= 0.0F) {
      scroll_offset_ = std::clamp(scroll_offset_, 0.0F, max_scroll);
    }
    const float innerX = rect.x + inset();
    float cursorY = rect.y + inset() - scroll_offset_;
    const float innerWidth = std::max(0.0F, rect.width - inset() * 2.0F);
    const std::size_t count = visible_children(children_);
    std::size_t index = 0;
    for (ElementPtr &child : children_) {
      if (!child->style().visible || child->style().absolute) {
        continue;
      }
      const float childWidth =
          child->style().widthPercent ? child->resolve_w(innerWidth)
          : child->style().align == Align::Stretch ? innerWidth
                                                   : child->measured().width;
      const float childHeight = child->resolve_h(view_height);
      if (child->style().marginTop.has_value()) {
        cursorY += *child->style().marginTop;
      }
      child->arrange(Rect{innerX, cursorY, childWidth, childHeight});
      cursorY += childHeight;
      if (child->style().marginBottom.has_value()) {
        cursorY += *child->style().marginBottom;
      }
      if (index + 1 < count) {
        cursorY += style_.gap;
      }
      ++index;
    }
    for (ElementPtr &child : children_) {
      if (child->style().visible && child->style().absolute) {
        arrange_absolute(child, rect);
      }
    }
  }

  void render(RenderContext &context, const TextStyle &text) const override {
    if (!style_.visible) {
      return;
    }
    render_box(context, *this);
    const float in = inset();
    context.push_clip(Rect{bounds_.x + in, bounds_.y + in,
                           bounds_.width - in * 2.0F,
                           bounds_.height - in * 2.0F});
    const TextStyle childText = resolve_text_style(visual_style(), text);
    for (const ElementPtr &child : children_) {
      if (child->style().visible) {
        child->render(context, childText);
      }
    }
    context.pop_clip();
  }

  void on_wheel(float delta_y) override {
    if (autoscroll_duration_ > 0.0F) {
      return;
    }
    const float view_height = bounds_.height - inset() * 2.0F;
    const float max_scroll = std::max(0.0F, content_height_ - view_height);
    scroll_offset_ =
        std::clamp(scroll_offset_ + delta_y * kScrollSpeed, 0.0F, max_scroll);
    arrange(bounds_);
  }

  Element *scroll_hit_test(const Vec2 &point) {
    return bounds_.contains(point) ? this : nullptr;
  }

  bool scroll_to(const Rect &target) override {
    if (autoscroll_duration_ > 0.0F) {
      return false;
    }
    const float in = inset();
    const float view_top = bounds_.y + in;
    const float view_bottom = bounds_.y + bounds_.height - in;
    const float view_height = bounds_.height - in * 2.0F;
    const float max_scroll = std::max(0.0F, content_height_ - view_height);
    float delta = 0.0F;
    if (target.y < view_top - 1.0F) {
      delta = target.y - view_top;
    } else if (target.y + target.height > view_bottom + 1.0F) {
      delta = target.y + target.height - view_bottom;
    }
    if (delta != 0.0F) {
      scroll_offset_ = std::clamp(scroll_offset_ + delta, 0.0F, max_scroll);
      arrange(bounds_);
    }
    return true;
  }

  void seed_clock(uint64_t ticks) override {
    start_ticks_ = ticks;
    Element::seed_clock(ticks);
  }

  bool tick(uint64_t now_ticks) override {
    bool active = Element::tick(now_ticks);
    if (autoscroll_duration_ <= 0.0F) {
      return active;
    }
    const float view_height =
        bounds_.height - inset() * 2.0F;
    const uint64_t duration_ms =
        static_cast<uint64_t>(autoscroll_duration_ * 1000.0F);
    const uint64_t elapsed =
        now_ticks >= start_ticks_ ? now_ticks - start_ticks_ : 0U;
    const float progress = duration_ms > 0U
                               ? std::min(1.0F, static_cast<float>(elapsed) /
                                                    static_cast<float>(duration_ms))
                               : 1.0F;
    const float fraction_percent =
        autoscroll_from_ + (autoscroll_to_ - autoscroll_from_) * progress;
    const float fraction = fraction_percent * 0.01F;
    scroll_offset_ = (content_height_ - view_height) * 0.5F -
                     fraction * content_height_;
    return elapsed < duration_ms;
  }

private:
  static constexpr float kScrollSpeed = 24.0F;
  float scroll_offset_ = 0.0F;
  float content_height_ = 0.0F;
  float autoscroll_duration_ = 0.0F;
  float autoscroll_from_ = 50.0F;
  float autoscroll_to_ = -200.0F;
  uint64_t start_ticks_ = 0U;
};
} // namespace
TextInputElement::TextInputElement() {
  set_interactive(true);
}
SliderElement::SliderElement() {
  set_interactive(true);
}
void TextInputElement::end_edit(bool commit) {
  if (!editing_) {
    return;
  }
  if (commit) {
    buffer_ = text();
  }
  editing_ = false;
}
std::string TextInputElement::text() const {
  return editing_ ? buffer_ : attribute("value");
}
bool TextInputElement::multiline() const {
  return attribute("multiline") == "true";
}
void TextInputElement::insert(std::string_view inserted) {
  if (!editing_) {
    return;
  }
  buffer_.append(inserted);
}
void TextInputElement::backspace() {
  if (!editing_ || buffer_.empty()) {
    return;
  }
  buffer_.pop_back();
}
bool TextInputElement::begin_edit() {
  buffer_ = attribute("value");
  editing_ = true;
  return true;
}
void TextInputElement::measure(const MeasureContext &context,
                               const TextStyle &inherited) {
  const TextStyle resolved = resolve_text_style(style_, inherited);
  std::string label = attribute("label");
  if (!label.empty()) {
    ComputedStyle sizing = style_;
    sizing.fontFamily = resolved.fontFamily;
    sizing.fontSize = resolved.fontSize;
    Size label_size = context.text_size(label, sizing);
    label_width_ = label_size.width;
    label_height_ = label_size.height;
  } else {
    label_width_ = 0.0F;
    label_height_ = 0.0F;
  }
  box_height_ = multiline() ? 110.0F : 40.0F;
  const float content_width =
      std::max(style_.width.value_or(label_width_), label_width_);
  const float content_height =
      label_height_ + (label.empty() ? 0.0F : 4.0F) + box_height_;
  measured_.width = clamped_width(content_width);
  measured_.height = clamped_height(content_height);
}
void TextInputElement::arrange(const Rect &rect) {
  bounds_ = rect;
}
void TextInputElement::render(RenderContext &context,
                              const TextStyle &inherited) const {
  if (!style_.visible) {
    return;
  }
  const TextStyle resolved = resolve_text_style(visual_style(), inherited);
  ComputedStyle label_style = visual_style();
  label_style.fontFamily = resolved.fontFamily;
  label_style.fontSize = resolved.fontSize;
  label_style.color = Color{0, 0, 0, 255};
  label_style.textShadow.enabled = false;
  ComputedStyle text_style = label_style;
  text_style.color = Color{255, 255, 255, 255};

  const float label_gap = label_height_ > 0.0F ? 4.0F : 0.0F;
  const Rect box{bounds_.x, bounds_.y + label_height_ + label_gap,
                 bounds_.width, box_height_};
  context.draw_image("/images/Button_Background2.png", box, style_.opacity);

  std::string label = attribute("label");
  if (!label.empty()) {
    context.draw_text(label,
                      Rect{bounds_.x, bounds_.y, label_width_, label_height_},
                      label_style);
  }

  std::string display = editing_ ? buffer_ : attribute("value");
  if (editing_ && !display.empty()) {
    display += "_";
  }
  if (editing_ && display.empty()) {
    display = "_";
  }
  if (display.empty()) {
    return;
  }
  const float line_height = static_cast<float>(resolved.fontSize) + 4.0F;
  std::string_view remaining = display;
  float line_y = box.y + (box.height - std::min(line_height, box.height)) * 0.5F;
  if (multiline()) {
    line_y = box.y + box.height - line_height;
  }
  while (!remaining.empty()) {
    const std::size_t nl = remaining.find('\n');
    const std::string_view line =
        nl == std::string_view::npos ? remaining : remaining.substr(0, nl);
    context.draw_text(std::string(line),
                      Rect{box.x + 8.0F, line_y, box.width - 16.0F, line_height},
                      text_style);
    if (nl == std::string_view::npos) {
      break;
    }
    remaining.remove_prefix(nl + 1);
    line_y -= line_height;
  }
}
void SliderElement::measure(const MeasureContext &context,
                            const TextStyle &inherited) {
  const TextStyle resolved = resolve_text_style(style_, inherited);
  std::string label = attribute("label");
  if (!label.empty()) {
    ComputedStyle sizing = style_;
    sizing.fontFamily = resolved.fontFamily;
    sizing.fontSize = resolved.fontSize;
    Size label_size = context.text_size(label, sizing);
    label_width_ = label_size.width;
    label_height_ = label_size.height;
  } else {
    label_width_ = 0.0F;
    label_height_ = 0.0F;
  }
  value_ = std::clamp(std::atoi(attribute("value").c_str()), 0, 100);
  measured_.width = clamped_width(style_.width.value_or(600.0F));
  measured_.height = clamped_height(style_.height.value_or(40.0F));
}
void SliderElement::arrange(const Rect &rect) {
  bounds_ = rect;
}
void SliderElement::adjust(int delta) {
  value_ = std::clamp(value_ + delta, 0, 100);
}
void SliderElement::click_at(float x) {
  const float width = std::max(1.0F, bounds_.width);
  value_ = std::clamp(
      static_cast<int>((x - bounds_.x) / width * 100.0F), 0, 100);
}
void SliderElement::render(RenderContext &context,
                           const TextStyle &inherited) const {
  if (!style_.visible) {
    return;
  }
  render_box(context, *this);
  const float handle_width = 20.0F;
  const float fraction =
      static_cast<float>(value_) / 100.0F * (bounds_.width - handle_width);
  context.draw_image("/images/Slider_Handle.png",
                     Rect{bounds_.x + fraction, bounds_.y, handle_width,
                          bounds_.height},
                     style_.opacity);
  const TextStyle resolved = resolve_text_style(visual_style(), inherited);
  ComputedStyle label_style = visual_style();
  label_style.fontFamily = resolved.fontFamily;
  label_style.fontSize = resolved.fontSize;
  label_style.color = resolved.color;
  label_style.textShadow = resolved.textShadow;
  if (label_width_ > 0.0F) {
    context.draw_text(
        attribute("label"),
        Rect{bounds_.x + (bounds_.width - label_width_) * 0.5F,
             bounds_.y + (bounds_.height - label_height_) * 0.5F, label_width_,
             label_height_},
        label_style);
  }
}
Element::Element() = default;
Element::~Element() = default;
Element *Element::add_child(ElementPtr child) {
  child->parent_ = this;
  children_.push_back(std::move(child));
  return children_.back().get();
}

const std::string &Element::attribute(std::string_view name) const {
  static const std::string empty;
  const auto found = attributes_.find(std::string(name));
  return found == attributes_.end() ? empty : found->second;
}

float Element::clamped_width(float available) const {
  if (style_.widthPercent)
    return 0.0F;
  return style_.width.value_or(available);
}
float Element::clamped_height(float available) const {
  if (style_.heightPercent)
    return 0.0F;
  return style_.height.value_or(available);
}
float Element::resolve_w(float parentInner) const {
  return style_.widthPercent ? parentInner * *style_.widthPercent / 100.0F
                             : measured_.width;
}
float Element::resolve_h(float parentInner) const {
  return style_.heightPercent ? parentInner * *style_.heightPercent / 100.0F
                              : measured_.height;
}

void Element::measure(const MeasureContext &, const TextStyle &) {}
void Element::arrange(const Rect &rect) { bounds_ = rect; }
void Element::render(RenderContext &, const TextStyle &) const {}
void Element::on_wheel(float) {}
bool Element::scroll_to(const Rect &) { return false; }
bool Element::tick(uint64_t now_ticks) {
  bool active = false;
  for (const ElementPtr &child : children_) {
    active = child->tick(now_ticks) || active;
  }
  return active;
}
void Element::seed_clock(uint64_t ticks) {
  for (const ElementPtr &child : children_) {
    child->seed_clock(ticks);
  }
}
void Element::reveal() {
  for (Element *ancestor = parent_; ancestor != nullptr;
       ancestor = ancestor->parent_) {
    if (ancestor->scroll_to(bounds_)) {
      break;
    }
  }
}
Element *Element::hit_test(const Vec2 &point) {
  if (!style_.visible) {
    return nullptr;
  }
  for (auto iterator = children_.rbegin(); iterator != children_.rend();
       ++iterator) {
    if (Element *found = (*iterator)->hit_test(point)) {
      return found;
    }
  }
  return bounds_.contains(point) ? this : nullptr;
}

Element *Element::scroll_hit_test(const Vec2 &point) {
  if (!style_.visible) {
    return nullptr;
  }
  for (auto iterator = children_.rbegin(); iterator != children_.rend();
       ++iterator) {
    if (Element *found = (*iterator)->scroll_hit_test(point)) {
      return found;
    }
  }
  return nullptr;
}

Element *Element::find_by_id(const std::string &id) {
  if (id_ == id) {
    return this;
  }
  for (ElementPtr &child : children_) {
    if (Element *found = child->find_by_id(id)) {
      return found;
    }
  }
  return nullptr;
}

ElementRegistry &ElementRegistry::instance() {
  static ElementRegistry registry;
  return registry;
}

void ElementRegistry::register_element(std::string tag,
                                       ElementFactory factory) {
  factories_[std::move(tag)] = std::move(factory);
}

ElementPtr ElementRegistry::create(std::string_view tag) const {
  const auto found = factories_.find(std::string(tag));
  if (found == factories_.end()) {
    return nullptr;
  }
  return found->second();
}

bool ElementRegistry::has(std::string_view tag) const {
  return factories_.contains(std::string(tag));
}

void register_builtin_elements() { // neo: i know i could've done it better but
                                   // eh, sidenote: i hate how this IDE does
                                   // this code comment splitting thing
  ElementRegistry &registry = ElementRegistry::instance();
  if (registry.has("column")) {
    return;
  }
  registry.register_element("column",
                            [] { return std::make_unique<ColumnElement>(); });
  registry.register_element("row",
                            [] { return std::make_unique<RowElement>(); });
  registry.register_element("image",
                            [] { return std::make_unique<ImageElement>(); });
  registry.register_element("label",
                            [] { return std::make_unique<LabelElement>(); });
  registry.register_element("button",
                            [] { return std::make_unique<ButtonElement>(); });
  registry.register_element("scroll",
                            [] { return std::make_unique<ScrollElement>(); });
  registry.register_element(
      "textinput", [] { return std::make_unique<TextInputElement>(); });
  registry.register_element("slider",
                            [] { return std::make_unique<SliderElement>(); });
}

} // namespace emerald::ui