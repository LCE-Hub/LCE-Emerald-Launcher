#include "Skins/SkinUiState.hpp"
#include "Config/ConfigStore.hpp"
#include "Core/Paths.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iterator>
namespace emerald::skins {
namespace {
std::int64_t now_ms() {
  const std::chrono::milliseconds since_epoch =
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now().time_since_epoch());
  return since_epoch.count();
}

void rgb_to_hsv(float r, float g, float b, float &h_out, float &s_out,
                float &v_out) {
  r /= 255.0F;
  g /= 255.0F;
  b /= 255.0F;
  const float max_value = std::max({r, g, b});
  const float min_value = std::min({r, g, b});
  const float delta = max_value - min_value;
  v_out = max_value;
  s_out = max_value <= 0.0F ? 0.0F : delta / max_value;
  if (delta <= 0.0F) {
    h_out = 0.0F;
    return;
  }
  float h = 0.0F;
  if (max_value == r) {
    h = (g - b) / delta + (g < b ? 6.0F : 0.0F);
  } else if (max_value == g) {
    h = (b - r) / delta + 2.0F;
  } else {
    h = (r - g) / delta + 4.0F;
  }
  h_out = h / 6.0F;
}
} // namespace

SkinUiState &SkinUiState::instance() {
  static SkinUiState state;
  return state;
}

void SkinUiState::reset_import() {
  import_open = false;
  import_mode.clear();
  username_draft.clear();
  import_error.clear();
  pending_skin.reset();
}

void SkinUiState::process_import(const std::string &url,
                                 const std::string &name) {
  pending_skin = PendingSkin{url, name.substr(0, 16)};
  import_mode = "model";
}

void SkinUiState::finalize_import(config::ConfigStore &config,
                                  const std::filesystem::path &public_root,
                                  bool is_slim) {
  if (!pending_skin.has_value()) {
    return;
  }
  const std::optional<RgbaImage> image =
      load_skin_source(pending_skin->url, public_root);
  if (!image.has_value()) {
    reset_import();
    return;
  }
  const std::optional<std::vector<std::uint8_t>> encoded =
      reencode_png(*image);
  if (!encoded.has_value()) {
    reset_import();
    return;
  }
  const std::optional<std::string> base64 =
      base64_encode(encoded->data(), encoded->size());
  if (!base64.has_value()) {
    reset_import();
    return;
  }
  const std::string data_url = "data:image/png;base64," + *base64;
  const std::string new_id = std::to_string(now_ms());
  auto &skins = config.data().custom_skins;
  if (!skins.has_value()) {
    skins = std::vector<config::SavedSkin>{};
  }
  const std::string name = pending_skin->name;
  skins->push_back(config::SavedSkin{new_id, name, data_url, is_slim});
  config.data().skin_source = data_url;
  config.data().skin_base64.reset();
  config.data().skin_slim = is_slim;
  sync_needed = true;
  config.save();
  reset_import();
}

PixelColor SkinUiState::paint_color() const {
  return PixelColor{paint_r, paint_g, paint_b,
                    static_cast<std::uint8_t>(std::clamp(
                        std::round(paint_alpha * 255.0F), 0.0F, 255.0F))};
}

void SkinUiState::set_color_rgb(std::uint8_t r, std::uint8_t g,
                                std::uint8_t b) {
  paint_r = r;
  paint_g = g;
  paint_b = b;
  rgb_to_hsv(static_cast<float>(r), static_cast<float>(g),
             static_cast<float>(b), hsv_h, hsv_s, hsv_v);
}

void SkinUiState::load_editor_canvas(const std::string &source,
                                     const std::filesystem::path &public_root,
                                     bool is_slim) {
  slim = is_slim;
  if (canvas_loaded && edited_source == source && !canvas.pixels.empty()) {
    return;
  }
  const std::optional<RgbaImage> image =
      load_skin_source(source.empty() ? "/images/Default.png" : source,
                       public_root);
  undo_stack.clear();
  if (!image.has_value() || image->width == 0 || image->height == 0) {
    canvas = RgbaImage{64, 32, std::vector<std::uint8_t>(64 * 32 * 4, 0)};
    canvas_loaded = true;
    edited_source = source;
    return;
  }
  if (image->height == 32) {
    canvas = *image;
  } else {
    canvas = RgbaImage{64, 64, std::vector<std::uint8_t>(64 * 64 * 4, 0)};
    const int copy_width = std::min(64, image->width);
    const int copy_height = std::min(64, image->height);
    for (int y = 0; y < copy_height; ++y) {
      for (int x = 0; x < copy_width; ++x) {
        const std::size_t source_index =
            (static_cast<std::size_t>(y) * image->width +
             static_cast<std::size_t>(x)) * 4;
        const std::size_t target_index =
            (static_cast<std::size_t>(y) * 64 + static_cast<std::size_t>(x)) *
            4;
        for (int channel = 0; channel < 4; ++channel) {
          canvas.pixels[target_index + channel] =
              image->pixels[source_index + channel];
        }
      }
    }
  }
  canvas_loaded = true;
  edited_source = source;
  ++canvas_serial;
}

