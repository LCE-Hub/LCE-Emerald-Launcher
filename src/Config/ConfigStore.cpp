#include "Config/ConfigStore.hpp"
#include "Core/Fs.hpp"
#include "Core/Log.hpp"
#include "Core/Paths.hpp"
#include <filesystem>
namespace emerald::config {
namespace {
std::filesystem::path legacy_username_path() {
  return core::app_data_dir() / "emerald_legacy_config.txt";
}

Json merge_known_fields(const Json &document, const AppConfig &config) {
  Json merged = document.is_object() ? document : Json::object();
  Json known = to_json(config);
  for (auto &[key, value] : known.items()) {
    merged[key] = value;
  }
  return merged;
}
} // namespace

void ConfigStore::load() {
  document_ = Json::object();
  const std::filesystem::path path = core::config_file_path();
  if (auto contents = core::read_file(path)) {
    Json parsed = Json::parse(*contents, nullptr, false);
    if (!parsed.is_discarded() && parsed.is_object()) {
      config_ = from_json(parsed);
      document_ = parsed;
      return;
    }
    core::warn("config file is not valid JSON, falling back to legacy");
  }

  config_ = AppConfig{};
  if (auto legacy = core::read_file(legacy_username_path())) {
    std::string username = *legacy;
    while (!username.empty() &&
           (username.back() == '\n' || username.back() == '\r')) {
      username.pop_back();
    }
    if (!username.empty()) {
      config_.username = username;
    }
  }

  apply_legacy_defaults(config_);
}

bool ConfigStore::save() const {
  const Json merged = merge_known_fields(document_, config_);
  return core::write_file_atomic(core::config_file_path(), merged.dump());
}

std::string ConfigStore::export_pretty() const {
  return to_json(config_).dump(2);
}

bool ConfigStore::import_from_string(std::string_view contents,
                                     std::string &error) {
  Json parsed = Json::parse(contents, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) {
    error = "settings file is not a valid JSON object";
    return false;
  }

  config_ = from_json(parsed);
  document_ = parsed;
  save();
  return true;
}
} // namespace emerald::config
