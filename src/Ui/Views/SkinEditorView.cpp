#include "Ui/Views/SkinEditorView.hpp"
#include "Audio/AudioEngine.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/I18n.hpp"
#include <algorithm>
#include <array>
#include <cctype>
#include <cmath>
#include <cstdio>
namespace emerald::ui {
namespace {
std::string translate(const UiServices &services, const char *key,
                      const std::string &fallback) {
  return services.i18n != nullptr ? services.i18n->translate(key) : fallback;
}

const std::array<const char *, 24> kDyeColors = {
    "F9FFFE", "9D9D97", "474F52", "1D1D21", "835432", "B02E26", "F9801D",
    "FED83D", "80C71F", "5E7C16", "169C9C", "3AB3DA", "3C44AA", "8932B8",
    "C74EBD", "F38BAA", "FFE0BD", "E0AC69", "C68642", "8D5524", "5C3317",
    "B5804A", "3C8C8F", "4C4C4C"};

std::string to_hex(std::uint8_t value) {
  static constexpr char digits[] = "0123456789ABCDEF";
  std::string out;
  out.push_back(digits[value >> 4]);
  out.push_back(digits[value & 0x0F]);
  return out;
}

int hex_value(char character) {
  if (character >= '0' && character <= '9') {
    return character - '0';
  }
  if (character >= 'a' && character <= 'f') {
    return character - 'a' + 10;
  }
  if (character >= 'A' && character <= 'F') {
    return character - 'A' + 10;
  }
  return -1;
}

int slider_value(int channel) {
  return std::clamp(static_cast<int>(std::lround(channel / 2.55F)), 0, 100);
}

std::string active_skin_url(const config::AppConfig &config) {
  if (config.skin_base64.has_value() && !config.skin_base64->empty()) {
    return "data:image/png;base64," + *config.skin_base64;
  }
  return config.skin_source.value_or("/images/Default.png");
}
} // namespace

Json SkinEditorView::data(const UiServices &services) const {
  Json data = Json::object();
  const config::AppConfig *config =
      services.config != nullptr ? &services.config->data() : nullptr;
  skins::SkinUiState &state = skins::SkinUiState::instance();
  state.load_editor_canvas(config != nullptr ? active_skin_url(*config)
                                             : std::string("/images/Default.png"),
                           services.public_root,
                           config != nullptr ? config->skin_slim.value_or(false)
                                             : false);

  data["colorStyle"] =
      "background:#" + to_hex(state.paint_r) + to_hex(state.paint_g) +
      to_hex(state.paint_b);
  data["colorAlpha"] = state.paint_alpha;
  data["rValue"] = slider_value(state.paint_r);
  data["gValue"] = slider_value(state.paint_g);
  data["bValue"] = slider_value(state.paint_b);
  data["rLabel"] = "R " + std::to_string(state.paint_r);
  data["gLabel"] = "G " + std::to_string(state.paint_g);
  data["bLabel"] = "B " + std::to_string(state.paint_b);
  data["alphaValue"] = static_cast<int>(std::lround(state.paint_alpha * 100.0F));
  data["alphaLabel"] =
      translate(services, "skinEditor.alpha", "Alpha") + " " +
      std::to_string(static_cast<int>(std::lround(state.paint_alpha * 100.0F))) +
      "%";
  data["hexValue"] =
      to_hex(state.paint_r) + to_hex(state.paint_g) + to_hex(state.paint_b);
  data["pickerOpen"] = state.show_picker;
  const std::string selected =
      to_hex(state.paint_r) + to_hex(state.paint_g) + to_hex(state.paint_b);
  std::vector<Json> rows;
  for (int row = 0; row < 3; ++row) {
    Json entry = Json::object();
    for (int column = 0; column < 8; ++column) {
      const std::string hex = kDyeColors[static_cast<std::size_t>(row) * 8 +
                                         static_cast<std::size_t>(column)];
      const bool active = hex == selected;
      Json swatch = Json::object();
      swatch["hex"] = hex;
      swatch["bg"] = active ? std::string("#FFFF55") : "#" + hex;
      swatch["swatch"] = "#" + hex;
      entry["c" + std::to_string(column)] = swatch;
    }
    rows.push_back(entry);
  }
  data["dyeRows"] = rows;
  data["toolPencilClass"] =
      state.tool == skins::EditorTool::Pencil ? "editor-tool-active" : "";
  data["toolEraserClass"] =
      state.tool == skins::EditorTool::Eraser ? "editor-tool-active" : "";
  data["toolPickClass"] =
      state.tool == skins::EditorTool::Eyedropper ? "editor-tool-active" : "";
  data["toolFillClass"] =
      state.tool == skins::EditorTool::Fill ? "editor-tool-active" : "";
  data["slim"] = state.slim;
  data["slimLabel"] =
      translate(services, state.slim ? "skinEditor.alex" : "skinEditor.steve",
                state.slim ? "Alex" : "Steve");
  data["slimClass"] = state.slim ? "editor-tool-active" : "";
  data["gridLabel"] = translate(services, "skinEditor.grid", "Grid");
  data["gridClass"] = state.grid ? "editor-tool-active" : "";
  data["undoLabel"] = translate(services, "skinEditor.undo", "Undo");
  return data;
}

bool SkinEditorView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }
  const std::string handler(name);
  const std::size_t colon = handler.find(':');
  const std::string verb =
      colon == std::string::npos ? handler : handler.substr(0, colon);
  const std::string argument =
      colon == std::string::npos ? std::string() : handler.substr(colon + 1);
  skins::SkinUiState &state = skins::SkinUiState::instance();
  if (verb == "skineditor.tool") {
    if (argument == "pencil") {
      state.tool = skins::EditorTool::Pencil;
    } else if (argument == "eraser") {
      state.tool = skins::EditorTool::Eraser;
    } else if (argument == "pick") {
      state.tool = skins::EditorTool::Eyedropper;
    } else if (argument == "fill") {
      state.tool = skins::EditorTool::Fill;
    }
    return true;
  }
  if (verb == "skineditor.picker") {
    state.show_picker = !state.show_picker;
    return true;
  }
  if (verb == "skineditor.r" || verb == "skineditor.g" ||
      verb == "skineditor.b") {
    const int value = std::clamp(std::atoi(argument.c_str()), 0, 100);
    const int channel = static_cast<int>(std::lround(value * 2.55F));
    if (verb == "skineditor.r") {
      state.set_color_rgb(static_cast<std::uint8_t>(channel), state.paint_g,
                          state.paint_b);
    } else if (verb == "skineditor.g") {
      state.set_color_rgb(state.paint_r, static_cast<std::uint8_t>(channel),
                          state.paint_b);
    } else {
      state.set_color_rgb(state.paint_r, state.paint_g,
                          static_cast<std::uint8_t>(channel));
    }
    return true;
  }
  if (verb == "skineditor.alpha") {
    const int value = std::clamp(std::atoi(argument.c_str()), 0, 100);
    state.paint_alpha = static_cast<float>(value) / 100.0F;
    return true;
  }
  if (verb == "skineditor.dye") {
    if (argument.size() >= 6) {
      const int r = hex_value(argument[0]) * 16 + hex_value(argument[1]);
      const int g = hex_value(argument[2]) * 16 + hex_value(argument[3]);
      const int b = hex_value(argument[4]) * 16 + hex_value(argument[5]);
      if (r >= 0 && g >= 0 && b >= 0) {
        state.set_color_rgb(static_cast<std::uint8_t>(r),
                            static_cast<std::uint8_t>(g),
                            static_cast<std::uint8_t>(b));
      }
    }
    return true;
  }
  if (verb == "skineditor.hex") {
    std::string text = services.read_text_input();
    if (!text.empty() && text.front() == '#') {
      text.erase(text.begin());
    }
    if (text.size() >= 6) {
      const int r = hex_value(text[0]) * 16 + hex_value(text[1]);
      const int g = hex_value(text[2]) * 16 + hex_value(text[3]);
      const int b = hex_value(text[4]) * 16 + hex_value(text[5]);
      if (r >= 0 && g >= 0 && b >= 0) {
        state.set_color_rgb(static_cast<std::uint8_t>(r),
                            static_cast<std::uint8_t>(g),
                            static_cast<std::uint8_t>(b));
      }
    }
    return true;
  }
  if (verb == "skineditor.undo") {
    state.undo();
    return true;
  }
  if (verb == "skineditor.slim") {
    state.slim = !state.slim;
    return true;
  }
  if (verb == "skineditor.grid") {
    state.grid = !state.grid;
    return true;
  }
  if (verb == "skineditor.save") {
    state.save_editor(*services.config, services.public_root,
                      translate(services, "skinEditor.customSkin",
                                "Custom Skin"));
    leave(services);
    if (services.navigate != nullptr) {
      services.navigate("skins");
    }
    return true;
  }
  if (verb == "skineditor.export") {
    std::string safe;
    for (const char character : services.config->data().username) {
      if (std::isalnum(static_cast<unsigned char>(character)) ||
          character == '_' || character == '-') {
        safe.push_back(character);
      }
    }
    state.open_export_dialog(safe.empty() ? std::string("skin") : safe);
    return true;
  }
  if (verb == "skineditor.back") {
    leave(services);
    if (services.navigate != nullptr) {
      services.navigate("skins");
    }
    return true;
  }
  return false;
}

bool SkinEditorView::on_escape(UiServices &services) {
  skins::SkinUiState &state = skins::SkinUiState::instance();
  if (state.show_picker) {
    state.show_picker = false;
    return true;
  }
  if (services.audio != nullptr) {
    services.audio->play_back();
  }
  leave(services);
  if (services.navigate != nullptr) {
    services.navigate("skins");
  }
  return true;
}

void SkinEditorView::leave(UiServices &services) const {
  (void)services;
  skins::SkinUiState &state = skins::SkinUiState::instance();
  state.show_picker = false;
  state.canvas_loaded = false;
}
} // namespace emerald::ui
