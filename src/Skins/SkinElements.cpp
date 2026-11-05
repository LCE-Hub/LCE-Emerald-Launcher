#include "Skins/SkinElements.hpp"
#include "Skins/SkinModel3D.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/Element.hpp"
#include "Ui/Render/SdlRenderer.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <set>
#include <string>
#include <vector>
namespace emerald::ui {
namespace {
MousePoint g_logical_mouse;
skins::PixelColor hsv_to_rgb(float h, float s, float v) {
  h -= std::floor(h);
  if (h < 0.0F) {
    h += 1.0F;
  }
  const float scaled = h * 6.0F;
  const int sector = static_cast<int>(scaled) % 6;
  const float f = scaled - std::floor(scaled);
  const float p = v * (1.0F - s);
  const float q = v * (1.0F - f * s);
  const float t = v * (1.0F - (1.0F - f) * s);
  float r = 0.0F;
  float g = 0.0F;
  float b = 0.0F;
  switch (sector) {
  case 0:
    r = v;
    g = t;
    b = p;
    break;
  case 1:
    r = q;
    g = v;
    b = p;
    break;
  case 2:
    r = p;
    g = v;
    b = t;
    break;
  case 3:
    r = p;
    g = q;
    b = v;
    break;
  case 4:
    r = t;
    g = p;
    b = v;
    break;
  default:
    r = v;
    g = p;
    b = q;
    break;
  }
  const auto channel = [](float value) {
    return static_cast<std::uint8_t>(std::clamp(std::round(value * 255.0F),
                                                0.0F, 255.0F));
  };
  return skins::PixelColor{channel(r), channel(g), channel(b), 255};
}

SDL_Texture *ensure_texture(SDL_Renderer *renderer, SDL_Texture *existing,
                            int width, int height) {
  if (existing != nullptr) {
    float w = 0.0F;
    float h = 0.0F;
    SDL_GetTextureSize(existing, &w, &h);
    if (static_cast<int>(w) == width && static_cast<int>(h) == height) {
      return existing;
    }
    SDL_DestroyTexture(existing);
    existing = nullptr;
  }
  if (width <= 0 || height <= 0 || renderer == nullptr) {
    return nullptr;
  }
  SDL_Texture *texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                           SDL_TEXTUREACCESS_STREAMING, width,
                                           height);
  if (texture != nullptr) {
    SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  }
  return texture;
}

void upload_rgba(SDL_Texture *texture, int width,
                 const std::uint8_t *pixels) {
  if (texture == nullptr || pixels == nullptr) {
    return;
  }
  SDL_UpdateTexture(texture, nullptr, pixels, width * 4);
}

bool bounds_contains(const Rect &bounds, const MousePoint &point) {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width &&
         point.y >= bounds.y && point.y < bounds.y + bounds.height;
}

void draw_ring(RenderContext &context, float center_x, float center_y,
               float radius) {
  const float size = radius * 2.0F;
  const Color outer{0, 0, 0, 255};
  const Color inner{255, 255, 255, 255};
  context.fill_rect({center_x - radius - 1.0F, center_y - radius - 1.0F,
                     size + 2.0F, 1.0F},
                    outer);
  context.fill_rect({center_x - radius - 1.0F, center_y + radius,
                     size + 2.0F, 1.0F},
                    outer);
  context.fill_rect({center_x - radius - 1.0F, center_y - radius, 1.0F, size},
                    outer);
  context.fill_rect({center_x + radius, center_y - radius, 1.0F, size}, outer);
  context.fill_rect({center_x - radius, center_y - radius, size, 1.0F}, inner);
  context.fill_rect({center_x - radius, center_y + radius - 1.0F, size, 1.0F},
                    inner);
  context.fill_rect({center_x - radius, center_y - radius, 1.0F, size}, inner);
  context.fill_rect({center_x + radius - 1.0F, center_y - radius, 1.0F, size},
                    inner);
}

struct PendingSnapshot {
  std::string key;
  std::filesystem::path public_root;
  skins::SnapshotOptions options;
};

std::deque<PendingSnapshot> &snapshot_queue() {
  static std::deque<PendingSnapshot> queue;
  return queue;
}

std::set<std::string> &snapshot_queued() {
  static std::set<std::string> queued;
  return queued;
}

void queue_snapshot(const std::string &key,
                    const std::filesystem::path &public_root,
                    const skins::SnapshotOptions &options) {
  if (snapshot_queued().contains(key)) {
    return;
  }
  snapshot_queued().insert(key);
  snapshot_queue().push_back({key, public_root, options});
}

void process_pending_snapshots(std::uint64_t now_ticks) {
  static std::uint64_t processed_at = 0;
  if (now_ticks == processed_at) {
    return;
  }
  processed_at = now_ticks;
  std::deque<PendingSnapshot> &queue = snapshot_queue();
  if (queue.empty()) {
    return;
  }
  const PendingSnapshot pending = queue.front();
  queue.pop_front();
  snapshot_queued().erase(pending.key);
  skins::RenderedSkin rendered;
  skins::render_skin_snapshot(pending.options, pending.public_root, rendered);
}

class SnapshotElement final : public Element {
public:
  std::string_view tag() const override { return "skinmodel"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    measured_.width = style_.width.value_or(90.0F);
    measured_.height = style_.height.value_or(120.0F);
  }

