#pragma once
#include <cstdint>
#include <string>
#include <vector>
namespace emerald::ui {
enum class ToastVariant { Error, Update, Steam };
struct Toast {
  std::uint64_t id = 0;
  std::string title;
  std::string message;
  std::string on_click;
  ToastVariant variant = ToastVariant::Error;
  std::uint64_t expires_at = 0;
};

class NotificationHub {
public:
  static constexpr std::uint64_t kToastLifetimeMs = 8000;
  const std::vector<Toast> &toasts() const { return toasts_; }
  std::uint64_t revision() const { return revision_; }
  void push(Toast toast);
  bool expire(std::uint64_t now);
  bool dismiss(std::uint64_t id, std::uint64_t now);
  const Toast *find(std::uint64_t id) const;

private:
  std::vector<Toast> toasts_;
  std::uint64_t next_id_ = 1;
  std::uint64_t revision_ = 0;
};
} // namespace emerald::ui
