#include "Ui/Views/CreditsView.hpp"
#include "Audio/AudioEngine.hpp"
#include <algorithm>
#include <cctype>
#include <random>
namespace emerald::ui {
namespace {
using MemberList = std::vector<std::pair<std::string, std::string>>;

std::string to_upper(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char character) {
                   return static_cast<char>(std::toupper(character));
                 });
  return value;
}

Json members_json(const MemberList &members) {
  Json list = Json::array();
  for (const auto &[name, url] : members) {
    Json member = Json::object();
    member["name"] = name;
    member["url"] = url;
    list.push_back(member);
  }
  return list;
}

Json role_json(const std::string &role, const MemberList &members) {
  Json entry = Json::object();
  entry["role"] = to_upper(role);
  entry["members"] = members_json(members);
  return entry;
}

Json project_json(const std::string &name, Json roles) {
  Json project = Json::object();
  project["name"] = to_upper(name);
  project["roles"] = std::move(roles);
  return project;
}

Json subcategory_json(const std::string &name, const std::string &icon,
                      const std::string &extra_class, Json roles) {
  Json subcategory = Json::object();
  subcategory["name"] = to_upper(name);
  subcategory["icon"] = icon;
  subcategory["class"] =
      extra_class.empty() ? std::string{"credit-sub"}
                          : "credit-sub " + extra_class;
  subcategory["roles"] = std::move(roles);
  return subcategory;
}

Json category_json(const std::string &category, const std::string &icon,
                   const std::string &category_class, Json subcategories) {
  Json entry = Json::object();
  entry["category"] = to_upper(category);
  entry["icon"] = icon;
  entry["class"] = category_class;
  entry["subcategories"] = std::move(subcategories);
  return entry;
}

Json android_testers_json() {
  std::vector<std::string> names = {
      "Peppinaramenisblack",
      "kacper",
      "tjdownchurch",
      "tjdownchurch's dad (rip)",
      "dadael3",
      "bekhens",
      "notrainbowsteve",
      "moth_scribe",
      "leader",
      "raymanroy",
      "fin",
      "liugu",
      "Zrox2013 (Zamers2013)",
      "kierwa",
      "cartox",
      "necmi",
      "theunknown",
      "XeroChunks (double thanks!)",
      "bee (quickjinxy_)",
      "loss_less",
      "ttfly",
      "harper",
      "dllie (tofou)",
      "recycleordie",
      "nezzled",
      "frenchwith0skill",
      "tarknim",
      "thehuckle",
      "gabrielblast",
      "nedjouamario",
      "bossanova",
      "jayem",
      "andrewjcf",
      "thingthing",
      "toastybaguette",
      "goobert",
      "Erickk64",
      "flamingphoenex",
      "Tymszn21",
      "DaPogLord",
      "turniphead",
      "ArthurDotPNG",
      "CounterrAct",
      "luckyduuckxd",
      "PixelatedCheese1",
  };
  std::random_device device;
  std::mt19937 generator(device());
  std::shuffle(names.begin(), names.end(), generator);
  MemberList members;
  for (std::string &name : names) {
    members.emplace_back(std::move(name), "#");
  }
  Json roles = Json::array();
  roles.push_back(role_json("", members));
  return subcategory_json("Android Beta Testers", "", "", std::move(roles));
}
} // namespace

CreditsView::CreditsView() : credits_(build_credits()) {}