  bool tick(std::uint64_t now_ticks) override {
    process_pending_snapshots(now_ticks);
    return false;
  }

  void render(RenderContext &context, const TextStyle &) const override {
    if (!style_.visible) {
      return;
    }
    SdlRenderer *sdl = dynamic_cast<SdlRenderer *>(&context);
    if (sdl == nullptr) {
      return;
    }
    const int width = std::max(
        24, static_cast<int>(std::lround(std::max(0.0F, bounds_.width))));
    const int height = std::max(
        24, static_cast<int>(std::lround(std::max(0.0F, bounds_.height))));
    const std::string source = attribute("src");
    const bool slim = attribute("slim") == "true";
    const std::string cape = attribute("cape");
    const std::string kind = attribute("kind");
    const bool head = kind == "head";
    const bool cape_only = kind == "cape";
    const std::string key = source + '\0' + (slim ? "s" : "w") + '\0' + cape +
                            '\0' + std::to_string(width) + '\0' +
                            std::to_string(height) + '\0' +
                            (head ? "h" : (cape_only ? "c" : "f"));
    if (key != key_ || texture_ == nullptr) {
      key_ = key;
      if (texture_ != nullptr) {
        SDL_DestroyTexture(texture_);
        texture_ = nullptr;
      }
      skins::SnapshotOptions options;
      options.src = source;
      options.slim = slim;
      options.cape = cape;
      options.width = width;
      options.height = height;
      options.head_only = head;
      options.cape_only = cape_only;
      skins::RenderedSkin rendered;
      if (skins::render_skin_snapshot(options, sdl->public_root(), rendered) &&
          rendered.width == width && rendered.height == height) {
        texture_ = ensure_texture(sdl->handle(), texture_, width, height);
        upload_rgba(texture_, width, rendered.rgba.data());
      } else {
        queue_snapshot(key, sdl->public_root(), options);
      }
    }
    if (texture_ != nullptr) {
      context.draw_texture(texture_, bounds_, style_.opacity);
    }
  }

private:
  mutable SDL_Texture *texture_ = nullptr;
  mutable std::string key_;
};

class ModelElement final : public Element {
public:
  ModelElement() { set_interactive(true); }
  std::string_view tag() const override { return "skinpreview"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    measured_.width = style_.width.value_or(200.0F);
    measured_.height = style_.height.value_or(400.0F);
  }

  bool tick(uint64_t) override {
    if (kind_ == "static") {
      return false;
    }
    float mouse_x = 0.0F;
    float mouse_y = 0.0F;
    const bool pressed =
        (SDL_GetMouseState(&mouse_x, &mouse_y) & SDL_BUTTON_LMASK) != 0;
    if (!grabbed_ && pressed && is_hovered()) {
      grabbed_ = true;
      last_mouse_x_ = mouse_x;
      last_mouse_y_ = mouse_y;
    } else if (grabbed_ && pressed) {
      const float dx = mouse_x - last_mouse_x_;
      const float dy = mouse_y - last_mouse_y_;
      last_mouse_x_ = mouse_x;
      last_mouse_y_ = mouse_y;
      if (dx != 0.0F || dy != 0.0F) {
        const float rotation_y = model_.rotation_y() + dx * 0.01F;
        const float rotation_x = clamp_x_ < 0.0F
                                     ? model_.rotation_x() + dy * 0.01F
                                     : std::clamp(model_.rotation_x() + dy * 0.01F,
                                                  -clamp_x_, clamp_x_);
        model_.set_rotation(rotation_y, rotation_x);
        dirty_ = true;
      }
    } else if (!pressed) {
      grabbed_ = false;
    }
    return false;
  }

