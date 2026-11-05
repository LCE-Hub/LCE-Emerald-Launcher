#include "Ui/I18n.hpp"
#include "Core/Log.hpp"
#include <fstream>
namespace emerald::ui {
namespace {
void flatten(const Json &node, const std::string &prefix,
             std::map<std::string, std::string> &out) {
  if (node.is_string()) {
    out[prefix] = node.get<std::string>();
    return;
  }
  if (!node.is_object()) {
    return;
  }
  for (auto iterator = node.begin(); iterator != node.end(); ++iterator) {
    const std::string key =
        prefix.empty() ? iterator.key() : prefix + "." + iterator.key();
    flatten(*iterator, key, out);
  }
}

} // namespace
void I18n::load_language(std::string_view language_code,
                         const std::filesystem::path &root) {
  language_ = std::string(language_code);
  strings_.clear();
  std::filesystem::path path = root / (language_ + ".json");
  if (!std::filesystem::exists(path)) {
    path = root / "en.json";
  }
  std::ifstream stream(path);
  if (!stream) {
    core::warn(std::string{"i18n: could not open "} + path.string());
    return;
  }
  try {
    Json data;
    stream >> data;
    load_from_json(data);
  } catch (const std::exception &error) {
    core::warn(std::string{"i18n: failed to parse "} + path.string() + ": " +
               error.what());
  }
}

void I18n::load_from_json(const Json &translations) {
  strings_.clear();
  flatten(translations, "", strings_);
}

void I18n::set_language(std::string_view language_code) {
  language_ = std::string(language_code);
}

std::string I18n::translate(std::string_view key) const {
  const auto found = strings_.find(std::string(key));
  return found == strings_.end() ? std::string(key) : found->second;
}

std::string I18n::font_for_language() const {
  if (language_ == "ru") {
    return "/fonts/rus/minecraft.ttf";
  }
  return "/fonts/Mojangles.ttf";
}
} // namespace emerald::ui