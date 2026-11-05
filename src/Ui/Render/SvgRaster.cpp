#include "Ui/Render/SvgRaster.hpp"
#define NANOSVG_IMPLEMENTATION
#include "nanosvg.h"
#define NANOSVGRAST_IMPLEMENTATION
#include "nanosvgrast.h"
#include <cstdlib>
namespace emerald::ui {
bool rasterize_svg(const std::string &svg, std::vector<unsigned char> &rgba,
                   int &width, int &height) {
  if (svg.empty()) {
    return false;
  }
  std::vector<char> buffer(svg.begin(), svg.end());
  buffer.push_back('\0');
  NSVGimage *image = nsvgParse(buffer.data(), "px", 96.0F);
  if (image == nullptr) {
    return false;
  }
  width = static_cast<int>(image->width + 0.5F);
  height = static_cast<int>(image->height + 0.5F);
  if (width <= 0 || height <= 0) {
    nsvgDelete(image);
    return false;
  }
  NSVGrasterizer *rasterizer = nsvgCreateRasterizer();
  if (rasterizer == nullptr) {
    nsvgDelete(image);
    return false;
  }
  rgba.assign(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) *
                   4U,
              0U);
  nsvgRasterize(rasterizer, image, 0.0F, 0.0F, 1.0F, rgba.data(), width, height,
                width * 4);
  nsvgDeleteRasterizer(rasterizer);
  nsvgDelete(image);
  return true;
}
} // namespace emerald::ui
