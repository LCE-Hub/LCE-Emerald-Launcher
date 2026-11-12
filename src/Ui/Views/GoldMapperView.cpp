#include "Ui/Views/GoldMapperView.hpp"
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigSchema.hpp"
#include "Core/Log.hpp"
#include "Launch/GoldMapper.hpp"
#include "Ui/I18n.hpp"
#include <algorithm>
#include <cctype>
#include <filesystem>
#include <map>
#include <vector>
namespace emerald::ui {
namespace {
using config::GoldMapperMapping;
bool starts_with(std::string_view text,
                 std::string_view prefix) { // neo: i hate you c++.
  return text.substr(0, prefix.size()) == prefix;
}

std::string translate(const UiServices &services, const char *key,
                      const char *fallback) {
  return services.i18n != nullptr ? services.i18n->translate(key)
                                  : std::string(fallback);
}

std::string mouse_label(const UiServices &services, const std::string &id) {
  if (id == "MOUSE_LEFT") {
    return translate(services, "goldMapper.leftClick", "Left Click");
  }
  if (id == "MOUSE_MIDDLE") {
    return translate(services, "goldMapper.middleClick", "Middle Click");
  }
  return translate(services, "goldMapper.rightClick", "Right Click");
}

std::string display_name(const std::string &id) {
  std::string label = id;
  if (starts_with(label, "KEY_")) {
    label = label.substr(4);
  } else if (starts_with(label, "PAD_")) {
    label = label.substr(4);
  }
  for (char &character : label) {
    if (character == '_') {
      character = ' ';
    }
  }
  return label;
}

std::vector<std::string> keyboard_ids() {
  std::vector<std::string> ids;
  for (const GoldMapperMapping &mapping : launch::default_mappings()) {
    if (starts_with(mapping.from, "KEY_")) {
      ids.push_back(mapping.from);
    }
  }
  return ids;
}

std::map<std::string, std::string> load_binds(const config::AppConfig &config) {
  std::map<std::string, std::string> binds;
  if (!config.goldmapper_mappings.has_value()) {
    return binds;
  }
  for (const GoldMapperMapping &mapping : *config.goldmapper_mappings) {
    if (starts_with(mapping.from, "KEY_") ||
        starts_with(mapping.from, "MOUSE_") ||
        starts_with(mapping.from, "PAD_")) {
      binds[mapping.from] = mapping.to;
    }
  }
  return binds;
}

std::vector<GoldMapperMapping>
build_payload(const std::map<std::string, std::string> &binds) {
  const std::vector<std::string> MOUSE_IDS = {"MOUSE_LEFT", "MOUSE_MIDDLE",
                                              "MOUSE_RIGHT"};
  const std::vector<std::string> keys = keyboard_ids();
  std::vector<GoldMapperMapping> payload;
  for (const std::string &id : keys) {
    const auto found = binds.find(id);
    const std::string to = found != binds.end() ? found->second : id;
    if (to != id) {
      payload.push_back(GoldMapperMapping{id, to});
    }
  }
  for (const std::string &id : MOUSE_IDS) {
    const auto found = binds.find(id);
    const std::string to = found != binds.end() ? found->second : id;
    if (to != id) {
      payload.push_back(GoldMapperMapping{id, to});
    }
  }
  const std::vector<std::string> &targets = launch::controller_targets();
  for (std::size_t index = 0; index < targets.size(); ++index) {
    payload.push_back(
        GoldMapperMapping{"DINPUT_" + std::to_string(index), targets[index]});
  }
  return payload;
}

void save_mappings(UiServices &services,
                   std::map<std::string, std::string> binds) {
  if (services.config == nullptr) {
    return;
  }
  services.config->data().goldmapper_mappings = build_payload(binds);
  services.config->save();
  core::info("GoldMapper: config saved");
}

Json cell_json(const std::string &id, const std::string &label,
               const std::string &to, const std::string &source) {
  Json cell = Json::object();
  cell["label"] = label;
  cell["activeClass"] = to == source ? std::string("gm-cell-active") : "";
  cell["action"] = "goldmapper.pick:" + source + ":" + id;
  return cell;
}

std::string lowered(std::string text) {
  for (char &character : text) {
    character =
        static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  return text;
}

std::string tooltip_image(const std::filesystem::path &public_root,
                          const std::string &tooltip_set,
                          const std::string &value) {
  if (public_root.empty() || tooltip_set.empty() || value.empty()) {
    return "";
  }
  const std::filesystem::path directory =
      public_root / "images" / "tooltips" / tooltip_set;
  std::error_code error;
  std::filesystem::directory_iterator iterator(directory, error);
  if (error) {
    return "";
  }
  const std::string wanted = lowered(value) + ".png";
  for (const std::filesystem::directory_entry &entry : iterator) {
    if (lowered(entry.path().filename().string()) == wanted) {
      return "/images/tooltips/" + tooltip_set + "/" +
             entry.path().filename().string();
    }
  }
  return "";
}

Json bind_row(const std::string &id, const std::string &label,
              const std::map<std::string, std::string> &binds,
              const std::filesystem::path &public_root,
              const std::string &tooltip_set) {
  const auto found = binds.find(id);
  const std::string to = found != binds.end() ? found->second : id;
  const std::string value = display_name(to);
  Json row = Json::object();
  row["isBind"] = true;
  row["label"] = label;
  row["value"] = value;
  row["focusId"] = "gmbind:" + id;
  row["action"] = "goldmapper.open:" + id;
  const std::string image = tooltip_image(public_root, tooltip_set, value);
  if (!image.empty()) {
    row["image"] = image;
  } else {
    row["showText"] = true;
  }
  return row;
}

std::string replace_token(std::string text, const std::string &token,
                          const std::string &value) {
  const std::size_t position = text.find(token);
  if (position != std::string::npos) {
    text.replace(position, token.size(), value);
  }
  return text;
}

Json cell_group(const std::vector<Json> &cells) {
  Json group = Json::object();
  const char *slots[] = {"c0", "c1", "c2", "c3"};
  for (std::size_t index = 0; index < cells.size() && index < 4; ++index) {
    group[slots[index]] = cells[index];
  }
  return group;
}
} // namespace

void GoldMapperView::on_enter() {
  editing_.clear();
  key_buffer_.clear();
  key_error_.clear();
}

bool GoldMapperView::on_escape(UiServices &services) {
  if (!editing_.empty()) {
    close_modal(services);
    return true;
  }
  return false;
}

Json GoldMapperView::data(const UiServices &services) const {
  Json data = Json::object();
  if (services.config == nullptr) {
    return data;
  }
  const config::AppConfig &config = services.config->data();
  const std::map<std::string, std::string> binds = load_binds(config);
  const std::string tooltip_set =
      services.tooltip_set != nullptr ? services.tooltip_set() : "";
  auto reachable = [&](const std::string &id) -> std::string {
    const auto found = binds.find(id);
    return found != binds.end() ? found->second : id;
  };

  Json rows = Json::array();
  Json reset = Json::object();
  reset["isReset"] = true;
  reset["label"] =
      translate(services, "goldMapper.resetToDefaults", "Reset to Defaults");
  rows.push_back(std::move(reset));
  Json enable = Json::object();
  enable["isEnable"] = true;
  enable["checked"] = config.goldmapper_enabled.value_or(true);
  enable["label"] =
      translate(services, "goldMapper.enableGoldMapper", "Enable GoldMapper");
  rows.push_back(std::move(enable));
  rows.push_back(Json{
      {"isHeader", true},
      {"label", translate(services, "goldMapper.controller", "Controller")}});
  const std::vector<std::string> &controllers = launch::controller_targets();
  for (const std::string &id : controllers) {
    rows.push_back(
        bind_row(id, display_name(id), binds, services.public_root, tooltip_set));
  }

  rows.push_back(
      Json{{"isHeader", true},
           {"label", translate(services, "goldMapper.mouse", "Mouse")}});
  for (const std::string &id :
       std::vector<std::string>{"MOUSE_LEFT", "MOUSE_MIDDLE", "MOUSE_RIGHT"}) {
    rows.push_back(bind_row(id, mouse_label(services, id), binds,
                            services.public_root, tooltip_set));
  }

  rows.push_back(
      Json{{"isHeader", true},
           {"label", translate(services, "goldMapper.keyboard", "Keyboard")}});
  for (const std::string &id : keyboard_ids()) {
    rows.push_back(bind_row(id, display_name(id), binds, services.public_root,
                            tooltip_set));
  }
  data["rows"] = std::move(rows);
  data["backLabel"] = translate(services, "goldMapper.back", "Back");
  if (!editing_.empty()) {
    data["modalOpen"] = true;
    data["assignTitle"] = replace_token(
        translate(services, "goldMapper.assign", "Assign {{name}}"), "{{name}}",
        display_name(editing_));
    const std::string &source = editing_;
    data["mouseGroup"] = cell_group({
        cell_json("MOUSE_LEFT", mouse_label(services, "MOUSE_LEFT"),
                  reachable("MOUSE_LEFT"), source),
        cell_json("MOUSE_MIDDLE", mouse_label(services, "MOUSE_MIDDLE"),
                  reachable("MOUSE_MIDDLE"), source),
        cell_json("MOUSE_RIGHT", mouse_label(services, "MOUSE_RIGHT"),
                  reachable("MOUSE_RIGHT"), source),
    });

    Json control_rows = Json::array();
    std::vector<Json> pending;
    for (const std::string &id : launch::controller_targets()) {
      pending.push_back(cell_json(id, display_name(id), reachable(id), source));
      if (pending.size() == 4) {
        control_rows.push_back(cell_group(pending));
        pending.clear();
      }
    }
    if (!pending.empty()) {
      control_rows.push_back(cell_group(pending));
    }
    data["controlRows"] = std::move(control_rows);
    data["keyValue"] = key_buffer_;
    data["keyError"] = !key_error_.empty();
    data["keyErrorText"] = key_error_;
    data["cancelLabel"] = translate(services, "goldMapper.cancel", "Cancel");
  }
  return data;
}

void GoldMapperView::open_modal(const std::string &id, UiServices &services) {
  const config::AppConfig &config = services.config->data();
  const std::map<std::string, std::string> binds = load_binds(config);
  const auto found = binds.find(id);
  const std::string to = found != binds.end() ? found->second : id;
  if (starts_with(to, "KEY_")) {
    key_buffer_ = display_name(to);
  } else {
    key_buffer_.clear();
  }
  key_error_.clear();
  editing_ = id;
  if (services.focus_scope) {
    services.focus_scope("gm-modal-frame");
  }
}

void GoldMapperView::close_modal(UiServices &services, bool play_sound) {
  if (editing_.empty()) {
    return;
  }
  const std::string opened = editing_;
  editing_.clear();
  key_error_.clear();
  if (play_sound && services.audio != nullptr) {
    services.audio->play_back();
  }
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (services.focus_element) {
    services.focus_element("gmbind:" + opened);
  }
}

bool GoldMapperView::pick_target(const std::string &source,
                                 const std::string &target,
                                 UiServices &services) {
  if (services.config == nullptr) {
    return true;
  }
  std::map<std::string, std::string> binds =
      load_binds(services.config->data());
  binds[source] = target;
  save_mappings(services, std::move(binds));
  key_error_.clear();
  editing_.clear();
  key_buffer_.clear();
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  if (services.focus_scope) {
    services.focus_scope("");
  }
  if (services.focus_element) {
    services.focus_element("gmbind:" + source);
  }
  return true;
}

bool GoldMapperView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }
  config::AppConfig &config = services.config->data();
  if (starts_with(name, "goldmapper.open:")) {
    open_modal(std::string(name.substr(16)), services);
    return true;
  }

