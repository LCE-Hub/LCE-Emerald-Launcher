#pragma once
#include "Config/ConfigSchema.hpp"
#include <filesystem>
namespace emerald::skins {
bool sync_skin_pck(const config::AppConfig &config,
                   const std::filesystem::path &public_root,
                   const std::filesystem::path &destination);
} // namespace emerald::skins
