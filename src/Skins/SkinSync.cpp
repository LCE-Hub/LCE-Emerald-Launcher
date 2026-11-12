#include "Skins/SkinSync.hpp"
#include "Instances/Editions.hpp"
#include "Instances/InstanceManager.hpp"
#include "Skins/SkinAssets.hpp"
#include "Skins/SkinLibrary.hpp"
#include "Skins/SkinPck.hpp"
#include "Ui/EditionResolver.hpp"
#include "Core/Fs.hpp"
#include <algorithm>
#include <cstring>
#include <string>
#include <system_error>
#include <vector>
namespace emerald::skins {
bool sync_skin_pck(const config::AppConfig &config,
                   const std::filesystem::path &public_root,
                   const std::filesystem::path &destination) {
  const std::string skin_url =
      config.skin_base64.has_value() && !config.skin_base64->empty()
          ? "data:image/png;base64," + *config.skin_base64
          : config.skin_source.value_or("/images/Default.png");
  const std::string cape_url = config.cape_base64.has_value() &&
                                       !config.cape_base64->empty()
                                   ? "data:image/png;base64," +
                                         *config.cape_base64
                                   : config.cape_source.value_or("");
  const bool slim = config.skin_slim.value_or(false);
  const std::string username = config.username;
  const std::string profile = config.profile.value_or("legacy_evolved");
  bool edition_not_support_slim_skins = true; //neo: dont ask about the variable name.
  const std::optional<instances::Edition> edition =
      ui::find_config_edition(config, profile);
  if (edition.has_value() && edition->supports_slim_skins) {
    edition_not_support_slim_skins = false;
  } else if (std::filesystem::exists(
                 instances::InstanceManager(config).working_dir(profile) /
                 ".emerald-x64")) {
    edition_not_support_slim_skins = false;
  }

  const std::optional<RgbaImage> skin = load_skin_source(skin_url, public_root);
  if (!skin.has_value()) {
    return false;
  }

  const int canvas_height = edition_not_support_slim_skins ? 32 : 64;
  RgbaImage canvas;
  canvas.width = 64;
  canvas.height = canvas_height;
  canvas.pixels.assign(static_cast<std::size_t>(canvas.width) *
                           static_cast<std::size_t>(canvas.height) * 4,
                       0);
  const int copy_rows = std::min(skin->height, canvas_height);
  const int copy_width = std::min(skin->width, canvas.width);
  for (int row = 0; row < copy_rows; ++row) {
    const std::uint8_t *source_row =
        skin->pixels.data() + static_cast<std::size_t>(row) * skin->width * 4;
    std::uint8_t *target_row =
        canvas.pixels.data() + static_cast<std::size_t>(row) * 64 * 4;
    std::memcpy(target_row, source_row,
                static_cast<std::size_t>(copy_width) * 4);
  }

  const std::optional<std::vector<std::uint8_t>> skin_png =
      reencode_png(canvas);
  if (!skin_png.has_value()) {
    return false;
  }

  const bool is_modern_height = skin->height == 64;
  const char *anim_value =
      slim ? (edition_not_support_slim_skins ? "0x00041800" : "0x00080000")
           : (is_modern_height ? "0x00040000" : "0x00000000");

  std::vector<PckProperty> boxes;
  if (slim && edition_not_support_slim_skins) {
    boxes.push_back({"BOX", "ARM0 -2 -2 -2 3 12 4 40 16 0 0 0"});
    boxes.push_back({"BOX", "ARM1 -1 -2 -2 3 12 4 40 16 0 1 0"});
  }

  std::optional<std::vector<std::uint8_t>> cape_png;
  if (!cape_url.empty()) {
    if (const std::optional<RgbaImage> cape =
            load_skin_source(cape_url, public_root);
        cape.has_value() && cape->width > 0 && cape->height > 0) {
      cape_png = reencode_png(*cape);
    }
  }

  const std::string seed = seeded_id(username);
  std::vector<PckAsset> files;
  PckAsset skin_asset;
  skin_asset.id = "dlcskin" + seed;
  skin_asset.path = "dlcskin" + seed + ".png";
  skin_asset.type = PckAssetType::Skin;
  skin_asset.size = static_cast<std::uint32_t>(skin_png->size());
  skin_asset.data = *skin_png;
  skin_asset.properties = {
      {"DISPLAYNAME", username},
      {"GAME_FLAGS", "0x18"},
      {"FREE", "1"},
      {"ANIM", anim_value},
  };
  for (const PckProperty &box : boxes) {
    skin_asset.properties.push_back(box);
  }
  skin_asset.properties.push_back({"THEMENAME", "Emerald Launcher"});
  skin_asset.properties.push_back({"CAPEPATH", "dlccape" + seed + ".png"});
  files.push_back(std::move(skin_asset));
  if (cape_png.has_value()) {
    PckAsset cape_asset;
    cape_asset.id = "dlccape" + seed;
    cape_asset.path = "dlccape" + seed + ".png";
    cape_asset.type = PckAssetType::Cape;
    cape_asset.size = static_cast<std::uint32_t>(cape_png->size());
    cape_asset.data = *cape_png;
    cape_asset.properties = {};
    files.push_back(std::move(cape_asset));
  }

  PckFile pck;
  pck.version = 3;
  pck.endianness = "little";
  pck.xml_support = false;
  pck.properties = {"ANIM", "DISPLAYNAME", "THEMENAME", "GAME_FLAGS", "FREE",
                    "BOX"};
  pck.files = std::move(files);
  const std::vector<std::uint8_t> pck_buffer = serialize_pck(pck);
  const std::string bytes(reinterpret_cast<const char *>(pck_buffer.data()),
                          pck_buffer.size());
  return core::write_file(destination, bytes);
}
} // namespace emerald::skins
