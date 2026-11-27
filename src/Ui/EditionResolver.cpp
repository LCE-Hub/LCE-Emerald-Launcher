#include "Ui/EditionResolver.hpp"
#include "Instances/InstanceManager.hpp"
#include <filesystem>
#include <string_view>
namespace emerald::ui {
namespace {
constexpr std::string_view kTitleImageFile = ".emerald-title.png";
constexpr std::string_view kIconFile = ".emerald-icon.png";
std::optional<std::string> instance_image(const std::filesystem::path &dir,
                                          std::string_view name) {
  std::error_code error;
  const std::filesystem::path path =
      std::filesystem::absolute(dir / std::string(name), error);
  if (error || !std::filesystem::is_regular_file(path, error)) {
    return std::nullopt;
  }
  return path.string();
}

void apply_instance_images(const config::AppConfig &config,
                           std::vector<instances::Edition> &editions) {
  const instances::InstanceManager instances(config);
  for (instances::Edition &edition : editions) {
    const std::filesystem::path dir = instances.working_dir(edition.id);
    if (edition.title_image.empty()) {
      if (const std::optional<std::string> image =
              instance_image(dir, kTitleImageFile)) {
        edition.title_image = *image;
      }
    }
    if (edition.logo.empty()) {
      if (const std::optional<std::string> image =
              instance_image(dir, kIconFile)) {
        edition.logo = *image;
      }
    }
  }
}

std::string url_for_branch(const std::string &url,
                           const std::string &branch) {
  constexpr std::string_view marker = "/releases/download/";
  const std::size_t start = url.find(marker);
  if (start == std::string::npos) {
    return url;
  }
  const std::size_t segment = start + marker.size();
  const std::size_t end = url.find('/', segment);
  if (end == std::string::npos) {
    return url;
  }
  return url.substr(0, segment) + branch + url.substr(end);
}

void apply_channel_selections(const config::AppConfig &config,
                              std::vector<instances::Edition> &editions) {
  if (!config.channel_selections.has_value()) {
    return;
  }
  for (instances::Edition &edition : editions) {
    bool is_base = false;
    for (const instances::Edition &base : instances::base_editions()) {
      if (base.id == edition.id) {
        is_base = true;
        break;
      }
    }
    if (!is_base) {
      continue;
    }
    const auto found = config.channel_selections->find(edition.id);
    if (found == config.channel_selections->end() ||
        found->second.empty() || found->second == "Stable") {
      continue;
    }
    edition.id = edition.id + "_" + found->second;
    edition.name = edition.name + " " + found->second;
    edition.url = url_for_branch(edition.url, found->second);
  }
}

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
  std::vector<instances::Edition> editions = instances::resolve_editions(
      custom_editions_from(config), overrides_from(config));
  apply_channel_selections(config, editions);
  apply_instance_images(config, editions);
  return editions;
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
