#include "Ui/ClickVfx.hpp"
#include "lazuli/Render/SdlRenderer.hpp"
#include <SDL3/SDL.h>
#include <algorithm>
#include <cmath>
#include <random>
#include <string_view>
#include <utility>
namespace emerald::ui {
void ClickVfx::press(float x, float y) {
  if (!enabled_) {
    return;
  }
  static std::mt19937 rng{std::random_device{}()};
  static const std::string_view glyphs = "abcdefghijklmnopqrstuvwxyz";
  std::uniform_real_distribution<float> velocity(-100.0F, 100.0F);
  std::uniform_real_distribution<float> spin(0.0F, 360.0F);
  for (int i = 0; i < 8; ++i) {
    ClickParticle particle;
    particle.image =
        "/images/sga_" + std::string(1, glyphs[rng() % glyphs.size()]) + ".png";
    particle.x = x;
    particle.y = y;
    particle.velocity_x = velocity(rng);
    particle.velocity_y = velocity(rng);
    particle.rotation = spin(rng);
    particle.spawned = SDL_GetTicks() / 1000.0;
    particles_.push_back(std::move(particle));
  }
}

void ClickVfx::draw(lazuli::SdlRenderer &renderer, double now) {
  if (!enabled_) {
    particles_.clear();
    return;
  }
  std::erase_if(particles_, [now](const ClickParticle &particle) {
    return now - particle.spawned >= 0.8;
  });
  for (const ClickParticle &particle : particles_) {
    draw_particle(renderer, particle, now);
  }
}

void ClickVfx::draw_particle(lazuli::SdlRenderer &renderer,
                             const ClickParticle &particle, double now) {
  SDL_Texture *texture = renderer.textures().load(particle.image);
  if (texture == nullptr) {
    return;
  }
  const double elapsed = std::clamp(now - particle.spawned, 0.0, 0.799);
  const float eased = static_cast<float>(1.0 - std::pow(1.0 - elapsed / 0.8, 3.0));
  const float size = 12.0F * (0.5F + 0.7F * eased);
  const float cx = particle.x + particle.velocity_x * eased;
  const float cy = particle.y + particle.velocity_y * eased;
  const float angle = particle.rotation * eased;
  const float alpha = std::clamp(1.0F - eased, 0.0F, 1.0F) * 255.0F;
  const float glow = size + 16.0F;
  const SDL_FPoint center{size * 0.5F, size * 0.5F};
  const SDL_FRect target{cx - size * 0.5F, cy - size * 0.5F, size, size};
  const SDL_FRect halo{cx - glow * 0.5F, cy - glow * 0.5F, glow, glow};
  SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_NEAREST);
  SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_ADD);
  SDL_SetTextureColorMod(texture, 180, 100, 255);
  SDL_SetTextureAlphaMod(texture, static_cast<uint8_t>(alpha * 0.9F));
  SDL_RenderTextureRotated(renderer.handle(), texture, nullptr, &halo, angle,
                           &center, SDL_FLIP_NONE);
  SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
  SDL_SetTextureColorMod(texture, 255, 255, 255);
  SDL_SetTextureAlphaMod(texture, static_cast<uint8_t>(alpha));
  SDL_RenderTextureRotated(renderer.handle(), texture, nullptr, &target, angle,
                           &center, SDL_FLIP_NONE);
}
} // namespace emerald::ui
