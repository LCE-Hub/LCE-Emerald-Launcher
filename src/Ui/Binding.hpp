#pragma once
#include "Core/Json.hpp"
#include <string>
#include <string_view>
#include <vector>
namespace emerald::ui {
class I18n;
using emerald::Json;
class DataContext {
public:
  DataContext(const Json &root, const I18n *i18n);
  void push_scope(const Json &scope);
  void pop_scope();
  std::string resolve(std::string_view text) const;
  std::string resolve_path(std::string_view path) const;
  const Json *lookup(std::string_view path) const;
  bool truthy(std::string_view path) const;
  const Json &root() const { return root_; }

private:
  const Json &root_;
  const I18n *i18n_;
  std::vector<const Json *> scopes_;
};
} // namespace emerald::ui