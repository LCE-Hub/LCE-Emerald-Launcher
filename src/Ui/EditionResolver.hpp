#pragma once
#include "Config/ConfigSchema.hpp"
#include "Instances/Editions.hpp"
#include <optional>
#include <string>
#include <vector>
namespace emerald::ui {
std::vector<instances::Edition>
resolve_config_editions(const config::AppConfig &config);

std::optional<instances::Edition>
find_config_edition(const config::AppConfig &config, const std::string &id);
} // namespace emerald::ui