  void on_wheel(float delta) override {
    if (attribute("zoom") != "true") {
      return;
    }
    const float z = std::clamp(model_.camera_z() - delta * 5.0F, 40.0F, 120.0F);
    if (z != model_.camera_z()) {
      model_.set_camera_z(z);
      dirty_ = true;
    }
  }

  void render(RenderContext &context, const TextStyle &) const override {
    if (!style_.visible) {
      return;
    }
    SdlRenderer *sdl = dynamic_cast<SdlRenderer *>(&context);
    if (sdl == nullptr) {
      return;
    }
    const std::string source = attribute("src");
    const bool slim = attribute("slim") == "true";
    const std::string cape = attribute("cape");
    const bool ears = attribute("ears") == "true";
    const bool flip = attribute("flip") == "true";
    const std::string kind = attribute("kind");
    if (kind != kind_ || source != source_ || slim != slim_ ||
        cape != cape_) {
      kind_ = kind;
      source_ = source;
      slim_ = slim;
      cape_ = cape;
      clamp_x_ = kind == "viewer" || kind == "cape"
                     ? 0.0F
                     : (kind == "editor" ? -1.0F : 0.6F);
      if (kind == "cape") {
        model_.load(source, slim, source, sdl->public_root(),
                    skins::ModelStyle::CapeOnly, true);
      } else if (kind == "editor") {
        const skins::SkinUiState &state = skins::SkinUiState::instance();
        if (!state.canvas.pixels.empty()) {
          model_.load_from_images(state.canvas, std::nullopt, slim,
                                  skins::ModelStyle::Editor, false);
          serial_ = state.canvas_serial;
        }
      } else {
        model_.load(source, slim, cape, sdl->public_root(),
                    skins::ModelStyle::Viewer, false);
      }
      dirty_ = true;
    }
    if (kind_ == "editor") {
      const skins::SkinUiState &state = skins::SkinUiState::instance();
      if (state.canvas_serial != serial_ && !state.canvas.pixels.empty()) {
        serial_ = state.canvas_serial;
        model_.load_from_images(state.canvas, std::nullopt, slim_,
                                skins::ModelStyle::Editor, false);
        dirty_ = true;
      }
    }
    model_.set_ears_visible(ears);
    model_.set_flip(flip);
    const int width = std::max(
        24, static_cast<int>(std::lround(std::max(0.0F, bounds_.width))));
    const int height = std::max(
        24, static_cast<int>(std::lround(std::max(0.0F, bounds_.height))));
    texture_ = ensure_texture(sdl->handle(), texture_, width, height);
    if (texture_ != nullptr && dirty_) {
      const skins::RenderedSkin rendered = model_.render(width, height);
      upload_rgba(texture_, rendered.width, rendered.rgba.data());
      dirty_ = false;
    }
    if (texture_ != nullptr) {
      context.draw_texture(texture_, bounds_, style_.opacity);
    }
  }

private:
  mutable skins::LiveSkinModel model_;
  mutable SDL_Texture *texture_ = nullptr;
  mutable std::string kind_;
  mutable std::string source_;
  mutable bool slim_ = false;
  mutable std::string cape_;
  mutable std::uint64_t serial_ = 0;
  mutable float clamp_x_ = 0.6F;
  mutable bool dirty_ = true;
  mutable bool grabbed_ = false;
  mutable float last_mouse_x_ = 0.0F;
  mutable float last_mouse_y_ = 0.0F;
};

class EditCanvasElement final : public Element {
public:
  EditCanvasElement() { set_interactive(true); }
  std::string_view tag() const override { return "skinedit"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    const skins::SkinUiState &state = skins::SkinUiState::instance();
    const float scale = std::max(1.0F, parse_scale());
    const int width =
        state.canvas.width > 0 ? state.canvas.width : 64;
    const int height =
        state.canvas.height > 0 ? state.canvas.height : 64;
    measured_.width = static_cast<float>(width) * scale;
    measured_.height = static_cast<float>(height) * scale;
  }