void SkinUiState::push_undo() {
  undo_stack.push_back(canvas);
  if (undo_stack.size() > 50) {
    undo_stack.erase(undo_stack.begin());
  }
}

bool SkinUiState::undo() {
  if (undo_stack.empty()) {
    return false;
  }
  canvas = undo_stack.back();
  undo_stack.pop_back();
  ++canvas_serial;
  return true;
}

void SkinUiState::paint_pixel(int x, int y, bool erase) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }
  const std::size_t index =
      (static_cast<std::size_t>(y) * canvas.width + static_cast<std::size_t>(x)) *
      4;
  if (erase) {
    for (int channel = 0; channel < 4; ++channel) {
      canvas.pixels[index + channel] = 0;
    }
    ++canvas_serial;
    return;
  }
  const PixelColor color = paint_color();
  canvas.pixels[index] = color.r;
  canvas.pixels[index + 1] = color.g;
  canvas.pixels[index + 2] = color.b;
  canvas.pixels[index + 3] = color.a;
  ++canvas_serial;
}

void SkinUiState::apply_tool(int x, int y) {
  switch (tool) {
  case EditorTool::Eyedropper: {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
      return;
    }
    const std::size_t index =
        (static_cast<std::size_t>(y) * canvas.width +
         static_cast<std::size_t>(x)) * 4;
    set_color_rgb(canvas.pixels[index], canvas.pixels[index + 1],
                  canvas.pixels[index + 2]);
    paint_alpha = canvas.pixels[index + 3] / 255.0F;
    ++canvas_serial;
    return;
  }
  case EditorTool::Fill: {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
      return;
    }
    const std::size_t base_index =
        (static_cast<std::size_t>(y) * canvas.width +
         static_cast<std::size_t>(x)) * 4;
    const std::uint8_t target_r = canvas.pixels[base_index];
    const std::uint8_t target_g = canvas.pixels[base_index + 1];
    const std::uint8_t target_b = canvas.pixels[base_index + 2];
    const std::uint8_t target_a = canvas.pixels[base_index + 3];
    const PixelColor color = paint_color();
    if (target_r == color.r && target_g == color.g && target_b == color.b &&
        target_a == color.a) {
      return;
    }
    std::vector<std::uint8_t> seen(static_cast<std::size_t>(canvas.width) *
                                   canvas.height);
    std::vector<std::pair<int, int>> stack;
    stack.reserve(64);
    stack.emplace_back(x, y);
    while (!stack.empty()) {
      const auto [px, py] = stack.back();
      stack.pop_back();
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
        continue;
      }
      const std::size_t seen_index = static_cast<std::size_t>(py) *
                                         static_cast<std::size_t>(canvas.width) +
                                     static_cast<std::size_t>(px);
      if (seen[seen_index] != 0) {
        continue;
      }
      const std::size_t index = seen_index * 4;
      if (canvas.pixels[index] != target_r ||
          canvas.pixels[index + 1] != target_g ||
          canvas.pixels[index + 2] != target_b ||
          canvas.pixels[index + 3] != target_a) {
        continue;
      }
      seen[seen_index] = 1;
      canvas.pixels[index] = color.r;
      canvas.pixels[index + 1] = color.g;
      canvas.pixels[index + 2] = color.b;
      canvas.pixels[index + 3] = color.a;
      ++canvas_serial;
      stack.emplace_back(px + 1, py);
      stack.emplace_back(px - 1, py);
      stack.emplace_back(px, py + 1);
      stack.emplace_back(px, py - 1);
    }
    return;
  }
  case EditorTool::Pencil:
    paint_pixel(x, y, false);
    return;
  case EditorTool::Eraser:
    paint_pixel(x, y, true);
    return;
  }
}

