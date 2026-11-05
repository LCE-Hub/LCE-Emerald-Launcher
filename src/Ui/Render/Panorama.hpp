#pragma once
#include "Ui/Types.hpp"
#include <chrono>
#include <string>
namespace emerald::ui {
class RenderContext;
class Panorama {
public:
  void set_source(std::string source);
  void render(RenderContext &context, const Rect &viewport);

private:
  std::string source_;
  bool started_ = false;
  std::chrono::steady_clock::time_point start_{};
};

} // namespace emerald::ui
