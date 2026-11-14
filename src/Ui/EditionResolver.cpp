#include "Ui/EditionResolver.hpp"
namespace emerald::ui {
namespace {
std::vector<instances::Edition>
custom_editions_from(const config::AppConfig &config) {
  std::vector<instances::Edition> editions;
  if (!config.custom_editions.has_value()) {
    return editions;
  }
  for (const config::CustomEdition &edition : *config.custom_editions) {
    instances::Edition converted;
    converted.id = edition.id;
    converted.name = edition.name.empty() ? edition.id : edition.name;
    converted.desc = edition.desc;
    converted.url = edition.url;
    converted.logo = edition.logo.value_or("");
    converted.category =
        edition.category.has_value() && !edition.category->empty()
            ? edition.category->front()
            : std::string("custom");
    editions.push_back(std::move(converted));
  }
  return editions;
}

std::vector<std::pair<std::string, instances::Edition>>
overrides_from(const config::AppConfig &config) {
  std::vector<std::pair<std::string, instances::Edition>> overrides;
  if (!config.customizations.has_value()) {
    return overrides;
  }
  for (const auto &[profile, customization] : *config.customizations) {
    instances::Edition edition;
    if (customization.title_image.has_value()) {
      edition.title_image = *customization.title_image;
    }
    if (customization.panorama.has_value()) {
      edition.panorama = *customization.panorama;
    }
    overrides.emplace_back(profile, std::move(edition));
  }
  return overrides;
}
} // namespace

std::vector<instances::Edition>
resolve_config_editions(const config::AppConfig &config) {
  return instances::resolve_editions(custom_editions_from(config),
                                     overrides_from(config));
}

std::optional<instances::Edition>
find_config_edition(const config::AppConfig &config, const std::string &id) {
  for (const instances::Edition &edition : resolve_config_editions(config)) {
    if (edition.id == id) {
      return edition;
    }
  }
  return std::nullopt;
}
} // namespace emerald::ui
