#pragma once
#include "Ui/Element.hpp"
#include "Ui/Handlers.hpp"
#include "Ui/I18n.hpp"
#include "Ui/Render/Panorama.hpp"
#include "Ui/Render/SdlRenderer.hpp"
#include "Ui/View.hpp"
#include "Ui/Xml.hpp"
#include <SDL3/SDL_events.h>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
struct SDL_Renderer;
namespace emerald::ui {
enum class ControllerType { Unknown, Xbox360, Durango, PS3, Orbis, Switch };
class UiSystem {
public:
  UiSystem(SDL_Renderer *renderer, std::filesystem::path ui_docs_root,
           std::filesystem::path public_root, std::filesystem::path i18n_root);
  ~UiSystem();
  UiSystem(const UiSystem &) = delete;
  UiSystem &operator=(const UiSystem &) = delete;
  bool initialize();
  void set_language(const std::string &language);
  void set_services(UiServices services) {
    services_ = std::move(services);
    services_.i18n = &i18n_;
    services_.navigate = [this](const std::string &id) { navigate(id); };
    services_.change_language = [this](const std::string &language) {
      set_language(language);
    };
    services_.reset_focus = [this]() {
      focus_engaged_ = true;
      focus_ = 0;
      dirty_ = true;
    };
    services_.notifications = &notifications_;
    services_.focus_element = [this](const std::string &id) {
      focus_element(id);
    };
    services_.focus_scope = [this](const std::string &id) {
      set_focus_scope(id);
    };
    services_.read_text_input = [this]() { return text_result_; };
    services_.text_edited = [this]() { return text_edited_; };
    services_.notify = [this](const std::string &title,
                              const std::string &message, ToastVariant variant,
                              const std::string &on_click) {
      push_toast(title, message, variant, on_click);
    };
  }
  void navigate(const std::string &view_id);
  void navigate_back();
  void invalidate() { dirty_ = true; }
  void push_toast(std::string title, std::string message,
                  ToastVariant variant, std::string on_click = "");  const std::string &current_view() const { return current_view_; }
  void set_controller_type(ControllerType type);
  void focus_element(const std::string &id);
  void set_focus_scope(const std::string &id);
  std::vector<Element *> hover_chain_;
  void handle_event(const SDL_Event &event);
  void render();

private:
  void register_handlers();
  void rebuild();
  void rebuild_overlay();
  void update_notifications();
  void refresh_tooltips(const Json &data);
  void detect_controller_type();
  void update_panorama();
  void dispatch(const std::string &handler);
  void play_sound_for(const std::string &handler);
  void collect_focusables(Element *element);
  bool focus_path(Element *element, const Element *target,
                  std::vector<Element *> &path) const;
  void apply_focus();
  void move_focus(int direction);
  void activate_focus();
  bool handle_back();
  TextInputElement *active_text_input();
  void begin_text_edit(Element *element);
  void end_text_edit(bool commit);
  void release_text_edit(bool commit);
  void adjust_slider(SliderElement *slider, int delta);
  void commit_slider(SliderElement *slider);
  Element *find_clickable(Element *element, const Vec2 &point) const;
  Element *find_hoverable(Element *element, const Vec2 &point) const;
  bool hover_path(Element *e, const Vec2 &p,
                  std::vector<Element *> &path) const;
  SdlRenderer renderer_;
  Panorama panorama_;
  ElementRegistry &registry_;
  I18n i18n_;
  UiDocument document_;
  HandlerRegistry handlers_;
  UiServices services_;
  std::filesystem::path ui_docs_root_;
  std::filesystem::path i18n_root_;
  std::map<std::string, std::unique_ptr<View>> views_;
  std::string current_view_;
  std::vector<std::string> back_stack_;
  ElementPtr tree_;
  ElementPtr overlay_tree_;
  NotificationHub notifications_;
  bool overlay_dirty_ = true;
  Element *active_text_ = nullptr;
  std::string text_result_;
  bool text_edited_ = false;
  std::vector<Element *> focus_order_;
  int focus_ = 0;
  bool focus_engaged_ = false;
  std::string focus_scope_id_;
  std::string pending_focus_id_;
  bool pending_focus_ = false;
  bool gamepad_ = true;
  ControllerType controller_type_ = ControllerType::Unknown;
  bool dirty_ = true;
  uint64_t view_entered_ticks_ = 0U;
  int logical_width_ = 1280;
  int logical_height_ = 720;
};
} // namespace emerald::ui