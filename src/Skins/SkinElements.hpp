#pragma once
#include "Ui/Compat.hpp"
#include <cstddef>
#include <string>
namespace emerald::ui {
struct MousePoint {
  float x = 0.0F;
  float y = 0.0F;
  bool valid = false;
};

void note_logical_mouse(float x, float y);
MousePoint last_logical_mouse();
void register_skin_elements();
std::string truncate_middle(const std::string &value, std::size_t limit);
} // namespace emerald::ui
