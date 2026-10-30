#include "Skins/SkinLibrary.hpp"
namespace emerald::skins {
const std::vector<SavedSkin> &default_skins() {
  static const std::vector<SavedSkin> skins = {
      {"default", "Default Steve", "/images/Default.png", false},
      {"neoapps", "neoapps", "/Skins/neoapps.png", false},
      {"justneki", "JustNeki", "/Skins/JustNeki.png", false},
      {"kayjann", "KayJann", "/Skins/KayJann.png", false},
      {"leon", "Leon", "/Skins/Leon.png", false},
      {"mr_anilex", "mr_anilex", "/Skins/mr_anilex.png", false},
      {"peter", "Peter", "/Skins/Peter.png", false},
      {"piebot", "piebot", "/Skins/piebot.png", false},
      {"kowhaifan", "Kowhaifan", "/Skins/kowhaifan.png", false},
      {"striker", "str1k3r", "/Skins/str1k3r.png", true},
      {"bytebukkit", "ByteBukkit", "/Skins/byte.png", false},
      {"andipog", "Andi_Pog", "/Skins/andi.png", false},
      {"sevenhundred", "700", "/Skins/700.png", false},
      {"prismachunk0", "XeroChunks", "/Skins/PrismaChunk0.png", false},
      {"amy", "Amy", "/Skins/amy.png", true},
      {"avalilac", "AvaLilac", "/Skins/ava.png", true},
      {"huckle", "Huckle", "/Skins/huckle.png", true},
      {"counterract", "CounterrAct", "/Skins/counterr.png", true},
      {"tranqlmao", "Tranq", "/Skins/tranq.png", true},
      {"individul", "individul", "/Skins/individul.png", false},
      {"ency", "ency_pt", "/Skins/ency.png", true},
      {"teto", "Sails", "/Skins/sails.png", true},
      {"miku", "dydymiku", "/Skins/miku.png", true}
  };
  return skins;
}

const std::vector<SavedCape> &default_capes() {
  static const std::vector<SavedCape> capes = {
      {"4j", "4J Studios", "/Capes/4J.png"},
      {"unused2", "Unused Cape 2", "/Capes/Unused_Cape_2.png"},
  };
  return capes;
}
} // namespace emerald::skins
