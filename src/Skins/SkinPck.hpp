#pragma once
#include <cstdint>
#include <string>
#include <vector>
namespace emerald::skins {
enum class PckAssetType : std::uint32_t {
  Skin = 0,
  Cape = 1,
  Texture = 2,
  UiData = 3,
  Info = 4,
  TexturePackInfo = 5,
  Localisation = 6,
  GameRules = 7,
  AudioData = 8,
  ColourTable = 9,
  GameRulesHeader = 10,
  SkinData = 11,
  Models = 12,
  Behaviours = 13,
  Materials = 14,
};

struct PckProperty {
  std::string key;
  std::string value;
};

struct PckAsset {
  std::string id;
  std::string path;
  PckAssetType type = PckAssetType::Info;
  std::uint32_t size = 0;
  std::vector<std::uint8_t> data;
  std::vector<PckProperty> properties;
};

struct PckFile {
  std::uint32_t version = 0;
  std::string endianness = "little";
  bool xml_support = false;
  std::vector<std::string> properties;
  std::vector<PckAsset> files;
};

std::vector<std::uint8_t> serialize_pck(const PckFile &pck);
} // namespace emerald::skins
