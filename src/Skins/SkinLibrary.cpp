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
      {"sillyguy", "Sillyguy", "/Skins/Sillyguy.png", false},
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
      {"miku", "dydymiku", "/Skins/miku.png", true},
      {"dapoglord", "DaPogLord", "/Skins/Toad.png", false}
  };
  return skins;
}

const std::vector<SavedCape> &default_capes() {
  static const std::vector<SavedCape> capes = {
      {"emerald", "Emerald Cape", "/Capes/Emerald_Cape.png"},
      {"4j", "4J Studios", "/Capes/4J.png"},
      {"neolegacycape", "neoCape", "/Capes/neolegacycape.png"},
      {"neolegacycontributorcape", "neoLegacy Contributor Cape", "/Capes/contributorcape.png"},
      {"neocape", "Alternative neoCape", "/Capes/NeoCape.png"},
      {"unused2", "Unused Cape 2", "/Capes/Unused_Cape_2.png"},
      {"he", "Hellish Ends Cape", "/Capes/HE-cape.png"},
      {"soul", "Undertale SOUL", "/Capes/undertale-soul.png"},
      {"mt", "Missing Texture", "/Capes/missing-texture.png"},
      {"minecon2016", "Minecon 2016", "/Capes/2016_cape.png"},
      {"minecon2011", "Minecon 2011", "/Capes/2011_cape.png"},
      {"15th", "15th Anniversary", "/Capes/15th.png"},
      {"pride", "Progress Pride", "/Capes/pride.png"},
      {"pride_trans", "Transgender Flag", "/Capes/trans.png"},
      {"mikasa", "Mikasa's Scarf", "/Capes/mikasa.png"},
      {"amd", "AMD", "/Capes/amd.png"},
      {"shield", "Shield", "/Capes/shield.png"},
      {"ipod", "iPod Classic 7th Gen 160GB", "/Capes/ipod.png"},
      {"360", "Minecraft: Xbox 360 Edition Cape", "/Capes/360_Cape.png"},
      {"ruby", "Ruby", "/Capes/RubyCape.png"},
      {"ntce", "NTCE Cape", "/Capes/NTCECAPE.png"},
      {"vice", "Vice Cape", "/Capes/ViceCape.png"},
  };
  return capes;
}
} // namespace emerald::skins
