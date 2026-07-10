import { useEffect, memo, useState } from "react";
import { motion } from "framer-motion";
import { useUI, useAudio } from "../../context/LauncherContext";

interface CreditCategory {
  category: string;
  icon?: string;
  subcategories: {
    name: string;
    icon: string;
    roles: {
      role: string;
      members: {
        name: string;
        url: string;
      }[];
    }[];
    subprojects?: {
      name: string;
      roles: {
        role: string;
        members: {
          name: string;
          url: string;
        }[];
      }[];
    }[];
  }[];
}

const CreditsView = memo(function CreditsView() {
  const { setActiveView } = useUI();
  const { playPressSound } = useAudio();
  const [isHovered, setIsHovered] = useState(false);

  const credits: CreditCategory[] = [
    {
      category: "Emerald Team",
      icon: "/images/emerald_0.png",
      subcategories: [
        {
          name: "Leadership",
          icon: "",
          roles: [
            {
              role: "Founder & Maintainer",
              members: [
                { name: "KayJann", url: "https://github.com/KayJannOnGit" },
              ],
            },
            {
              role: "Active Maintainer",
              members: [
                { name: "neoapps", url: "https://github.com/neoapps-dev" },
              ],
            },
          ],
        },
        {
          name: "Contributors",
          icon: "",
          roles: [
            {
              role: "",
              members: [
                {
                  name: "Santiago Fisela",
                  url: "https://github.com/PinkLittleKitty",
                },
                { name: "Leon", url: "https://github.com/hornyalcoholic" },
                { name: "Criador_Mods", url: "https://github.com/CriadorMods" },
              ],
            },
          ],
        },
      ],
    },
    {
      category: "LCE TEAM",
      subcategories: [
        {
          name: "neoLegacy",
          icon: "/images/neoLegacy.png",
          roles: [
            {
              role: "Founder",
              members: [{ name: "Piebot", url: "https://github.com/Piebot" }],
            },
          ],
          subprojects: [
            {
              name: "neoStudios LCE",
              roles: [
                {
                  role: "Active Maintainer",
                  members: [
                    { name: "Huckle", url: "https://github.com/TheHuckleDev" },
                    { name: "Andi_pog", url: "https://github.com/Andi-pog" },
                    {
                      name: "LordCambion",
                      url: "https://github.com/LordCambion",
                    },
                    { name: "neoapps", url: "https://github.com/neoapps-dev" },
                    { name: "tranqlmao", url: "https://github.com/tranqlmao" },
                  ],
                },
                {
                  role: "Contributors",
                  members: [
                    { name: "Fireblade", url: "#" },
                    { name: "Rockefeler", url: "#" },
                    { name: "CDevJoud", url: "#" },
                    { name: "Rhys Evolution", url: "#" },
                  ],
                },
              ],
            },
            {
              name: "Minigames Division (LMRP)",
              roles: [
                {
                  role: "Founders",
                  members: [
                    { name: "700", url: "#" },
                    { name: "DankMan01", url: "#" },
                  ],
                },
                {
                  role: "Contributors",
                  members: [
                    { name: "xxxtentactcles", url: "#" },
                    { name: "salad", url: "#" },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: "360 Revived",
          icon: "/images/360_revived.png",
          roles: [
            {
              role: "Founder",
              members: [
                { name: "BluTac10", url: "https://github.com/BluTac10" },
                { name: "TheGrimReaper", url: "#" },
              ],
            },
          ],
        },
        {
          name: "Hellish Ends",
          icon: "/images/hellishEndsIcon.png",
          roles: [
            {
              role: "Founder",
              members: [
                { name: "DeadVoxelx", url: "https://github.com/DeadVoxelx" },
              ],
            },
          ],
        },
        {
          name: "Revelations",
          icon: "/images/revelations.png",
          roles: [
            {
              role: "Founder",
              members: [{ name: "Revela", url: "https://github.com/Revela" }],
            },
          ],
        },
        {
          name: "Portable LCE",
          icon: "",
          roles: [
            {
              role: "Founder",
              members: [{ name: "TBD", url: "#" }],
            },
          ],
        },
        {
          name: "Minecraft: Moon Edition",
          icon: "/images/moonEdition.png",
          roles: [
            {
              role: "Founder",
              members: [{ name: "BlazinBlaze", url: "#" }],
            },
          ],
        },
      ],
    },
    {
      category: "SPECIAL THANKS",
      icon: "",
      subcategories: [
        {
          name: "Discord Booster",
          icon: "/images/Nitro Boost.png",
          roles: [
            {
              role: "",
              members: [
                { name: "mr_anilex", url: "#" },
                { name: "faisal508508", url: "#" },
                { name: "dr.av", url: "#" },
                { name: "alreadywarned", url: "#" },
                { name: "andrewjcf", url: "#" },
                { name: "dille", url: "#" },
              ],
            },
          ],
        },
        {
          name: "Ko-fi Supporters",
          icon: "/images/kofi_symbol.svg",
          roles: [
            {
              role: "",
              members: [{ name: "faisal508508", url: "#" }],
            },
          ],
        },
      ],
    },
  ];

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") return;
      if (e.key === "Escape") {
        playPressSound();
        setActiveView("main");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [setActiveView, playPressSound]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <button
        onClick={() => {
          playPressSound();
          setActiveView("main");
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed bottom-8 left-8 z-50 h-10 flex items-center justify-center gap-2 px-4 text-xl mc-text-shadow outline-none border-none"
        style={{
          backgroundImage: isHovered
            ? "url('/images/button_highlighted.png')"
            : "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
          color: isHovered ? "#FFFF55" : "white",
        }}
      >
        Back to Menu
      </button>

      <motion.div
        initial={{ y: "50%" }}
        animate={{ y: "-200%" }}
        transition={{ duration: 45, ease: "linear" }}
        className="flex flex-col items-center justify-center space-y-8 py-20"
      >
        <div className="mb-8">
          <img
            src="/images/emerald_launcher.png"
            alt="Emerald Launcher"
            className="h-20"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
        {credits.map((cat) => (
          <div key={cat.category} className="flex flex-col items-center gap-6">
            <h2
              className={`text-3xl font-bold mc-text-shadow uppercase tracking-wider text-center flex items-center gap-3 ${
                cat.category === "LCE TEAM"
                  ? "text-[#9B59B6]"
                  : cat.category === "SPECIAL THANKS"
                    ? "text-[#FFD700]"
                    : "text-[#50C878]"
              }`}
              style={{ textShadow: "2px 2px 0px #000000" }}
            >
              {cat.icon && (
                <img
                  src={cat.icon}
                  alt={cat.category}
                  className="w-10 h-10 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              {cat.category}
            </h2>
            <div className="flex flex-col items-center gap-4">
              {cat.subcategories.map((sub) => (
                <div
                  key={sub.name}
                  className="flex flex-col items-center gap-3"
                >
                  <h3
                    className={`text-2xl mc-text-shadow uppercase tracking-wide text-center flex items-center gap-3 ${
                      sub.name === "Discord Booster"
                        ? "text-[#FF69B4]"
                        : "text-white/90"
                    }`}
                  >
                    {sub.icon && (
                      <img
                        src={sub.icon}
                        alt={sub.name}
                        className="w-8 h-8 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    )}
                    {sub.name}
                  </h3>
                  <div className="flex flex-col items-center gap-2">
                    {sub.roles.map((role) => (
                      <div
                        key={role.role}
                        className="flex flex-col items-center gap-2"
                      >
                        {role.role && (
                          <h4 className="text-white/70 text-lg mc-text-shadow uppercase tracking-wide text-center">
                            {role.role}
                          </h4>
                        )}
                        <div className="flex flex-col items-center gap-2">
                          {role.members.map((member) => (
                            <a
                              key={member.name}
                              href={member.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#e2cc4c] text-2xl mc-text-shadow font-medium cursor-pointer"
                              style={{ textShadow: "2px 2px 0px #000000" }}
                            >
                              {member.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                    {sub.subprojects && sub.subprojects.length > 0 && (
                      <div className="flex flex-col items-center gap-3 mt-4">
                        {sub.subprojects.map((project) => (
                          <div
                            key={project.name}
                            className="flex flex-col items-center gap-2"
                          >
                            <h4 className="text-white/60 text-lg mc-text-shadow uppercase tracking-wide text-center">
                              {project.name}
                            </h4>
                            {project.roles.map((role) => (
                              <div
                                key={role.role}
                                className="flex flex-col items-center gap-2"
                              >
                                {role.role && (
                                  <h5 className="text-white/50 text-base mc-text-shadow uppercase tracking-wide text-center">
                                    {role.role}
                                  </h5>
                                )}
                                <div className="flex flex-col items-center gap-2">
                                  {role.members.map((member) => (
                                    <a
                                      key={member.name}
                                      href={member.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#e2cc4c] text-xl mc-text-shadow font-medium cursor-pointer"
                                      style={{
                                        textShadow: "2px 2px 0px #000000",
                                      }}
                                    >
                                      {member.name}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-row items-center justify-center gap-6 mt-12">
          <div className="bg-white rounded-xl p-3 shadow-2xl w-64">
            <img
              src="/images/LCE Team.png"
              alt="LCE Team"
              className="w-full h-auto object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div className="bg-white rounded-xl p-3 shadow-2xl w-64">
            <img
              src="/images/emerald_block.png"
              alt="Emerald"
              className="w-full h-auto object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 mt-8">
          <p className="text-white/60 text-sm mc-text-shadow text-center uppercase tracking-wider">
            Minecraft is a trademark of Mojang Synergies AB. This project is not
            affiliated with, endorsed by, sponsored by, or specifically approved
            by Mojang, Microsoft, or 4J Studios.
          </p>
        </div>
      </motion.div>
    </div>
  );
});

export default CreditsView;