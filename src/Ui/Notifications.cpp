#include "Ui/Notifications.hpp"
#include <algorithm>
namespace emerald::ui {
void NotificationHub::push(Toast toast) {
  toast.id = next_id_++;
  toasts_.push_back(std::move(toast));
  ++revision_;
}

bool NotificationHub::expire(std::uint64_t now) {
  const std::size_t before = toasts_.size();
  toasts_.erase(std::remove_if(toasts_.begin(), toasts_.end(),
                               [now](const Toast &toast) {
                                 return toast.expires_at != 0 &&
                                        toast.expires_at <= now;
                               }),
                toasts_.end());
  if (toasts_.size() != before) {
    ++revision_;
    return true;
  }
  return false;
}

bool NotificationHub::dismiss(std::uint64_t id, std::uint64_t now) {
  (void)now;
  const std::size_t before = toasts_.size();  toasts_.erase(
      std::remove_if(toasts_.begin(), toasts_.end(),
                     [id](const Toast &toast) { return toast.id == id; }),
      toasts_.end());
  if (toasts_.size() != before) {
    ++revision_;
    return true;
  }
  return false;
}

const Toast *NotificationHub::find(std::uint64_t id) const {
  for (const Toast &toast : toasts_) {
    if (toast.id == id) {
      return &toast;
    }
  }
  return nullptr;
}
} // namespace emerald::ui
