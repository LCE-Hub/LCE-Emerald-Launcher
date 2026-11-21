#pragma once
#include <optional>
#include <string>
namespace emerald::skins {
struct FetchedSkin {
  std::string base64;
  std::string name;
};

std::optional<FetchedSkin> fetch_skin(const std::string &username,
                                      const std::string &proxy,
                                      std::string &error);
} // namespace emerald::skins