Json CreditsView::build_credits() {
  Json categories = Json::array();

  Json leadership_roles = Json::array();
  leadership_roles.push_back(role_json("Founder & Maintainer", {
                                                                   {"KayJann", "https://github.com/KayJannOnGit"},
                                                                   {"neoapps", "https://github.com/neoapps-dev"},
                                                               }));
  leadership_roles.push_back(
      role_json("Active Maintainer", {
                                         {"neoapps", "https://github.com/neoapps-dev"},
                                     }));
  Json leadership =
      subcategory_json("Leadership", "", "", std::move(leadership_roles));

  Json contributor_roles = Json::array();
  contributor_roles.push_back(role_json("", {
                                                {"Santiago Fisela", "https://github.com/PinkLittleKitty"},
                                                {"Leon", "https://github.com/hornyalcoholic"},
                                                {"Criador_Mods", "https://github.com/CriadorMods"},
                                                {"j-carv", "https://github.com/j-carv"},
                                            }));
  Json contributors =
      subcategory_json("Contributors", "", "", std::move(contributor_roles));

  Json emerald_subs = Json::array();
  emerald_subs.push_back(std::move(leadership));
  emerald_subs.push_back(std::move(contributors));
  categories.push_back(category_json("Emerald Team", "/images/emerald_0.png",
                                     "credit-team", std::move(emerald_subs)));

  Json neo_studios_roles = Json::array();
  neo_studios_roles.push_back(role_json("Active Maintainer", {
                                                                 {"Huckle", "https://github.com/TheHuckleDev"},
                                                                 {"Andi_pog", "https://github.com/Andi-pog"},
                                                                 {"neoapps", "https://github.com/neoapps-dev"},
                                                                 {"tranqlmao", "https://github.com/tranqlmao"},
                                                             }));
  neo_studios_roles.push_back(
      role_json("Contributors", {
                                    {"Fireblade", "#"},
                                    {"Rockefeler", "#"},
                                    {"CDevJoud", "#"},
                                    {"Rhys Evolution", "#"},
                                    {"LordCambion", "https://github.com/LordCambion"},
                                }));
  Json minigames_roles = Json::array();
  minigames_roles.push_back(
      role_json("Founders", {
                                {"700", "#"},
                                {"DankMan01", "#"},
                            }));
  minigames_roles.push_back(
      role_json("Contributors", {
                                    {"xxxtentactcles", "#"},
                                    {"salad", "#"},
                                }));
  Json lmrp_projects = Json::array();
  lmrp_projects.push_back(project_json("neoStudios LCE", std::move(neo_studios_roles)));
  lmrp_projects.push_back(
      project_json("Minigames Division (LMRP)", std::move(minigames_roles)));

  Json legacy_roles = Json::array();
  legacy_roles.push_back(
      role_json("Founder", {
                               {"Piebot", "https://github.com/Piebot"},
                           }));
  Json legacy =
      subcategory_json("neoLegacy", "/images/neoLegacy.png", "", std::move(legacy_roles));
  legacy["subprojects"] = std::move(lmrp_projects);

  Json revived_roles = Json::array();
  revived_roles.push_back(role_json("Founder", {
                                                   {"BluTac10", "https://github.com/BluTac10"},
                                                   {"TheGrimReaper", "#"},
                                               }));
  Json revived = subcategory_json("360 Revived", "/images/360_revived.png", "",
                                  std::move(revived_roles));

  Json hellish_roles = Json::array();
  hellish_roles.push_back(
      role_json("Founder", {
                               {"DeadVoxelx", "https://github.com/DeadVoxelx"},
                           }));
  Json hellish = subcategory_json("Hellish Ends", "/images/hellishEndsIcon.png",
                                  "", std::move(hellish_roles));

  Json revelations_roles = Json::array();
  revelations_roles.push_back(
      role_json("Founder", {
                               {"Revela", "https://github.com/Revela"},
                           }));
  Json revelations = subcategory_json("Revelations", "/images/revelations.png",
                                      "", std::move(revelations_roles));

  Json lost_legacy_roles = Json::array();
  lost_legacy_roles.push_back(
      role_json("Founder", {{"SailsYT", "#"}}));
  Json lost_legacy = subcategory_json("Project Lost Legacy",
                                      "/images/lostlegacy.png", "",
                                      std::move(lost_legacy_roles));

  Json moon_roles = Json::array();
  moon_roles.push_back(
      role_json("Founder", {{"BlazinBlaze", "#"}}));
  Json moon = subcategory_json("Minecraft: Moon Edition", "/images/moonEdition.png",
                               "", std::move(moon_roles));

  Json lce_subs = Json::array();
  lce_subs.push_back(std::move(legacy));
  lce_subs.push_back(std::move(revived));
  lce_subs.push_back(std::move(hellish));
  lce_subs.push_back(std::move(revelations));
  lce_subs.push_back(std::move(lost_legacy));
  lce_subs.push_back(std::move(moon));
  categories.push_back(
      category_json("LCE TEAM", "", "credit-lce", std::move(lce_subs)));

  Json translation_roles = Json::array();
  translation_roles.push_back(role_json("", {
                                                {"dydymiku (French)", "#"},
                                                {"DimsMaybe/Hvrket (Russian)", "#"},
                                            }));
  Json translations = subcategory_json("Emerald Translations", "", "",
                                       std::move(translation_roles));

  Json booster_roles = Json::array();
  booster_roles.push_back(role_json("", {
                                            {"mr_anilex", "#"},
                                            {"faisal508508", "#"},
                                            {"dr.av", "#"},
                                            {"alreadywarned", "#"},
                                            {"andrewjcf", "#"},
                                            {"dille", "#"},
                                            {"neoapps", "#"},
                                        }));
  Json booster = subcategory_json("Discord Booster", "/images/Nitro Boost.png",
                                  "credit-booster", std::move(booster_roles));

  Json kofi_roles = Json::array();
  kofi_roles.push_back(role_json("", {
                                         {"faisal508508", "#"},
                                         {"HingedxHooligan", "#"},
                                     }));
  Json kofi = subcategory_json("Ko-fi Supporters", "/images/kofi_symbol.svg", "",
                               std::move(kofi_roles));

  Json thanks_subs = Json::array();
  thanks_subs.push_back(std::move(translations));
  thanks_subs.push_back(android_testers_json());
  thanks_subs.push_back(std::move(booster));
  thanks_subs.push_back(std::move(kofi));
  categories.push_back(category_json("SPECIAL THANKS", "", "credit-thanks",
                                     std::move(thanks_subs)));

  return categories;
}

Json CreditsView::data(const UiServices &) const {
  Json data = Json::object();
  data["credits"] = credits_;
  return data;
}

void CreditsView::on_enter() { credits_ = build_credits(); }

bool CreditsView::on_escape(UiServices &services) {
  if (services.audio != nullptr) {
    services.audio->play_press();
  }
  if (services.navigate) {
    services.navigate("home");
  }
  return true;
}
} // namespace emerald::ui