std::string
SkinUiState::save_editor(config::ConfigStore &config,
                         const std::filesystem::path &public_root,
                         const std::string &fallback_name) {
  const std::optional<std::vector<std::uint8_t>> encoded =
      reencode_png(canvas);
  if (!encoded.has_value()) {
    return edited_source;
  }
  const std::optional<std::string> base64 = base64_encode(
      encoded->data(), encoded->size());
  if (!base64.has_value()) {
    return edited_source;
  }
  const std::string data_url = "data:image/png;base64," + *base64;
  auto &skins = config.data().custom_skins;
  const std::string current = config.data().skin_source.value_or("");
  bool updated = false;
  if (skins.has_value()) {
    for (config::SavedSkin &skin : *skins) {
      if (skin.url == current && !current.empty()) {
        skin.url = data_url;
        skin.is_slim = slim;
        updated = true;
      }
    }
  }
  if (!updated) {
    if (!skins.has_value()) {
      skins = std::vector<config::SavedSkin>{};
    }
    const std::string new_id = std::to_string(now_ms());
    skins->push_back(config::SavedSkin{new_id, fallback_name, data_url, slim});
  }
  config.data().skin_source = data_url;
  config.data().skin_base64.reset();
  config.data().skin_slim = slim;
  sync_needed = true;
  config.save();
  edited_source = data_url;
  canvas_loaded = false;
  load_editor_canvas(data_url, public_root, slim);
  return data_url;
}

namespace {
void SDLCALL skin_open_callback(void *, const char *const *filelist, int) {
  if (filelist == nullptr) {
    return;
  }
  if (filelist[0] != nullptr) {
    SkinUiState::instance().picked_file = std::string(filelist[0]);
  }
}

void SDLCALL skin_save_callback(void *, const char *const *filelist, int) {
  if (filelist == nullptr) {
    return;
  }
  if (filelist[0] != nullptr) {
    SkinUiState::instance().save_path = std::string(filelist[0]);
  }
}
} // namespace

void SkinUiState::open_import_dialog() {
  SDL_DialogFileFilter filters[] = {{"PNG image", "png"}};
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  SDL_ShowOpenFileDialog(skin_open_callback, nullptr, window, filters, 1,
                         nullptr, false);
}

void SkinUiState::open_export_dialog(const std::string &name) {
  SDL_DialogFileFilter filters[] = {{"PNG image", "png"}};
  int count = 0;
  SDL_Window **windows = SDL_GetWindows(&count);
  SDL_Window *window = count > 0 ? windows[0] : nullptr;
  const std::filesystem::path default_path =
      core::app_data_dir() /
      (name.empty() ? std::string("skin.png") : name + ".png");
  SDL_ShowSaveFileDialog(skin_save_callback, nullptr, window, filters, 1,
                         default_path.string().c_str());
}

bool SkinUiState::consume_picks(config::ConfigStore &config,
                                const std::filesystem::path &public_root) {
  (void)public_root;
  bool changed = false;
  if (save_path.has_value()) {
    const std::string raw = *save_path;
    save_path.reset();
    if (!raw.empty()) {
      std::string path = raw;
      if (path.size() < 4 ||
          (path.compare(path.size() - 4, 4, ".png") != 0 &&
           path.compare(path.size() - 4, 4, ".PNG") != 0)) {
        path += ".png";
      }
      const std::optional<std::vector<std::uint8_t>> encoded =
          reencode_png(canvas);
      if (encoded.has_value()) {
        std::ofstream output(path, std::ios::binary);
        if (output.is_open()) {
          output.write(
              reinterpret_cast<const char *>(encoded->data()),
              static_cast<std::streamsize>(encoded->size()));
          changed = true;
        }
      }
    }
  }
  if (picked_file.has_value()) {
    const std::string path = *picked_file;
    picked_file.reset();
    if (!path.empty()) {
      std::ifstream input(path, std::ios::binary);
      std::vector<std::uint8_t> bytes(
          (std::istreambuf_iterator<char>(input)),
          std::istreambuf_iterator<char>());
      input.close();
      const std::optional<RgbaImage> decoded = decode_png_bytes(bytes);
      if (decoded.has_value()) {
        const std::optional<std::vector<std::uint8_t>> encoded =
            reencode_png(*decoded);
        if (encoded.has_value()) {
          const std::optional<std::string> base64 = base64_encode(
              encoded->data(), encoded->size());
          if (base64.has_value()) {
            const std::string data_url = "data:image/png;base64," + *base64;
            std::filesystem::path file_path(path);
            std::string stem = file_path.stem().string();
            if (stem.size() > 16) {
              stem = stem.substr(0, 16);
            }
            if (view_mode == "cape") {
              const std::string new_id = std::to_string(now_ms());
              auto &capes = config.data().custom_capes;
              if (!capes.has_value()) {
                capes = std::vector<config::SavedCape>{};
              }
              capes->push_back(config::SavedCape{new_id, stem, data_url});
              config.data().cape_source = data_url;
              config.data().cape_base64.reset();
              sync_needed = true;
              config.save();
            } else {
              process_import(data_url, stem);
            }
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}
} // namespace emerald::skins
