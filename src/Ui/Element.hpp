#pragma once
#include "Ui/Style.hpp"
#include "Ui/Types.hpp"
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>
namespace emerald::ui {
class Element;
class RenderContext;
using ElementPtr = std::unique_ptr<Element>;
using StringMap = std::unordered_map<std::string, std::string>;
class MeasureContext {
public:
  virtual ~MeasureContext() = default;
  virtual Size text_size(const std::string &text,
                         const ComputedStyle &style) const = 0;
};

class Element {
public:
  Element();
  virtual ~Element();
  Element(const Element &) = delete;
  Element &operator=(const Element &) = delete;
  virtual std::string_view tag() const = 0;
  virtual void measure(const MeasureContext &context,
                       const TextStyle &text = TextStyle{});
  virtual void arrange(const Rect &rect);
  virtual void render(RenderContext &context,
                      const TextStyle &text = TextStyle{}) const;
  virtual void on_click() {}
  virtual void on_wheel(float delta_y);
  virtual Element *hit_test(const Vec2 &point);
  virtual Element *scroll_hit_test(const Vec2 &point);
  virtual bool scroll_to(const Rect &target);
  virtual bool tick(uint64_t now_ticks);
  virtual void seed_clock(uint64_t ticks);
  void reveal();
  Element *add_child(ElementPtr child);
  const std::string &id() const { return id_; }
  const std::vector<std::string> &classes() const { return classes_; }
  const StringMap &attributes() const { return attributes_; }
  const std::string &attribute(std::string_view name) const;
  const std::vector<ElementPtr> &children() const { return children_; }
  float resolve_w(float parentInner) const;
  float resolve_h(float parentInner) const;
  float pad_left() const {
    return style_.paddingLeft.value_or(style_.padding);
  }
  float pad_right() const {
    return style_.paddingRight.value_or(style_.padding);
  }
  float pad_top() const { return style_.paddingTop.value_or(style_.padding); }
  float pad_bottom() const {
    return style_.paddingBottom.value_or(style_.padding);
  }
  float hspace() const {
    return pad_left() + pad_right() + style_.borderWidth * 2.0F;
  }
  float vspace() const {
    return pad_top() + pad_bottom() + style_.borderWidth * 2.0F;
  }
  std::vector<ElementPtr> &children() { return children_; }
  const ComputedStyle &style() const { return style_; }
  void set_style(ComputedStyle style) { style_ = std::move(style); }
  const Rect &bounds() const { return bounds_; }
  const Size &measured() const { return measured_; }
  void set_id(std::string id) { id_ = std::move(id); }
  void set_classes(std::vector<std::string> classes) {
    classes_ = std::move(classes);
  }
  void set_attributes(StringMap attributes) {
    attributes_ = std::move(attributes);
  }

  Element *find_by_id(const std::string &id);
  void set_click_handler(std::string handler) {
    click_handler_ = std::move(handler);
    interactive_ = true;
  }
  const std::string &click_handler() const { return click_handler_; }
  bool has_click_handler() const { return !click_handler_.empty(); }
  bool interactive() const { return interactive_; }
  void set_interactive(bool value) { interactive_ = value; }
  virtual bool hides_partial_items() const { return false; }
  virtual Rect scroll_viewport() const { return bounds_; }
  bool hidden_by_scroll() const;
  void set_hovered(bool h) { hovered_ = h; }
  bool is_hovered() const { return hovered_; }
  void set_hover_style(ComputedStyle s) { hover_style_ = std::move(s); }
  const ComputedStyle &visual_style() const {
    if (hover_style_) {
      for (const Element *ancestor = this; ancestor != nullptr;
           ancestor = ancestor->parent_) {
        if (ancestor->hovered_) {
          return *hover_style_;
        }
      }
    }
    return style_;
  }

protected:
  float clamped_width(float available) const;
  float clamped_height(float available) const;
  std::string id_;
  std::vector<std::string> classes_;
  StringMap attributes_;
  ComputedStyle style_;
  std::vector<ElementPtr> children_;
  Rect bounds_;
  Size measured_;
  std::string click_handler_;
  Element *parent_ = nullptr;

private:
  bool hovered_ = false;
  bool interactive_ = false;
  std::optional<ComputedStyle> hover_style_;
};

class TextInputElement : public Element {
public:
  TextInputElement();
  std::string_view tag() const override { return "textinput"; }
  void measure(const MeasureContext &context, const TextStyle &text) override;
  void arrange(const Rect &rect) override;
  void render(RenderContext &context, const TextStyle &text) const override;
  bool begin_edit();
  bool editing() const { return editing_; }
  void end_edit(bool commit);
  void insert(std::string_view inserted);
  void backspace();
  std::string text() const;
  bool multiline() const;
  const std::string &on_submit() const { return attribute("onsubmit"); }

private:
  std::string buffer_;
  float label_height_ = 0.0F;
  float label_width_ = 0.0F;
  float box_height_ = 40.0F;
  bool editing_ = false;
};

class SliderElement : public Element {
public:
  SliderElement();
  std::string_view tag() const override { return "slider"; }
  void measure(const MeasureContext &context, const TextStyle &text) override;
  void arrange(const Rect &rect) override;
  void render(RenderContext &context, const TextStyle &text) const override;
  int value() const { return value_; }
  void adjust(int delta);
  void click_at(float x);
  const std::string &on_change() const { return attribute("onchange"); }

private:
  int value_ = 0;
  float label_width_ = 0.0F;
  float label_height_ = 0.0F;
};

using ElementFactory = std::function<ElementPtr()>;
class ElementRegistry {
public:
  static ElementRegistry &instance();
  void register_element(std::string tag, ElementFactory factory);
  ElementPtr create(std::string_view tag) const;
  bool has(std::string_view tag) const;

private:
  std::unordered_map<std::string, ElementFactory> factories_;
};

void register_builtin_elements();
} // namespace emerald::ui