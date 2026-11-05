#include "Ui/Handlers.hpp"
namespace emerald::ui {
void HandlerRegistry::bind(std::string name, Handler handler) {
  handlers_[std::move(name)] = std::move(handler);
}

bool HandlerRegistry::invoke(std::string_view name,
                             std::string_view argument) const {
  const auto found = handlers_.find(std::string(name));
  if (found == handlers_.end()) {
    return false;
  }
  found->second(argument);
  return true;
}
} // namespace emerald::ui