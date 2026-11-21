#pragma once
#include "lazuli/UiSystem.hpp"
namespace emerald::ui {
class VersionsView;
void register_views(lazuli::UiSystem &ui,
                    VersionsView **versions_view = nullptr);
} // namespace emerald::ui
