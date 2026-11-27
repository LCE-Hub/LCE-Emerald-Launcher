#pragma once
#include "Ui/View.hpp"
namespace emerald::ui {
class LceOnlineView : public View {
public:
  std::string_view id() const override { return "lceonline"; }
  Json data(const UiServices &services) const override;
  bool action(std::string_view name, UiServices &services) override;
  void on_enter() override;

private:
  std::string tab_ = "friends";
  bool add_friend_open_ = false;
  std::string auth_mode_ = "login";
  std::string auth_username_;
  std::string auth_password_;
  std::string auth_error_;
  mutable bool join_open_ = false;
  mutable std::string join_host_;
  mutable std::string join_session_;
  mutable std::string selected_instance_;
  mutable bool joining_ = false;
};
} // namespace emerald::ui
