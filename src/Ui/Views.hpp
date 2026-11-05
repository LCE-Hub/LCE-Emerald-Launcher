#ifndef _NONIMPORT
#include "Ui/Views/CreditsView.hpp"
#include "Ui/Views/HomeView.hpp"
#include "Ui/Views/OverlayView.hpp"
#include "Ui/Views/SettingsView.hpp"
#include "Ui/Views/SkinEditorView.hpp"
#include "Ui/Views/SkinsView.hpp"
#include "Ui/Views/VersionsView.hpp"
#endif
#ifdef _NONIMPORT
// neo: i know this is a horrible way to do it but it works lol
#define REGISTER(name, class) views_[name] = std::make_unique<class>();
REGISTER("home", HomeView);
REGISTER("settings", SettingsView);
REGISTER("versions", VersionsView);
REGISTER("credits", CreditsView);
REGISTER("skins", SkinsView);
REGISTER("skineditor", SkinEditorView);
REGISTER("overlay", OverlayView);
#endif
