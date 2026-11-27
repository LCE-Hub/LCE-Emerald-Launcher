#pragma once
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::integrations {
struct SteamArtwork {
  std::vector<std::uint8_t> panorama;
  std::vector<std::uint8_t> title;
};

bool add_instance_shortcut(const std::string &instance_id,
                           const std::string &name,
                           const SteamArtwork &artwork, std::string &error);
} // namespace emerald::integrations
