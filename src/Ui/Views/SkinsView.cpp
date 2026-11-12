#include "Ui/Views/SkinsView.hpp"
#include "Audio/AudioEngine.hpp"
#include "Config/ConfigSchema.hpp"
#include "Skins/SkinAssets.hpp"
#include "Skins/SkinFetch.hpp"
#include "Skins/SkinLibrary.hpp"
#include "Skins/SkinUiState.hpp"
#include "Ui/I18n.hpp"
#include <algorithm>
#include <string>
#include <vector>
namespace emerald::ui {
namespace {
std::string translate(const UiServices &services, const char *key,
                      const char *fallback) {
  if (services.config->data().bedrock_enabled.value() == true) {return(std::string("Marketplace"));}
  return services.i18n != nullptr ? services.i18n->translate(key)
                                  : std::string(fallback);
}

std::string active_skin_url(const config::AppConfig &config) {
  if (config.skin_base64.has_value() && !config.skin_base64->empty()) {
    return "data:image/png;base64," + *config.skin_base64;
  }
  return config.skin_source.value_or("/images/Default.png");
}

std::string active_cape_url(const config::AppConfig &config) {
  if (config.cape_base64.has_value() && !config.cape_base64->empty()) {
    return "data:image/png;base64," + *config.cape_base64;
  }
  return config.cape_source.value_or("");
}

Json skin_item(const std::string &id, const std::string &name,
               const std::string &url, bool slim, bool active,
               bool editable) {
  Json item = Json::object();
  item["id"] = id;
  item["name"] = name;
  item["url"] = url;
  item["slim"] = slim;
  item["active"] = active;
  item["editable"] = editable;
  item["notEditable"] = !editable;
  item["action"] = "skins.select:" + id;
  item["renameAction"] = "skins.rename:" + id;
  item["activeClass"] = active ? "skin-row-active" : "";
  item["nameClass"] = active ? "skin-name-active" : "";
  return item;
}

Json cape_item(const std::string &id, const std::string &name,
               const std::string &url, bool active, bool editable,
               bool is_none) {
  Json item = Json::object();
  item["id"] = id;
  item["name"] = name;
  item["url"] = url;
  item["active"] = active;
  item["editable"] = editable;
  item["notEditable"] = !editable;
  item["isNone"] = is_none;
  item["notNone"] = !is_none;
  item["action"] = "skins.cape.select:" + id;
  item["renameAction"] = "skins.rename:" + id;
  item["activeClass"] = active ? "skin-row-active" : "";
  item["nameClass"] = active ? "skin-name-active" : "";
  return item;
}

} // namespace

void SkinsView::on_enter() { skins::SkinUiState::instance().view_mode = "skin"; }
bool SkinsView::on_escape(UiServices &services) {
  skins::SkinUiState &state = skins::SkinUiState::instance();
  if (state.import_open) {
    const bool was_open = state.import_open;
    if (state.import_mode.empty()) {
      state.reset_import();
    } else {
      state.import_mode.clear();
      state.username_draft.clear();
      state.import_error.clear();
    }
    if (services.audio != nullptr) {
      services.audio->play_back();
    }
    sync_import_focus(services, was_open);
    return true;
  }
  if (services.audio != nullptr) {
    services.audio->play_back();
  }
  if (services.navigate != nullptr) {
    services.navigate("home");
  }
  return true;
}

Json SkinsView::data(const UiServices &services) const {
  Json data = Json::object();
  if (services.config == nullptr) {
    return data;
  }
  const config::AppConfig &config = services.config->data();
  skins::SkinUiState &state = skins::SkinUiState::instance();
  const bool skin_mode = state.view_mode != "cape";
  const std::string active_skin = active_skin_url(config);
  const std::string active_cape = active_cape_url(config);
  data["skinMode"] = skin_mode;
  data["capeMode"] = !skin_mode;
  data["skinTabClass"] = skin_mode ? "skins-tab-active" : "";
  data["capeTabClass"] = skin_mode ? "" : "skins-tab-active";
  data["importLabel"] =
      skin_mode ? translate(services, "skins.importSkin", "Import Skin")
                : translate(services, "skins.importCape", "Import Cape");
  data["deleteLabel"] =
      skin_mode ? translate(services, "skins.deleteSkin", "Delete Skin")
                : translate(services, "skins.deleteCape", "Delete Cape");

  if (skin_mode) {
    std::vector<Json> items;
    for (const skins::SavedSkin &skin : skins::default_skins()) {
      items.push_back(skin_item(skin.id, skin.name, skin.url, skin.is_slim,
                                skin.url == active_skin, false));
    }
    if (config.custom_skins.has_value()) {
      for (const config::SavedSkin &skin : *config.custom_skins) {
        bool is_default = false;
        for (const skins::SavedSkin &entry : skins::default_skins()) {
          if (entry.id == skin.id) {
            is_default = true;
            break;
          }
        }
        if (is_default) {
          continue;
        }
        items.push_back(skin_item(skin.id, skin.name, skin.url,
                                  skin.is_slim.value_or(false),
                                  skin.url == active_skin, true));
      }
    }
    data["skinItems"] = items;
    bool active_is_default = true;
    for (const Json &item : items) {
      if (item.value("active", false) &&
          item.value("editable", false)) {
        active_is_default = false;
        break;
      }
    }
    data["deleteDisabled"] = active_is_default;
    data["deleteClass"] = active_is_default ? "toolbar-btn-disabled" : "";
    data["deleteAction"] =
        active_is_default ? std::string("skins.noop") : std::string("skins.delete");
  } else {
    std::vector<Json> items;
    items.push_back(cape_item("none",
                              translate(services, "skins.noCape", "No Cape"),
                              "", active_cape.empty(), false, true));
    for (const skins::SavedCape &cape : skins::default_capes()) {
      items.push_back(cape_item(cape.id, cape.name, cape.url,
                                cape.url == active_cape, false, false));
    }
    if (config.custom_capes.has_value()) {
      for (const config::SavedCape &cape : *config.custom_capes) {
        bool is_default = false;
        for (const skins::SavedCape &entry : skins::default_capes()) {
          if (entry.id == cape.id) {
            is_default = true;
            break;
          }
        }
        if (is_default) {
          continue;
        }
        items.push_back(cape_item(cape.id, cape.name, cape.url,
                                  cape.url == active_cape, true, false));
      }
    }
    data["capeItems"] = items;
    bool active_is_default = true;
    for (const Json &item : items) {
      if (item.value("active", false) &&
          item.value("editable", false)) {
        active_is_default = false;
        break;
      }
    }
    data["deleteDisabled"] = active_is_default;
    data["deleteClass"] = active_is_default ? "toolbar-btn-disabled" : "";
    data["deleteAction"] = active_is_default ? std::string("skins.noop")
                                             : std::string("skins.cape.delete");
  }

  data["importOpen"] = skin_mode && state.import_open;
  data["importRoot"] = skin_mode && state.import_open &&
                       state.import_mode.empty();
  data["importUsernameMode"] = skin_mode && state.import_mode == "username";
  data["importModelMode"] = skin_mode && state.import_mode == "model";
  data["usernameValue"] = state.username_draft;
  data["importError"] = state.import_error;
  data["importingClass"] = state.importing ? "modal-btn-busy" : "";
  std::string fetch_label =
      translate(services, "skins.fetch", "Fetch {{type}}");
  const std::size_t placeholder = fetch_label.find("{{type}}");
  if (placeholder != std::string::npos) {
    fetch_label.replace(placeholder, 7, "Skin");
  }
  data["fetchLabel"] = state.importing
                           ? translate(services, "skins.fetching", "Fetching...")
                           : fetch_label;
  return data;
}

void SkinsView::select_skin(const std::string &id, UiServices &services) {
  config::AppConfig &config = services.config->data();
  const skins::SavedSkin *found = nullptr;
  for (const skins::SavedSkin &skin : skins::default_skins()) {
    if (skin.id == id) {
      found = &skin;
      break;
    }
  }
  std::string url;
  bool slim = false;
  if (found != nullptr) {
    url = found->url;
    slim = found->is_slim;
  } else if (config.custom_skins.has_value()) {
    for (const config::SavedSkin &skin : *config.custom_skins) {
      if (skin.id == id) {
        url = skin.url;
        slim = skin.is_slim.value_or(false);
        break;
      }
    }
  }
  if (url.empty()) {
    return;
  }
  config.skin_source = url;
  config.skin_base64.reset();
  config.skin_slim = slim;
  skins::SkinUiState::instance().sync_needed = true;
  services.config->save();
}

void SkinsView::delete_active_skin(UiServices &services) {
  config::AppConfig &config = services.config->data();
  const std::string active = active_skin_url(config);
  if (!config.custom_skins.has_value()) {
    return;
  }
  std::vector<config::SavedSkin> &skins = *config.custom_skins;
  for (std::size_t index = 0; index < skins.size(); ++index) {
    if (skins[index].url == active) {
      skins.erase(skins.begin() + static_cast<long>(index));
      break;
    }
  }
  config.skin_source = "/images/Default.png";
  config.skin_base64.reset();
  config.skin_slim = false;
  skins::SkinUiState::instance().sync_needed = true;
  services.config->save();
}

void SkinsView::select_cape(const std::string &id, UiServices &services) {
  config::AppConfig &config = services.config->data();
  if (id == "none") {
    config.cape_source.reset();
    config.cape_base64.reset();
    skins::SkinUiState::instance().sync_needed = true;
    services.config->save();
    return;
  }
  std::string url;
  for (const skins::SavedCape &cape : skins::default_capes()) {
    if (cape.id == id) {
      url = cape.url;
      break;
    }
  }
  if (url.empty() && config.custom_capes.has_value()) {
    for (const config::SavedCape &cape : *config.custom_capes) {
      if (cape.id == id) {
        url = cape.url;
        break;
      }
    }
  }
  if (url.empty()) {
    return;
  }
  config.cape_source = url;
  config.cape_base64.reset();
  skins::SkinUiState::instance().sync_needed = true;
  services.config->save();
}

void SkinsView::delete_active_cape(UiServices &services) {
  config::AppConfig &config = services.config->data();
  const std::string active = active_cape_url(config);
  if (!config.custom_capes.has_value()) {
    return;
  }
  std::vector<config::SavedCape> &capes = *config.custom_capes;
  for (std::size_t index = 0; index < capes.size(); ++index) {
    if (capes[index].url == active) {
      capes.erase(capes.begin() + static_cast<long>(index));
      break;
    }
  }
  config.cape_source.reset();
  config.cape_base64.reset();
  skins::SkinUiState::instance().sync_needed = true;
  services.config->save();
}

void SkinsView::rename_entry(const std::string &id, UiServices &services) {
  const std::string name = services.read_text_input();
  if (name.empty()) {
    return;
  }
  config::AppConfig &config = services.config->data();
  const std::string trimmed = name.substr(0, 16);
  if (config.custom_skins.has_value()) {
    for (config::SavedSkin &skin : *config.custom_skins) {
      if (skin.id == id) {
        skin.name = trimmed;
        services.config->save();
        return;
      }
    }
  }
  if (config.custom_capes.has_value()) {
    for (config::SavedCape &cape : *config.custom_capes) {
      if (cape.id == id) {
        cape.name = trimmed;
        services.config->save();
        return;
      }
    }
  }
}

void SkinsView::sync_import_focus(UiServices &services, bool was_open) const {
  const bool open = skins::SkinUiState::instance().import_open;
  if (open == was_open || services.focus_scope == nullptr) {
    return;
  }
  if (open) {
    services.focus_scope("skins-import-modal");
    return;
  }
  services.focus_scope("");
  if (services.focus_element != nullptr) {
    services.focus_element("skins-import-btn");
  }
}

bool SkinsView::action(std::string_view name, UiServices &services) {
  if (services.config == nullptr) {
    return false;
  }
  skins::SkinUiState &state = skins::SkinUiState::instance();
  const std::string action(name);
  const std::size_t colon = action.find(':');
  const std::string verb =
      colon == std::string::npos ? action : action.substr(0, colon);
  const std::string argument =
      colon == std::string::npos ? std::string() : action.substr(colon + 1);

  if (verb == "skins.noop") {
    return true;
  }
  if (verb == "skins.mode") {
    state.view_mode = state.view_mode == "cape" ? "skin" : "cape";
    return true;
  }
  if (verb == "skins.mode.skin") {
    state.view_mode = "skin";
    return true;
  }
  if (verb == "skins.mode.cape") {
    state.view_mode = "cape";
    return true;
  }
  if (verb == "skins.import") {
    const bool was_open = state.import_open;
    if (state.view_mode == "cape") {
      state.open_import_dialog();
    } else {
      state.reset_import();
      state.import_open = true;
    }
    sync_import_focus(services, was_open);
    return true;
  }
  if (verb == "skins.import.file") {
    state.open_import_dialog();
    return true;
  }
  if (verb == "skins.import.username") {
    state.import_mode = "username";
    return true;
  }
  if (verb == "skins.import.back") {
    const bool was_open = state.import_open;
    if (state.import_mode.empty()) {
      state.reset_import();
    } else {
      state.import_mode.clear();
      state.username_draft.clear();
      state.import_error.clear();
    }
    sync_import_focus(services, was_open);
    return true;
  }
  if (verb == "skins.username") {
    state.username_draft = services.read_text_input();
    return true;
  }
  if (verb == "skins.import.fetch") {
    if (state.importing || state.username_draft.empty()) {
      return true;
    }
    const bool was_open = state.import_open;
    state.importing = true;
    state.import_error.clear();
    std::string error;
    const std::optional<skins::FetchedSkin> fetched = skins::fetch_skin(
        state.username_draft, services.config->data().http_proxy.value_or(""),
        error);
    state.importing = false;
    if (!fetched.has_value()) {
      state.import_error =
          error.empty() ? translate(services, "skins.failedToFetch",
                                    "Failed to fetch")
                        : error;
      sync_import_focus(services, was_open);
      return true;
    }
    state.process_import("data:image/png;base64," + fetched->base64,
                         fetched->name);
    return true;
  }
  if (verb == "skins.import.normal" || verb == "skins.import.slim") {
    const bool was_open = state.import_open;
    state.finalize_import(*services.config, services.public_root,
                          verb == "skins.import.slim");
    sync_import_focus(services, was_open);
    return true;
  }
  if (verb == "skins.select") {
    select_skin(argument, services);
    return true;
  }
  if (verb == "skins.delete") {
    delete_active_skin(services);
    return true;
  }
  if (verb == "skins.cape.select") {
    select_cape(argument, services);
    return true;
  }
  if (verb == "skins.cape.delete") {
    delete_active_cape(services);
    return true;
  }
  if (verb == "skins.rename") {
    rename_entry(argument, services);
    return true;
  }
  return false;
}
} // namespace emerald::ui