  if (name == "goldmapper.reset") {
    config.goldmapper_mappings.reset();
    services.config->save();
    key_error_.clear();
    core::info("GoldMapper: reset to defaults");
    return true;
  }

  if (name == "goldmapper.toggle") {
    config.goldmapper_enabled = !config.goldmapper_enabled.value_or(true);
    services.config->save();
    return true;
  }

  if (starts_with(name, "goldmapper.pick:")) {
    const std::string argument = std::string(name.substr(16));
    const std::size_t separator = argument.find(':');
    if (separator == std::string::npos) {
      return true;
    }
    return pick_target(argument.substr(0, separator),
                       argument.substr(separator + 1), services);
  }

  if (name == "goldmapper.key") {
    if (editing_.empty()) {
      return true;
    }
    std::string typed = key_buffer_;
    if (services.text_edited && services.text_edited() &&
        services.read_text_input) {
      typed = services.read_text_input();
    }
    std::string normalized;
    bool in_space = false;
    for (const char character : typed) {
      if (character == ' ' || character == '\t') {
        in_space = true;
        continue;
      }
      if (in_space && !normalized.empty()) {
        normalized += '_';
        in_space = false;
      }
      normalized += static_cast<char>(
          std::toupper(static_cast<unsigned char>(character)));
    }
    if (starts_with(normalized, "KEY_")) {
      normalized = normalized.substr(4);
    }
    bool known = false;
    for (const std::string &id : keyboard_ids()) {
      if (id.substr(4) == normalized) {
        known = true;
        break;
      }
    }
    if (!known) {
      key_error_ =
          translate(services, "goldMapper.unknownKeyName", "Unknown key name");
      return true;
    }
    return pick_target(editing_, "KEY_" + normalized, services);
  }

  if (name == "goldmapper.modal.cancel") {
    close_modal(services, false);
    return true;
  }

  if (name == "goldmapper.back") {
    if (services.navigate) {
      editing_.clear();
      services.navigate("settings");
    }
    return true;
  }

  return false;
}
} // namespace emerald::ui
