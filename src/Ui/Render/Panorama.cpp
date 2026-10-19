#include "Ui/Render/Panorama.hpp"
#include "Ui/RenderContext.hpp"
#include <cmath>
namespace emerald::ui {
namespace {
constexpr double kLoopSeconds = 140.0;
}

void Panorama::set_source(std::string source) {
  if (source == source_) {
    return;
  }
  source_ = std::move(source);
  started_ = false;
}

void Panorama::render(RenderContext &context, const Rect &viewport) {
  if (source_.empty() || viewport.width <= 0.0F || viewport.height <= 0.0F) {
    return;
  }
  const Size size = context.image_size(source_);
  if (size.width <= 0.0F || size.height <= 0.0F) {
    return;
  }
  const float tile_width = viewport.height * (size.width / size.height);
  if (tile_width <= 0.0F) {
    return;
  }

  const auto now = std::chrono::steady_clock::now();
  if (!started_) {
    start_ = now;
    started_ = true;
  }
  const double elapsed = std::chrono::duration<double>(now - start_).count();
  const double stepped = std::floor(elapsed * 30.0) / 30.0;
  const double progress = std::fmod(stepped / kLoopSeconds, 1.0);
  const float offset = static_cast<float>(progress) * tile_width;
  for (float x = -offset; x < viewport.width; x += tile_width) {
    context.draw_image(
        source_, Rect{viewport.x + x, viewport.y, tile_width, viewport.height});
  }
  context.fill_rect(viewport, Color{0, 0, 0, 89});
}

} // namespace emerald::ui