  bool tick(uint64_t) override {
    skins::SkinUiState &state = skins::SkinUiState::instance();
    if (!state.canvas_loaded || state.canvas.width == 0 ||
        state.canvas.height == 0) {
      grabbed_ = false;
      return false;
    }
    const MousePoint point = last_logical_mouse();
    if (!point.valid) {
      return false;
    }
    float mouse_x = 0.0F;
    float mouse_y = 0.0F;
    const bool pressed =
        (SDL_GetMouseState(&mouse_x, &mouse_y) & SDL_BUTTON_LMASK) != 0;
    const bool inside = bounds_contains(bounds_, point);
    if (!grabbed_ && pressed && inside) {
      grabbed_ = true;
      applied_on_grab_ = false;
      state.push_undo();
      last_x_ = -1;
      last_y_ = -1;
    }
    if (grabbed_ && pressed && inside) {
      const int pixel_x = std::clamp(
          static_cast<int>((point.x - bounds_.x) / bounds_.width *
                           static_cast<float>(state.canvas.width)),
          0, state.canvas.width - 1);
      const int pixel_y = std::clamp(
          static_cast<int>((point.y - bounds_.y) / bounds_.height *
                           static_cast<float>(state.canvas.height)),
          0, state.canvas.height - 1);
      const bool drag_tool = state.tool == skins::EditorTool::Pencil ||
                             state.tool == skins::EditorTool::Eraser;
      if (drag_tool) {
        if (last_x_ < 0) {
          state.apply_tool(pixel_x, pixel_y);
        } else {
          paint_line(state, last_x_, last_y_, pixel_x, pixel_y);
        }
        last_x_ = pixel_x;
        last_y_ = pixel_y;
      } else if (!applied_on_grab_) {
        state.apply_tool(pixel_x, pixel_y);
        applied_on_grab_ = true;
      }
    }
    if (!pressed) {
      grabbed_ = false;
    }
    return false;
  }

  void render(RenderContext &context, const TextStyle &) const override {
    if (!style_.visible) {
      return;
    }
    SdlRenderer *sdl = dynamic_cast<SdlRenderer *>(&context);
    if (sdl == nullptr) {
      return;
    }
    const skins::SkinUiState &state = skins::SkinUiState::instance();
    const float scale = std::max(1.0F, parse_scale());
    const int width =
        state.canvas.width > 0 ? state.canvas.width : 64;
    const int height =
        state.canvas.height > 0 ? state.canvas.height : 64;
    const int pixel_width =
        std::max(16, static_cast<int>(std::lround(
                         static_cast<float>(width) * scale)));
    const int pixel_height =
        std::max(16, static_cast<int>(std::lround(
                         static_cast<float>(height) * scale)));
    const std::string checker_key =
        std::to_string(pixel_width) + "x" + std::to_string(pixel_height);
    if (checker_key != checker_key_ || checker_ == nullptr) {
      checker_ = ensure_texture(sdl->handle(), checker_, pixel_width,
                                pixel_height);
      if (checker_ != nullptr) {
        std::vector<std::uint8_t> pixels(
            static_cast<std::size_t>(pixel_width) *
            static_cast<std::size_t>(pixel_height) * 4);
        for (int y = 0; y < pixel_height; ++y) {
          for (int x = 0; x < pixel_width; ++x) {
            const bool light = ((x / 8) + (y / 8)) % 2 == 0;
            const std::uint8_t value = light ? 42 : 26;
            const std::size_t index =
                (static_cast<std::size_t>(y) * pixel_width +
                 static_cast<std::size_t>(x)) *
                4;
            pixels[index] = value;
            pixels[index + 1] = value;
            pixels[index + 2] = value;
            pixels[index + 3] = 255;
          }
        }
        upload_rgba(checker_, pixel_width, pixels.data());
      }
      checker_key_ = checker_key;
    }
    const std::string skin_key = checker_key + '#' +
                                 std::to_string(state.canvas_serial);
    if (skin_key != skin_key_ || skin_ == nullptr) {
      skin_ = ensure_texture(sdl->handle(), skin_, width, height);
      if (skin_ != nullptr && !state.canvas.pixels.empty()) {
        upload_rgba(skin_, width, state.canvas.pixels.data());
      }
      skin_key_ = skin_key;
    }
    context.draw_texture(checker_, bounds_, 1.0F);
    if (skin_ != nullptr) {
      context.draw_texture(skin_, bounds_, 1.0F);
    }
    if (state.grid) {
      const Color line{255, 255, 255, 46};
      const float step = scale;
      for (int i = 1; i < width; ++i) {
        const float x = bounds_.x + static_cast<float>(i) * step;
        context.fill_rect({x, bounds_.y, 1.0F, bounds_.height}, line);
      }
      for (int i = 1; i < height; ++i) {
        const float y = bounds_.y + static_cast<float>(i) * step;
        context.fill_rect({bounds_.x, y, bounds_.width, 1.0F}, line);
      }
    }
  }

private:
  float parse_scale() const {
    const std::string &value = attribute("scale");
    if (value.empty()) {
      return 8.0F;
    }
    return std::max(1.0F, static_cast<float>(std::atoi(value.c_str())));
  }

