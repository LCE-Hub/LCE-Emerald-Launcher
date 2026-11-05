#pragma once
#include <cstdint>
#include <string>
#include <vector>
namespace emerald::ui {
bool rasterize_svg(const std::string &svg, std::vector<unsigned char> &rgba,
                   int &width, int &height);
} // namespace emerald::ui
