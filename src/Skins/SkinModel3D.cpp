#include "Skins/SkinModel3D.hpp"
#include <algorithm>
#include <cmath>
#include <map>
#include <mutex>
#include <utility>
namespace emerald::skins {
namespace {
constexpr float kPi = 3.14159265358979323846F; //neo: i had to google that
SkinVec3 add(const SkinVec3 &a, const SkinVec3 &b) {
  return {a.x + b.x, a.y + b.y, a.z + b.z};
}
SkinVec3 sub(const SkinVec3 &a, const SkinVec3 &b) {
  return {a.x - b.x, a.y - b.y, a.z - b.z};
}
SkinVec3 scale_v(const SkinVec3 &a, float factor) {
  return {a.x * factor, a.y * factor, a.z * factor};
}
float dot_v(const SkinVec3 &a, const SkinVec3 &b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
SkinVec3 cross_v(const SkinVec3 &a, const SkinVec3 &b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z,
          a.x * b.y - a.y * b.x};
}
SkinVec3 normalized_v(const SkinVec3 &a) {
  const float size = std::sqrt(dot_v(a, a));
  return size > 1e-9F ? scale_v(a, 1.0F / size) : SkinVec3{};
}

SkinMat3 multiply(const SkinMat3 &a, const SkinMat3 &b) {
  SkinMat3 r;
  for (int row = 0; row < 3; ++row) {
    for (int column = 0; column < 3; ++column) {
      r.m[row * 3 + column] = a.m[row * 3] * b.m[column] +
                              a.m[row * 3 + 1] * b.m[3 + column] +
                              a.m[row * 3 + 2] * b.m[6 + column];
    }
  }
  return r;
}

SkinMat3 axis_rotation_x(float angle) {
  const float c = std::cos(angle);
  const float s = std::sin(angle);
  SkinMat3 r;
  r.m[4] = c;
  r.m[5] = -s;
  r.m[7] = s;
  r.m[8] = c;
  return r;
}

SkinMat3 axis_rotation_y(float angle) {
  const float c = std::cos(angle);
  const float s = std::sin(angle);
  SkinMat3 r;
  r.m[0] = c;
  r.m[2] = s;
  r.m[6] = -s;
  r.m[8] = c;
  return r;
}

struct Camera {
  float fov = 35.0F;
  SkinVec3 eye;
  SkinVec3 target;
  SkinVec3 up{0.0F, 1.0F, 0.0F};
  int width = 1;
  int height = 1;
};

float face_shade(float normal_y, const SkinVec3 &normal) {
  const float t = 0.5F + 0.5F * normal_y;
  const float hemisphere = 0.6F * (0.44F * (1.0F - t) + t);
  return 0.4F + hemisphere;
}

void srgb_shaded(std::uint8_t channel, float shade, std::uint8_t &out) {
  out = static_cast<std::uint8_t>(
      std::clamp(channel / 255.0F * shade, 0.0F, 1.0F) * 255.0F + 0.5F);
}

void sample_texture(const RgbaImage &texture, float rect_x, float rect_y,
                    float rect_w, float rect_h, bool flip_x, bool flip_y,
                    float u, float v, std::uint8_t out[4]) {
  const float source_u =
      flip_x ? rect_x + rect_w * (1.0F - u) : rect_x + rect_w * u;
  const float source_v =
      flip_y ? rect_y + rect_h * v : rect_y + rect_h * (1.0F - v);
  const int px = std::clamp(static_cast<int>(source_u), 0, texture.width - 1);
  const int py = std::clamp(static_cast<int>(source_v), 0, texture.height - 1);
  const std::size_t index =
      (static_cast<std::size_t>(py) * static_cast<std::size_t>(texture.width) +
       static_cast<std::size_t>(px)) *
      4;
  out[0] = texture.pixels[index];
  out[1] = texture.pixels[index + 1];
  out[2] = texture.pixels[index + 2];
  out[3] = texture.pixels[index + 3];
}

void face_color(const SkinFace &face, float u, float v, float shade,
                std::uint8_t out[4]) {
  if (face.solid_color.has_value()) {
    const PixelColor &color = *face.solid_color;
    srgb_shaded(color.r, shade, out[0]);
    srgb_shaded(color.g, shade, out[1]);
    srgb_shaded(color.b, shade, out[2]);
    out[3] = color.a;
    return;
  }
  std::uint8_t texel[4];
  sample_texture(*face.texture, face.uv_rect[0], face.uv_rect[1],
                 face.uv_rect[2], face.uv_rect[3], face.flip_x, face.flip_y,
                 u, v, texel);
  srgb_shaded(texel[0], shade, out[0]);
  srgb_shaded(texel[1], shade, out[1]);
  srgb_shaded(texel[2], shade, out[2]);
  out[3] = texel[3];
}

void rasterize_face(RenderedSkin &target, std::vector<float> &depth,
                    const SkinFace &face, const SkinMat3 &rotation,
                    const SkinVec3 &group_offset, bool flip_y_axis,
                    const Camera &camera) {
  SkinVec3 face_normal =
      rotation.apply(SkinVec3{face.normal[0], face.normal[1], face.normal[2]});
  SkinVec3 world[4];
  for (int i = 0; i < 4; ++i) {
    SkinVec3 local{face.corners[i][0], face.corners[i][1], face.corners[i][2]};
    if (flip_y_axis) {
      local.y = -local.y;
    }
    world[i] = add(rotation.apply(local), group_offset);
  }
  if (flip_y_axis) {
    face_normal.y = -face_normal.y;
  }
  SkinVec3 face_center{};
  for (int i = 0; i < 4; ++i) {
    face_center = add(face_center, world[i]);
  }
  face_center = scale_v(face_center, 0.25F);
  if (dot_v(face_normal, sub(camera.eye, face_center)) <= 0.0F) {
    return;
  }

  const float shade = face_shade(face_normal.y, face_normal);
  const float aspect =
      static_cast<float>(camera.width) / static_cast<float>(camera.height);
  const float tan_half = std::tan(camera.fov * kPi / 360.0F);
  const SkinVec3 forward = normalized_v(sub(camera.target, camera.eye));
  SkinVec3 up_axis = camera.up;
  if (std::abs(dot_v(forward, up_axis)) > 0.999F) {
    up_axis = SkinVec3{0.0F, 0.0F, -1.0F};
  }
  const SkinVec3 right = normalized_v(cross_v(forward, up_axis));
  const SkinVec3 up = cross_v(right, forward);
  float screen_x[4];
  float screen_y[4];
  float inv_z[4];
  bool visible = true;
  for (int i = 0; i < 4; ++i) {
    const SkinVec3 eye_space = sub(world[i], camera.eye);
    const float ex = dot_v(eye_space, right);
    const float ey = dot_v(eye_space, up);
    const float ez = dot_v(eye_space, forward);
    if (ez < 0.01F) {
      visible = false;
      break;
    }
    const float x_ndc = (ex / ez) / (tan_half * aspect);
    const float y_ndc = (ey / ez) / tan_half;
    screen_x[i] = (x_ndc * 0.5F + 0.5F) * static_cast<float>(camera.width);
    screen_y[i] =
        (1.0F - (y_ndc * 0.5F + 0.5F)) * static_cast<float>(camera.height);
    inv_z[i] = 1.0F / ez;
  }
  if (!visible) {
    return;
  }

  const float corner_u[4] = {0.0F, 1.0F, 1.0F, 0.0F};
  const float corner_v[4] = {0.0F, 0.0F, 1.0F, 1.0F};
  const int min_x = std::max(
      0, static_cast<int>(std::floor(std::min(
             std::min(screen_x[0], screen_x[1]),
             std::min(screen_x[2], screen_x[3])))));
  const int max_x = std::min(
      target.width - 1,
      static_cast<int>(std::ceil(std::max(
          std::max(screen_x[0], screen_x[1]),
          std::max(screen_x[2], screen_x[3])))));
  const int min_y = std::max(
      0, static_cast<int>(std::floor(std::min(
             std::min(screen_y[0], screen_y[1]),
             std::min(screen_y[2], screen_y[3])))));
  const int max_y = std::min(
      target.height - 1,
      static_cast<int>(std::ceil(std::max(
          std::max(screen_y[0], screen_y[1]),
          std::max(screen_y[2], screen_y[3])))));
  if (min_x > max_x || min_y > max_y) {
    return;
  }

  for (int triangle = 0; triangle < 2; ++triangle) {
    const int index_a = 0;
    const int index_b = triangle == 0 ? 1 : 2;
    const int index_c = triangle == 0 ? 2 : 3;
    const float denominator = (screen_y[index_b] - screen_y[index_c]) *
                                  (screen_x[index_a] - screen_x[index_c]) +
                              (screen_x[index_c] - screen_x[index_b]) *
                                  (screen_y[index_a] - screen_y[index_c]);
    if (std::abs(denominator) < 1e-9F) {
      continue;
    }
    for (int y = min_y; y <= max_y; ++y) {
      for (int x = min_x; x <= max_x; ++x) {
        const float px = static_cast<float>(x) + 0.5F;
        const float py = static_cast<float>(y) + 0.5F;
        const float w0 = ((screen_y[index_b] - screen_y[index_c]) *
                              (px - screen_x[index_c]) +
                          (screen_x[index_c] - screen_x[index_b]) *
                              (py - screen_y[index_c])) /
                         denominator;
        const float w1 = ((screen_y[index_c] - screen_y[index_a]) *
                              (px - screen_x[index_c]) +
                          (screen_x[index_a] - screen_x[index_c]) *
                              (py - screen_y[index_c])) /
                         denominator;
        const float w2 = 1.0F - w0 - w1;
        if (w0 < 0.0F || w1 < 0.0F || w2 < 0.0F) {
          continue;
        }
        const int indices[3] = {index_a, index_b, index_c};
        const float weights[3] = {w0, w1, w2};
        float denominator_z = 0.0F;
        float u_interpolated = 0.0F;
        float v_interpolated = 0.0F;
        for (int k = 0; k < 3; ++k) {
          const float corrected = weights[k] * inv_z[indices[k]];
          denominator_z += corrected;
          u_interpolated += corner_u[indices[k]] * corrected;
          v_interpolated += corner_v[indices[k]] * corrected;
        }
        if (denominator_z <= 0.0F) {
          continue;
        }
        const float ez = 1.0F / denominator_z;
        const float u = u_interpolated / denominator_z;
        const float v = v_interpolated / denominator_z;
        const std::size_t pixel_index =
            static_cast<std::size_t>(y) *
                static_cast<std::size_t>(target.width) +
            static_cast<std::size_t>(x);
        if (ez > depth[pixel_index]) {
          continue;
        }
        std::uint8_t texel[4];
        face_color(face, u, v, shade, texel);
        if (texel[3] / 255.0F < face.alpha_test) {
          continue;
        }
        depth[pixel_index] = ez;
        const std::size_t offset = pixel_index * 4;
        target.rgba[offset] = texel[0];
        target.rgba[offset + 1] = texel[1];
        target.rgba[offset + 2] = texel[2];
        target.rgba[offset + 3] = texel[3];
      }
    }
  }
}

SkinVec3 bbox_center(const std::vector<SkinFace> &faces, float &max_dim) {
  float min_x = 1e30F;
  float min_y = 1e30F;
  float min_z = 1e30F;
  float max_x = -1e30F;
  float max_y = -1e30F;
  float max_z = -1e30F;
  for (const SkinFace &face : faces) {
    for (int corner = 0; corner < 4; ++corner) {
      min_x = std::min(min_x, face.corners[corner][0]);
      min_y = std::min(min_y, face.corners[corner][1]);
      min_z = std::min(min_z, face.corners[corner][2]);
      max_x = std::max(max_x, face.corners[corner][0]);
      max_y = std::max(max_y, face.corners[corner][1]);
      max_z = std::max(max_z, face.corners[corner][2]);
    }
  }
  if (max_x < min_x) {
    max_dim = 1.0F;
    return {};
  }
  max_dim = std::max(std::max(max_x - min_x, max_y - min_y), max_z - min_z);
  return SkinVec3{(min_x + max_x) * 0.5F, (min_y + max_y) * 0.5F,
                  (min_z + max_z) * 0.5F};
}

SkinUv head_uv() {
  return SkinUv{{{8.0F, 0.0F, 8.0F, 8.0F},
                 {16.0F, 0.0F, 8.0F, 8.0F},
                 {0.0F, 8.0F, 8.0F, 8.0F},
                 {8.0F, 8.0F, 8.0F, 8.0F},
                 {16.0F, 8.0F, 8.0F, 8.0F},
                 {24.0F, 8.0F, 8.0F, 8.0F}}};
}

SkinUv hat_uv() {
  return SkinUv{{{40.0F, 0.0F, 8.0F, 8.0F},
                 {48.0F, 0.0F, 8.0F, 8.0F},
                 {32.0F, 8.0F, 8.0F, 8.0F},
                 {40.0F, 8.0F, 8.0F, 8.0F},
                 {48.0F, 8.0F, 8.0F, 8.0F},
                 {56.0F, 8.0F, 8.0F, 8.0F}}};
}

SkinUv body_uv() {
  return SkinUv{{{20.0F, 16.0F, 8.0F, 4.0F},
                 {28.0F, 16.0F, 8.0F, 4.0F},
                 {16.0F, 20.0F, 4.0F, 12.0F},
                 {20.0F, 20.0F, 8.0F, 12.0F},
                 {28.0F, 20.0F, 4.0F, 12.0F},
                 {32.0F, 20.0F, 8.0F, 12.0F}}};
}

SkinUv jacket_uv() {
  return SkinUv{{{20.0F, 32.0F, 8.0F, 4.0F},
                 {28.0F, 32.0F, 8.0F, 4.0F},
                 {16.0F, 36.0F, 4.0F, 12.0F},
                 {20.0F, 36.0F, 8.0F, 12.0F},
                 {28.0F, 36.0F, 4.0F, 12.0F},
                 {32.0F, 36.0F, 8.0F, 12.0F}}};
}

SkinUv limb_uv(float x, float y, float w) {
  return SkinUv{{{x + 4.0F, y, w, 4.0F},
                 {x + 4.0F + w, y, w, 4.0F},
                 {x, y + 4.0F, 4.0F, 12.0F},
                 {x + 4.0F, y + 4.0F, w, 12.0F},
                 {x + 4.0F + w, y + 4.0F, 4.0F, 12.0F},
                 {x + 8.0F + w, y + 4.0F, w, 12.0F}}};
}

SkinUv cape_uv() {
  return SkinUv{{{1.0F, 0.0F, 10.0F, 1.0F},
                 {11.0F, 0.0F, 10.0F, 1.0F},
                 {0.0F, 1.0F, 1.0F, 16.0F},
                 {1.0F, 1.0F, 10.0F, 16.0F},
                 {11.0F, 1.0F, 1.0F, 16.0F},
                 {12.0F, 1.0F, 10.0F, 16.0F}}};
}
} // namespace

bool LiveSkinModel::load_from_images(const RgbaImage &skin,
                                    const std::optional<RgbaImage> &cape,
                                    bool slim, ModelStyle style,
                                    bool cape_only) {
  style_ = style;
  switch (style_) {
  case ModelStyle::Snapshot:
    rotation_y_ = 0.0F;
    rotation_x_ = 0.0F;
    camera_z_ = 0.0F;
    break;
  case ModelStyle::Viewer:
    rotation_y_ = 0.3F;
    rotation_x_ = 0.0F;
    camera_z_ = 68.0F;
    break;
  case ModelStyle::Editor:
    rotation_y_ = -0.35F;
    rotation_x_ = 0.0F;
    camera_z_ = 68.0F;
    break;
  case ModelStyle::CapeOnly:
    rotation_y_ = -0.35F;
    rotation_x_ = 0.0F;
    camera_z_ = 30.0F;
    break;
  }
  faces_.clear();
  ears_present_ = false;
  ears_visible_ = false;
  flip_ = false;
  if (cape_only) {
    if (!cape.has_value()) {
      loaded_ = false;
      return false;
    }
    cape_ = *cape;
    add_cape(*cape_);
    loaded_ = true;
    return true;
  }
  skin_ = skin;
  cape_ = cape;
  build_player(slim);
  loaded_ = true;
  return true;
}

bool LiveSkinModel::load(const std::string &source, bool slim,
                         const std::string &cape,
                         const std::filesystem::path &public_root,
                         ModelStyle style, bool cape_only) {
  std::optional<RgbaImage> skin_image;
  std::optional<RgbaImage> cape_image;
  if (cape_only) {
    cape_image = load_skin_source(cape, public_root);
    if (!cape_image.has_value()) {
      loaded_ = false;
      return false;
    }
  } else {
    skin_image = load_skin_source(source, public_root);
    if (!skin_image.has_value()) {
      loaded_ = false;
      return false;
    }
    if (!cape.empty()) {
      cape_image = load_skin_source(cape, public_root);
    }
  }
  return load_from_images(skin_image.value_or(RgbaImage{}), cape_image, slim,
                          style, cape_only);
}

void LiveSkinModel::build_head_only() {
  const bool legacy = skin_.height == 32;
  faces_.clear();
  ears_present_ = false;
  ears_visible_ = false;
  const SkinUv head = head_uv();
  const SkinUv hat = hat_uv();
  add_part(head, &hat, SkinVec3{0.0F, 10.0F, 0.0F}, 8.0F, 8.0F, 8.0F, legacy);
}

void LiveSkinModel::build_player(bool slim_opt) {
  const bool legacy = skin_.height == 32;
  const float arm_w = slim_opt ? 3.0F : 4.0F;
  const float arm_x = slim_opt ? 5.5F : 6.0F;
  const SkinUv head = head_uv();
  const SkinUv hat = hat_uv();
  const SkinUv body = body_uv();
  const SkinUv jacket = jacket_uv();
  const SkinUv right_arm = limb_uv(40.0F, 16.0F, arm_w);
  const SkinUv right_arm_overlay = limb_uv(40.0F, 32.0F, arm_w);
  const SkinUv left_arm =
      legacy ? limb_uv(40.0F, 16.0F, arm_w) : limb_uv(32.0F, 48.0F, arm_w);
  const SkinUv left_arm_overlay = limb_uv(48.0F, 48.0F, arm_w);
  const SkinUv right_leg = limb_uv(0.0F, 16.0F, 4.0F);
  const SkinUv right_leg_overlay = limb_uv(0.0F, 32.0F, 4.0F);
  const SkinUv left_leg =
      legacy ? limb_uv(0.0F, 16.0F, 4.0F) : limb_uv(16.0F, 48.0F, 4.0F);
  const SkinUv left_leg_overlay = limb_uv(0.0F, 48.0F, 4.0F);
  add_part(head, &hat, SkinVec3{0.0F, 10.0F, 0.0F}, 8.0F, 8.0F, 8.0F, legacy);
  add_part(body, legacy ? nullptr : &jacket, SkinVec3{}, 8.0F, 12.0F, 4.0F,
           legacy);
  add_part(right_arm, legacy ? nullptr : &right_arm_overlay,
           SkinVec3{-arm_x, 0.0F, 0.0F}, arm_w, 12.0F, 4.0F, legacy);
  add_part(left_arm, legacy ? nullptr : &left_arm_overlay,
           SkinVec3{arm_x, 0.0F, 0.0F}, arm_w, 12.0F, 4.0F, legacy);
  add_part(right_leg, legacy ? nullptr : &right_leg_overlay,
           SkinVec3{-2.0F, -12.0F, 0.0F}, 4.0F, 12.0F, 4.0F, legacy);
  add_part(left_leg, legacy ? nullptr : &left_leg_overlay,
           SkinVec3{2.0F, -12.0F, 0.0F}, 4.0F, 12.0F, 4.0F, legacy);

  if (style_ == ModelStyle::Viewer) {
    for (int side = -1; side <= 1; side += 2) {
      emit_box(SkinVec3{-5.0F * side, 16.0F, 0.0F}, SkinMat3{}, 3.5F, 3.5F,
               2.0F, nullptr, nullptr, false, false, nullptr,
               PixelColor{255, 182, 193, 255}, true);
    }
    ears_present_ = true;
  }

  if (cape_.has_value()) {
    add_cape(*cape_);
  }
}

void LiveSkinModel::add_part(const SkinUv &uv, const SkinUv *overlay_uv,
                             const SkinVec3 &position, float w, float h,
                             float d, bool legacy) {
  static constexpr int base_rects[6] = {4, 2, 0, 1, 3, 5};
  static constexpr int swap_rects[6] = {2, 4, 0, 1, 3, 5};
  emit_box(position, SkinMat3{}, w, h, d, &uv,
           legacy ? swap_rects : base_rects, legacy, legacy, &skin_,
           std::nullopt, false);
  if (overlay_uv != nullptr) {
    emit_box(position, SkinMat3{}, w + 0.5F, h + 0.5F, d + 0.5F, overlay_uv,
             legacy ? swap_rects : base_rects, legacy, legacy, &skin_,
             std::nullopt, false);
  }
}

void LiveSkinModel::add_cape(const RgbaImage &texture) {
  const SkinMat3 tilt = axis_rotation_x(0.15F);
  const SkinVec3 mesh_center = add(tilt.apply(SkinVec3{0.0F, -8.0F, -0.5F}),
                                   SkinVec3{0.0F, 6.0F, -2.35F});
  const SkinUv cape = cape_uv();
  static constexpr int worn_rects[6] = {4, 2, 0, 1, 5, 3};
  static constexpr int item_rects[6] = {4, 2, 0, 1, 3, 5};
  emit_box(mesh_center, tilt, 10.0F, 16.0F, 1.0F, &cape,
           style_ == ModelStyle::CapeOnly ? item_rects : worn_rects, false,
           false, &texture, std::nullopt, false);
}

void LiveSkinModel::emit_box(
    const SkinVec3 &center, const SkinMat3 &part_rotation, float w, float h,
    float d, const SkinUv *rect, const int rect_indices[6], bool mirror_base,
    bool invert_back_face, const RgbaImage *texture,
    const std::optional<PixelColor> &solid_color, bool easter_egg) {
  static constexpr float kNormals[6][3] = {
      {1.0F, 0.0F, 0.0F},   {-1.0F, 0.0F, 0.0F},  {0.0F, 1.0F, 0.0F},
      {0.0F, -1.0F, 0.0F},  {0.0F, 0.0F, 1.0F},   {0.0F, 0.0F, -1.0F},
  };
  static constexpr float kR[6][3] = {
      {0.0F, 0.0F, -1.0F},  {0.0F, 0.0F, 1.0F},   {1.0F, 0.0F, 0.0F},
      {1.0F, 0.0F, 0.0F},   {1.0F, 0.0F, 0.0F},   {-1.0F, 0.0F, 0.0F},
  };
  static constexpr float kU[6][3] = {
      {0.0F, 1.0F, 0.0F},   {0.0F, 1.0F, 0.0F},   {0.0F, 0.0F, -1.0F},
      {0.0F, 0.0F, 1.0F},   {0.0F, 1.0F, 0.0F},   {0.0F, 1.0F, 0.0F},
  };
  static constexpr int kNormalAxis[6] = {0, 0, 1, 1, 2, 2};
  static constexpr int kRAxis[6] = {2, 2, 0, 0, 0, 0};
  static constexpr int kUAxis[6] = {1, 1, 2, 2, 1, 1};
  static constexpr float u_values[4] = {0.0F, 1.0F, 1.0F, 0.0F};
  static constexpr float v_values[4] = {0.0F, 0.0F, 1.0F, 1.0F};
  const float dims[3] = {w, h, d};
  for (int kind = 0; kind < 6; ++kind) {
    const SkinVec3 normal{kNormals[kind][0], kNormals[kind][1],
                          kNormals[kind][2]};
    const SkinVec3 r_axis{kR[kind][0], kR[kind][1], kR[kind][2]};
    const SkinVec3 u_axis{kU[kind][0], kU[kind][1], kU[kind][2]};
    const float extent_u = dims[kRAxis[kind]];
    const float extent_v = dims[kUAxis[kind]];
    const SkinVec3 offset = scale_v(normal, dims[kNormalAxis[kind]] * 0.5F);
    SkinFace face;
    face.texture = texture;
    face.solid_color = solid_color;
    face.alpha_test =
        solid_color.has_value()
            ? 0.0F
            : (style_ == ModelStyle::Editor ? 0.05F : 0.5F);
    face.normal[0] = kNormals[kind][0];
    face.normal[1] = kNormals[kind][1];
    face.normal[2] = kNormals[kind][2];
    face.easter_egg = easter_egg;
    for (int corner = 0; corner < 4; ++corner) {
      SkinVec3 position = add(center, part_rotation.apply(offset));
      position =
          add(position, part_rotation.apply(scale_v(
                            r_axis, extent_u * (u_values[corner] - 0.5F))));
      position =
          add(position, part_rotation.apply(scale_v(
                            u_axis, extent_v * (v_values[corner] - 0.5F))));
      face.corners[corner][0] = position.x;
      face.corners[corner][1] = position.y;
      face.corners[corner][2] = position.z;
    }
    if (rect == nullptr) {
      face.uv_rect[0] = 0.0F;
      face.uv_rect[1] = 0.0F;
      face.uv_rect[2] = 1.0F;
      face.uv_rect[3] = 1.0F;
      face.flip_x = false;
      face.flip_y = false;
    } else {
      const int rect_index = rect_indices[kind];
      face.uv_rect[0] = (*rect).rect[rect_index][0];
      face.uv_rect[1] = (*rect).rect[rect_index][1];
      face.uv_rect[2] = (*rect).rect[rect_index][2];
      face.uv_rect[3] = (*rect).rect[rect_index][3];
      face.flip_x =
          invert_back_face ? (kind == 5 ? !mirror_base : mirror_base) : false;
      face.flip_y = kind == 2 || kind == 3;
    }
    faces_.push_back(face);
  }
}

RenderedSkin LiveSkinModel::render(int width, int height, float animate_delta) {
  if (animate_delta != 0.0F) {
    rotation_y_ += animate_delta;
  }
  RenderedSkin out;
  out.width = width;
  out.height = height;
  if (width <= 0 || height <= 0 || faces_.empty()) {
    return out;
  }
  const SkinMat3 rotation =
      multiply(axis_rotation_x(rotation_x_), axis_rotation_y(rotation_y_));
  Camera camera;
  SkinVec3 group_offset{0.0F, 0.0F, 0.0F};
  switch (style_) {
  case ModelStyle::Snapshot: {
    float max_dim = 1.0F;
    const SkinVec3 center = bbox_center(faces_, max_dim);
    const float distance =
        max_dim / (2.0F * std::tan(camera.fov * kPi / 360.0F) * 0.72F);
    camera.eye = SkinVec3{center.x, center.y, center.z + distance};
    camera.target = center;
    break;
  }
  case ModelStyle::Viewer:
  case ModelStyle::Editor:
    camera.eye = SkinVec3{0.0F, 0.0F, camera_z_};
    camera.target = SkinVec3{};
    group_offset.y = flip_ ? 1.5F : -1.5F;
    break;
  case ModelStyle::CapeOnly:
    camera.eye = SkinVec3{0.0F, 0.0F, camera_z_};
    camera.target = SkinVec3{};
    break;
  }

  const int supersample = style_ == ModelStyle::Snapshot ? 2 : 1;
  const int surface_w = width * supersample;
  const int surface_h = height * supersample;
  camera.width = surface_w;
  camera.height = surface_h;
  RenderedSkin surface;
  surface.width = surface_w;
  surface.height = surface_h;
  surface.rgba.assign(static_cast<std::size_t>(surface_w) * surface_h * 4, 0);
  std::vector<float> depth(static_cast<std::size_t>(surface_w) * surface_h,
                           1e30F);
  for (const SkinFace &face : faces_) {
    if (face.easter_egg && !ears_visible_) {
      continue;
    }
    rasterize_face(surface, depth, face, rotation, group_offset, flip_,
                   camera);
  }
  if (supersample == 1) {
    out.rgba = std::move(surface.rgba);
    out.width = surface_w;
    out.height = surface_h;
    return out;
  }
  out.rgba.assign(static_cast<std::size_t>(width) * height * 4, 0);
  for (int y = 0; y < height; ++y) {
    for (int x = 0; x < width; ++x) {
      float premul_r = 0.0F;
      float premul_g = 0.0F;
      float premul_b = 0.0F;
      float sum_a = 0.0F;
      for (int dy = 0; dy < 2; ++dy) {
        for (int dx = 0; dx < 2; ++dx) {
          const std::size_t index =
              (static_cast<std::size_t>(y * 2 + dy) * surface_w +
               static_cast<std::size_t>(x * 2 + dx)) *
              4;
          const float alpha = surface.rgba[index + 3] / 255.0F;
          sum_a += alpha;
          premul_r += surface.rgba[index] * alpha;
          premul_g += surface.rgba[index + 1] * alpha;
          premul_b += surface.rgba[index + 2] * alpha;
        }
      }
      const float avg_a = sum_a / 4.0F;
      const std::size_t out_index =
          (static_cast<std::size_t>(y) * width + static_cast<std::size_t>(x)) *
          4;
      out.rgba[out_index + 3] = static_cast<std::uint8_t>(avg_a * 255.0F);
      if (avg_a <= 0.0F) {
        continue;
      }
      out.rgba[out_index] = static_cast<std::uint8_t>(
          std::clamp(premul_r / 4.0F / avg_a, 0.0F, 255.0F));
      out.rgba[out_index + 1] = static_cast<std::uint8_t>(
          std::clamp(premul_g / 4.0F / avg_a, 0.0F, 255.0F));
      out.rgba[out_index + 2] = static_cast<std::uint8_t>(
          std::clamp(premul_b / 4.0F / avg_a, 0.0F, 255.0F));
    }
  }
  return out;
}

bool render_skin_snapshot(const SnapshotOptions &options,
                          const std::filesystem::path &public_root,
                          RenderedSkin &out) {
  static std::mutex cache_mutex;
  static std::map<std::string, RenderedSkin> cache;
  const std::string key = options.src + '\0' + (options.slim ? '1' : '0') +
                          '\0' + options.cape + '\0' +
                          std::to_string(options.width) + '\0' +
                          std::to_string(options.height) + '\0' +
                          (options.head_only ? '1' : '0') +
                          (options.cape_only ? '1' : '0');
  {
    const std::lock_guard<std::mutex> lock(cache_mutex);
    const auto cached = cache.find(key);
    if (cached != cache.end()) {
      out = cached->second;
      return true;
    }
  }
  LiveSkinModel model;
  if (options.cape_only) {
    if (!model.load(options.src, options.slim, options.src, public_root,
                    ModelStyle::CapeOnly, true)) {
      return false;
    }
  } else if (!model.load(options.src, options.slim, options.cape, public_root,
                         ModelStyle::Snapshot)) {
    return false;
  }
  if (options.head_only) {
    model.build_head_only();
  }
  RenderedSkin rendered = model.render(options.width, options.height);
  if (rendered.rgba.empty()) {
    return false;
  }
  {
    const std::lock_guard<std::mutex> lock(cache_mutex);
    if (cache.size() >= 96) {
      cache.clear();
    }
    cache.emplace(key, rendered);
  }
  out = std::move(rendered);
  return true;
}
} // namespace emerald::skins
