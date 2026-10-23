// neo: i know this is a horrible way to do it but it works lol
#define REGISTER(name, class) views_[name] = std::make_unique<class>();
REGISTER("home", HomeView);
REGISTER("settings", SettingsView);
REGISTER("versions", VersionsView);
REGISTER("credits", CreditsView);
REGISTER("overlay", OverlayView);