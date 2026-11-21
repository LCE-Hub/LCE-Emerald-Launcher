#pragma once
#include <string>
#include <vector>
namespace lazuli {
class SdlRenderer;
}
namespace emerald::ui {
struct ClickParticle {
  std::string image;
  float x = 0.0F;
  float y = 0.0F;
  float velocity_x = 0.0F;
  float velocity_y = 0.0F;
  float rotation = 0.0F;
  double spawned = 0.0;
};

class ClickVfx {
public:
  void set_enabled(bool enabled) { enabled_ = enabled; }
  void press(float x, float y);
  void draw(lazuli::SdlRenderer &renderer, double now);

private:
  void draw_particle(lazuli::SdlRenderer &renderer,
                     const ClickParticle &particle, double now);
  bool enabled_ = true;
  std::vector<ClickParticle> particles_;
};
} // namespace emerald::ui
