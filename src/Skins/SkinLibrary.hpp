#pragma once
#include <string>
#include <vector>
namespace emerald::skins {
struct SavedSkin {
  std::string id;
  std::string name;
  std::string url;
  bool is_slim = false;
};

struct SavedCape {
  std::string id;
  std::string name;
  std::string url;
};

const std::vector<SavedSkin> &default_skins();
const std::vector<SavedCape> &default_capes();
} // namespace emerald::skins
