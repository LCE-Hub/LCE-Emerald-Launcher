#pragma once
#include <functional>
#include <map>
#include <string>
#include <string_view>
namespace emerald::ui {
class HandlerRegistry {
public:
  using Handler = std::function<void(std::string_view argument)>;
  void bind(std::string name, Handler handler);
  bool invoke(std::string_view name, std::string_view argument) const;

private:
  std::map<std::string, Handler> handlers_;
};
} // namespace emerald::ui