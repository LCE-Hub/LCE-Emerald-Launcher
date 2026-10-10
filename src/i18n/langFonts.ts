import i18n from "i18next";
const LANG_FONTS: Record<string, string> = {
  ru: "/fonts/rus/minecraft.ttf",
};

const BASE_FONT = '"Mojangles", monospace';
let loadedLangKey: string | null = null;
function applyLangFont(lang: string) {
  const root = document.documentElement;
  const key = lang.split("-")[0];
  if (loadedLangKey) {
    const old = document.querySelector(
      `style[data-lang-font="${loadedLangKey}"]`,
    );
    if (old) old.remove();
    loadedLangKey = null;
  }

  const fontPath = LANG_FONTS[key];
  if (!fontPath) {
    root.style.setProperty("--font-base", BASE_FONT);
    return;
  }

  const family = `"${key}-lang"`;
  loadedLangKey = key;
  const style = document.createElement("style");
  style.dataset.langFont = key;
  style.textContent = `@font-face { font-family: ${family}; src: url("${fontPath}") format("truetype"); font-weight: normal; font-style: normal; }`;
  document.head.appendChild(style);
  root.style.setProperty("--font-base", `${family}, ${BASE_FONT}`);
}

i18n.on("languageChanged", applyLangFont);
export { LANG_FONTS, applyLangFont };
