#pragma once
#include "Skins/SkinAssets.hpp"
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
namespace emerald::skins {
struct SkinVec3 {
  float x = 0.0F;
  float y = 0.0F;
  float z = 0.0F;
};

struct SkinMat3 {
  float m[9] = {1.0F, 0.0F, 0.0F, 0.0F, 1.0F, 0.0F, 0.0F, 0.0F, 1.0F};
  SkinVec3 apply(const SkinVec3 &v) const {
    return {m[0] * v.x + m[1] * v.y + m[2] * v.z,
            m[3] * v.x + m[4] * v.y + m[5] * v.z,
            m[6] * v.x + m[7] * v.y + m[8] * v.z};
  }
};

struct SkinUv {
  float rect[6][4];
};

struct SkinFace {
  float corners[4][3] = {{0.0F, 0.0F, 0.0F}, {0.0F, 0.0F, 0.0F},
                         {0.0F, 0.0F, 0.0F}, {0.0F, 0.0F, 0.0F}};
  float normal[3] = {0.0F, 0.0F, 1.0F};
  float uv_rect[4] = {0.0F, 0.0F, 1.0F, 1.0F};
  bool flip_x = false;
  bool flip_y = false;
  const RgbaImage *texture = nullptr;
  std::optional<PixelColor> solid_color;
  float alpha_test = 0.5F;
  bool easter_egg = false;
};

struct RenderedSkin {
  int width = 0;
  int height = 0;
  std::vector<std::uint8_t> rgba;
};

struct SnapshotOptions {
  std::string src;
  bool slim = false;
  std::string cape;
  int width = 0;
  int height = 0;
  bool head_only = false;
  bool cape_only = false;
};

bool render_skin_snapshot(const SnapshotOptions &options,
                          const std::filesystem::path &public_root,
                          RenderedSkin &out);

enum class ModelStyle { Snapshot, Viewer, Editor, CapeOnly };
class LiveSkinModel {
public:
  bool load(const std::string &source, bool slim, const std::string &cape,
            const std::filesystem::path &public_root,
            ModelStyle style = ModelStyle::Snapshot, bool cape_only = false);
  bool load_from_images(const RgbaImage &skin,
                        const std::optional<RgbaImage> &cape, bool slim,
                        ModelStyle style, bool cape_only);
  bool loaded() const { return loaded_; }
  void build_head_only();
  void set_delta_rotation(float rot_y_delta, float rot_x_delta, bool clamp_x) {
    rotation_y_ += rot_y_delta;
    rotation_x_ += rot_x_delta;
    if (clamp_x) {
      if (rotation_x_ > 0.6F) {
        rotation_x_ = 0.6F;
      }
      if (rotation_x_ < -0.6F) {
        rotation_x_ = -0.6F;
      }
    }
  }
  void set_rotation(float rotation_y, float rotation_x) {
    rotation_y_ = rotation_y;
    rotation_x_ = rotation_x;
  }
  void set_camera_z(float z) { camera_z_ = z; }
  void set_ears_visible(bool visible) { ears_visible_ = visible; }
  void set_flip(bool flip) { flip_ = flip; }
  float rotation_x() const { return rotation_x_; }
  float rotation_y() const { return rotation_y_; }
  float camera_z() const { return camera_z_; }
  bool flip() const { return flip_; }
  RenderedSkin render(int width, int height, float animate_delta = 0.0F);

private:
  void build_player(bool slim);
  void add_part(const SkinUv &uv, const SkinUv *overlay_uv,
                const SkinVec3 &position, float w, float h, float d,
                bool legacy);
  void add_cape(const RgbaImage &texture);
  void emit_box(const SkinVec3 &center, const SkinMat3 &part_rotation, float w,
                float h, float d, const SkinUv *rect, const int rect_indices[6],
                bool mirror_base, bool invert_back_face,
                const RgbaImage *texture,
                const std::optional<PixelColor> &solid_color, bool easter_egg);

  RgbaImage skin_;
  std::optional<RgbaImage> cape_;
  std::vector<SkinFace> faces_;
  bool loaded_ = false;
  bool ears_present_ = false;
  bool ears_visible_ = false;
  bool flip_ = false;
  float rotation_y_ = 0.3F;
  float rotation_x_ = 0.0F;
  float camera_z_ = 68.0F;
  ModelStyle style_ = ModelStyle::Viewer;
};
} // namespace emerald::skins