  void paint_line(skins::SkinUiState &state, int x0, int y0, int x1,
                  int y1) const {
    const bool erase = state.tool == skins::EditorTool::Eraser;
    int x = x0;
    int y = y0;
    const int dx = std::abs(x1 - x0);
    const int dy = -std::abs(y1 - y0);
    const int sx = x0 < x1 ? 1 : -1;
    const int sy = y0 < y1 ? 1 : -1;
    int error = dx + dy;
    while (true) {
      state.paint_pixel(x, y, erase);
      if (x == x1 && y == y1) {
        break;
      }
      const int twice = error * 2;
      if (twice >= dy) {
        error += dy;
        x += sx;
      }
      if (twice <= dx) {
        error += dx;
        y += sy;
      }
    }
  }

  mutable SDL_Texture *checker_ = nullptr;
  mutable SDL_Texture *skin_ = nullptr;
  mutable std::string checker_key_;
  mutable std::string skin_key_;
  mutable bool grabbed_ = false;
  mutable bool applied_on_grab_ = false;
  mutable int last_x_ = -1;
  mutable int last_y_ = -1;
};

class SatValElement final : public Element {
public:
  SatValElement() { set_interactive(true); }
  std::string_view tag() const override { return "skinpicksv"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    measured_.width = style_.width.value_or(180.0F);
    measured_.height = style_.height.value_or(180.0F);
  }

  bool tick(uint64_t) override {
    const MousePoint point = last_logical_mouse();
    if (!point.valid) {
      return false;
    }
    float mouse_x = 0.0F;
    float mouse_y = 0.0F;
    const bool pressed =
        (SDL_GetMouseState(&mouse_x, &mouse_y) & SDL_BUTTON_LMASK) != 0;
    const bool inside = bounds_contains(bounds_, point);
    if (!grabbed_ && pressed && inside) {
      grabbed_ = true;
    }
    if (grabbed_ && pressed && inside) {
      skins::SkinUiState &state = skins::SkinUiState::instance();
      state.hsv_s = std::clamp(
          (point.x - bounds_.x) / std::max(1.0F, bounds_.width), 0.0F, 1.0F);
      state.hsv_v = 1.0F - std::clamp(
          (point.y - bounds_.y) / std::max(1.0F, bounds_.height), 0.0F, 1.0F);
      const skins::PixelColor color =
          hsv_to_rgb(state.hsv_h, state.hsv_s, state.hsv_v);
      state.set_color_rgb(color.r, color.g, color.b);
    }
    if (!pressed) {
      grabbed_ = false;
    }
    return false;
  }

  void render(RenderContext &context, const TextStyle &) const override {
    if (!style_.visible) {
      return;
    }
    SdlRenderer *sdl = dynamic_cast<SdlRenderer *>(&context);
    if (sdl == nullptr) {
      return;
    }
    const skins::SkinUiState &state = skins::SkinUiState::instance();
    if (hue_key_ != state.hsv_h || gradient_ == nullptr) {
      gradient_ = ensure_texture(sdl->handle(), gradient_, 256, 256);
      if (gradient_ != nullptr) {
        std::vector<std::uint8_t> pixels(256 * 256 * 4);
        for (int y = 0; y < 256; ++y) {
          const float v = 1.0F - static_cast<float>(y) / 255.0F;
          for (int x = 0; x < 256; ++x) {
            const float s = static_cast<float>(x) / 255.0F;
            const skins::PixelColor color = hsv_to_rgb(state.hsv_h, s, v);
            const std::size_t index =
                (static_cast<std::size_t>(y) * 256 + static_cast<std::size_t>(x)) *
                4;
            pixels[index] = color.r;
            pixels[index + 1] = color.g;
            pixels[index + 2] = color.b;
            pixels[index + 3] = 255;
          }
        }
        upload_rgba(gradient_, 256, pixels.data());
      }
      hue_key_ = state.hsv_h;
    }
    if (gradient_ != nullptr) {
      context.draw_texture(gradient_, bounds_, 1.0F);
    }
    const float cursor_x =
        bounds_.x + state.hsv_s * std::max(1.0F, bounds_.width);
    const float cursor_y =
        bounds_.y + (1.0F - state.hsv_v) * std::max(1.0F, bounds_.height);
    draw_ring(context, cursor_x, cursor_y, 6.0F);
  }

private:
  mutable SDL_Texture *gradient_ = nullptr;
  mutable float hue_key_ = -1.0F;
  mutable bool grabbed_ = false;
};

class HueElement final : public Element {
public:
  HueElement() { set_interactive(true); }
  std::string_view tag() const override { return "skinpickhue"; }
  void measure(const MeasureContext &, const TextStyle &) override {
    measured_.width = style_.width.value_or(180.0F);
    measured_.height = style_.height.value_or(14.0F);
  }

