#pragma once
#include <optional>
#include <string>
#include <vector>
namespace emerald::instances {
struct Edition {
  std::string id;
  std::string name;
  std::string desc;
  std::string url;
  std::string title_image;
  std::string logo;
  std::string panorama;
  std::string category;
  bool supports_slim_skins = false;
  bool transparent_logo = false;
  bool coming_soon = false;
  bool hidden = false;
  bool lce_online = false;
  bool hide_on_android = false;
};

const std::vector<Edition> &base_editions();
std::vector<Edition>
resolve_editions(const std::vector<Edition> &custom_editions,
                 const std::vector<std::pair<std::string, Edition>> &overrides);

std::string edition_download_url(const Edition &edition,
                                 const std::string &branch);

} // namespace emerald::instances