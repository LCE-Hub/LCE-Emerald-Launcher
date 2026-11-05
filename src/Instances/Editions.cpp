#include "Instances/Editions.hpp"
namespace emerald::instances {
namespace {
const std::vector<Edition> &build_base_editions() {
  static const std::vector<Edition> editions{
      {"legacy_evolved", "neoLegacy",
       "Backporting newer title updates and Minigames back to LCE",
       "https://git.neolegacy.dev/neoStudiosLCE/neoLegacy/releases/download/"
       "latest/neoLegacyWindows64.zip",
       "/images/minecraft_title_neoLegacy.png", "/images/neoLegacy.png",
       "legacy_evolved", "", true, false, false, false, false, false},
      {"cafeberry", "Cafeberry",
       "Project aiming to faithfully backport TUs, add cross-play and more!",
       "https://gitea.str1k3r.xyz/cafeberry/cafeberry/releases/download/latest/"
       "LCEWindows64.zip",
       "/images/cafeberry_title.png", "", "vanilla_tu24", "", false, false,
       false, false, false, false},
      {"revelations", "Legacy Revelations",
       "QoL, performance, hardcore mode, & security features for LCE.",
       "https://git.revela.dev/itsRevela/LCE-Revelations/releases/download/"
       "Nightly/LCE-Revelations-Client-Win64.zip",
       "/images/minecraft_title_revelations.png", "/images/revelations.png",
       "vanilla_tu19", "", false, true, false, false, false, false},
      {"refourj", "ReFourJ",
       "A LCE Project which aims to bring the feel and functionality from "
       "Minecraft: Playstation Edition directly natively to your PC!",
       "https://git.neolegacy.dev/ProjectLCE/Client/releases/download/latest/"
       "MinecraftPS4Edition.zip",
       "/images/MinecraftPS4Edition.png", "/images/projectlce.png",
       "legacyorbis", "", true, false, false, false, false, false},
      {"lostlegacy", "Minecraft Lost Legacy",
       "Downporting project aiming at bringing back the feel of Title Update 1 "
       "with extra QoL features.",
       "no", "/images/lostlegacy_title.png", "/images/lostlegacy.png",
       "vanilla_tu1", "", false, false, true, false, false, false},
      {"360revived", "360 Revived", "PC port of Xbox 360 Edition TU19",
       "emerald://PLEASE_IM_TIRED_OF_ALL_THIS",
       "/images/minecraft_title_360revived.png", "/images/360_revived.png",
       "360revived", "", false, false, false, true, false, true},
      {"legacy_nether_fork", "Hellish Ends",
       "QoL, Random additions, and Nether/End/Aether dimensions overhaul "
       "(Modded build!)",
       "https://github.com/deadvoxelx/ThatModdedRepo/releases/download/nightly/"
       "LCEWindows64.zip",
       "/images/minecraft_title_hellishends.png", "/images/hellishEndsIcon.png",
       "hellishends", "", false, false, false, false, false, false},
      {"moon_edition", "Minecraft: Moon Edition",
       "Galacticraft LCE port (Modded build!)",
       "https://github.com/blazin-blaze/moon-edition/releases/latest/download/"
       "moonEditionWindows64.zip",
       "/images/minecraft_title_moon.png", "/images/moonEdition.png",
       "moonedition", "", false, true, false, false, false, false},
      {"lceonline", "LCE Online Client",
       "[DISCONTINUED!] Restoring the classic LCE online experience with "
       "friends, world hosting, leaderboards & more.",
       "emerald://PLEASE_IM_TIRED_OF_ALL_THIS", "/images/lceonline.png",
       "/images/lce_online.png", "vanilla_tu19", "", false, true, false, true,
       true, false},
  };
  return editions;
}
} // namespace

const std::vector<Edition> &base_editions() { return build_base_editions(); }
std::vector<Edition> resolve_editions(
    const std::vector<Edition> &custom_editions,
    const std::vector<std::pair<std::string, Edition>> &overrides) {
  const auto apply_override =
      [](Edition &edition,
         const std::vector<std::pair<std::string, Edition>> &source) {
        for (const auto &[id, override_edition] : source) {
          if (id != edition.id) {
            continue;
          }
          if (!override_edition.title_image.empty()) {
            edition.title_image = override_edition.title_image;
          }
          if (!override_edition.panorama.empty()) {
            edition.panorama = override_edition.panorama;
          }
          break;
        }
      };

  std::vector<Edition> editions;
  editions.reserve(base_editions().size() + custom_editions.size());
  for (Edition edition : base_editions()) {
    apply_override(edition, overrides);
    editions.push_back(std::move(edition));
  }
  for (Edition edition : custom_editions) {
    apply_override(edition, overrides);
    editions.push_back(std::move(edition));
  }
  return editions;
}
} // namespace emerald::instances