  bool tick(uint64_t) override {
    const MousePoint point = last_logical_mouse();
    if (!point.valid) {
      return false;
    }
    float mouse_x = 0.0F;
    float mouse_y = 0.0F;
    const bool pressed =
        (SDL_GetMouseState(&mouse_x, &mouse_y) & SDL_BUTTON_LMASK) != 0;
    const bool inside = bounds_contains(bounds_, point);
    if (!grabbed_ && pressed && inside) {
      grabbed_ = true;
    }
    if (grabbed_ && pressed && inside) {
      skins::SkinUiState &state = skins::SkinUiState::instance();
      state.hsv_h = std::clamp(
          (point.x - bounds_.x) / std::max(1.0F, bounds_.width), 0.0F, 0.9999F);
      const skins::PixelColor color =
          hsv_to_rgb(state.hsv_h, state.hsv_s, state.hsv_v);
      state.set_color_rgb(color.r, color.g, color.b);
    }
    if (!pressed) {
      grabbed_ = false;
    }
    return false;
  }

  void render(RenderContext &context, const TextStyle &) const override {
    if (!style_.visible) {
      return;
    }
    SdlRenderer *sdl = dynamic_cast<SdlRenderer *>(&context);
    if (sdl == nullptr) {
      return;
    }
    if (bar_ == nullptr) {
      bar_ = ensure_texture(sdl->handle(), bar_, 256, 16);
      if (bar_ != nullptr) {
        std::vector<std::uint8_t> pixels(256 * 16 * 4);
        for (int y = 0; y < 16; ++y) {
          for (int x = 0; x < 256; ++x) {
            const skins::PixelColor color =
                hsv_to_rgb(static_cast<float>(x) / 256.0F, 1.0F, 1.0F);
            const std::size_t index =
                (static_cast<std::size_t>(y) * 256 + static_cast<std::size_t>(x)) *
                4;
            pixels[index] = color.r;
            pixels[index + 1] = color.g;
            pixels[index + 2] = color.b;
            pixels[index + 3] = 255;
          }
        }
        upload_rgba(bar_, 16, pixels.data());
      }
    }
    if (bar_ != nullptr) {
      context.draw_texture(bar_, bounds_, 1.0F);
    }
    const float cursor_x =
        bounds_.x + skins::SkinUiState::instance().hsv_h *
                        std::max(1.0F, bounds_.width);
    draw_ring(context, cursor_x, bounds_.y + bounds_.height * 0.5F, 5.0F);
  }

private:
  mutable SDL_Texture *bar_ = nullptr;
  mutable bool grabbed_ = false;
};

} // namespace

void note_logical_mouse(float x, float y) {
  g_logical_mouse.x = x;
  g_logical_mouse.y = y;
  g_logical_mouse.valid = true;
}

MousePoint last_logical_mouse() { return g_logical_mouse; }
std::string truncate_middle(const std::string &value, std::size_t limit) {
  if (value.size() <= limit) {
    return value;
  }
  if (limit < 8) {
    return value.substr(0, limit);
  }
  const std::size_t head = (limit - 5) / 2 + 2;
  const std::size_t tail = limit - head - 1;
  return value.substr(0, head) + "\xE2\x80\xA6" + value.substr(value.size() - tail);
}

void register_skin_elements() {
  ElementRegistry &registry = ElementRegistry::instance();
  registry.register_element(
      "skinmodel", [] { return std::make_unique<SnapshotElement>(); });
  registry.register_element(
      "skinpreview", [] { return std::make_unique<ModelElement>(); });
  registry.register_element(
      "skinedit", [] { return std::make_unique<EditCanvasElement>(); });
  registry.register_element(
      "skinpicksv", [] { return std::make_unique<SatValElement>(); });
  registry.register_element(
      "skinpickhue", [] { return std::make_unique<HueElement>(); });
}
} // namespace emerald::ui
