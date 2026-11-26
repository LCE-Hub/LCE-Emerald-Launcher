#pragma once
#include "lazuli/UiSystem.hpp"
namespace emerald::ui {
class VersionsView;
class WorkshopView;
void register_views(lazuli::UiSystem &ui,
                    VersionsView **versions_view = nullptr,
                    WorkshopView **workshop_view = nullptr);
} // namespace emerald::ui
