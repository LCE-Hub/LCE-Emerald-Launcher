#include "Ui/AppViews.hpp"
#include "Ui/View.hpp"
#include "Ui/Views/CreditsView.hpp"
#include "Ui/Views/GoldMapperView.hpp"
#include "Ui/Views/HomeView.hpp"
#include "Ui/Views/LceOnlineView.hpp"
#include "Ui/Views/OverlayView.hpp"
#include "Ui/Views/SettingsView.hpp"
#include "Ui/Views/SkinEditorView.hpp"
#include "Ui/Views/SkinsView.hpp"
#include "Ui/Views/VersionsView.hpp"
#include "Ui/Views/WorkshopView.hpp"
namespace emerald::ui {
void register_views(lazuli::UiSystem &ui, VersionsView **versions_view,
                    WorkshopView **workshop_view) {
  ui.register_screen(std::make_unique<HomeView>());
  ui.register_screen(std::make_unique<SettingsView>());
  auto versions = std::make_unique<VersionsView>();
  if (versions_view != nullptr) {
    *versions_view = versions.get();
  }
  ui.register_screen(std::move(versions));
  ui.register_screen(std::make_unique<CreditsView>());
  ui.register_screen(std::make_unique<SkinsView>());
  ui.register_screen(std::make_unique<SkinEditorView>());
  ui.register_screen(std::make_unique<GoldMapperView>());
  ui.register_screen(std::make_unique<LceOnlineView>());
  auto workshop = std::make_unique<WorkshopView>();
  if (workshop_view != nullptr) {
    *workshop_view = workshop.get();
  }
  ui.register_screen(std::move(workshop));
  ui.register_screen(std::make_unique<OverlayView>());
}
} // namespace emerald::ui
