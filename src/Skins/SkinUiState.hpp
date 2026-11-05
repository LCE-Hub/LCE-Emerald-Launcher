#pragma once
#include "Skins/SkinAssets.hpp"
#include <cstdint>
#include <optional>
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::config {
class ConfigStore;
}
namespace emerald::skins {
enum class EditorTool { Pencil, Eraser, Eyedropper, Fill };
struct PendingSkin {
  std::string url;
  std::string name;
};

class SkinUiState {
public:
  static SkinUiState &instance();
  std::string view_mode = "skin";
  bool import_open = false;
  std::string import_mode;
  std::string username_draft;
  std::string import_error;
  bool importing = false;
  std::optional<PendingSkin> pending_skin;
  void reset_import();
  void process_import(const std::string &url, const std::string &name);
  void finalize_import(config::ConfigStore &config, const std::filesystem::path &public_root, bool slim);
  EditorTool tool = EditorTool::Pencil;
  std::uint8_t paint_r = 139;
  std::uint8_t paint_g = 139;
  std::uint8_t paint_b = 139;
  float paint_alpha = 1.0F;
  bool slim = false;
  bool grid = true;
  bool show_picker = false;
  float hsv_h = 0.0F;
  float hsv_s = 0.0F;
  float hsv_v = 0.545F;
  RgbaImage canvas;
  std::vector<RgbaImage> undo_stack;
  std::string edited_source;
  bool canvas_loaded = false;
  void load_editor_canvas(const std::string &source,
                          const std::filesystem::path &public_root, bool slim);
  void bump_canvas_serial() { ++canvas_serial; }
  std::uint64_t canvas_serial = 0;
  void push_undo();
  bool undo();
  void paint_pixel(int x, int y, bool erase);
  PixelColor paint_color() const;
  void set_color_rgb(std::uint8_t r, std::uint8_t g, std::uint8_t b);
  void apply_tool(int x, int y);
  std::string save_editor(config::ConfigStore &config,
                          const std::filesystem::path &public_root,
                          const std::string &fallback_name);

  std::optional<std::string> picked_file;
  std::optional<std::string> save_path;
  void open_import_dialog();
  void open_export_dialog(const std::string &name);
  bool consume_picks(config::ConfigStore &config,
                     const std::filesystem::path &public_root);

  bool sync_needed = false;
};
} // namespace emerald::skins
