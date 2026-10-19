#include "Ui/Binding.hpp"
#include "Ui/I18n.hpp"
#include <charconv>
#include <vector>
namespace emerald::ui {
namespace {
std::string json_to_text(const Json &value) {
  if (value.is_null()) {
    return {};
  }
  if (value.is_string()) {
    return value.get<std::string>();
  }
  if (value.is_boolean()) {
    return value.get<bool>() ? "true" : "false";
  }
  if (value.is_number_integer()) {
    return std::to_string(value.get<long long>());
  }
  if (value.is_number_unsigned()) {
    return std::to_string(value.get<unsigned long long>());
  }
  if (value.is_number_float()) {
    return std::to_string(value.get<double>());
  }
  return value.dump();
}

std::vector<std::string_view> split_path(std::string_view path) {
  std::vector<std::string_view> parts;
  std::size_t start = 0;
  for (std::size_t i = 0; i <= path.size(); ++i) {
    if (i == path.size() || path[i] == '.') {
      parts.push_back(path.substr(start, i - start));
      start = i + 1;
    }
  }
  return parts;
}

} // namespace

DataContext::DataContext(const Json &root, const I18n *i18n)
    : root_(root), i18n_(i18n) {}
void DataContext::push_scope(const Json &scope) { scopes_.push_back(&scope); }
void DataContext::pop_scope() {
  if (!scopes_.empty()) {
    scopes_.pop_back();
  }
}

const Json *DataContext::lookup(std::string_view path) const {
  const std::string_view first = split_path(path).front();
  for (auto iterator = scopes_.rbegin(); iterator != scopes_.rend();
       ++iterator) {
    const Json &scope = **iterator;
    if (!scope.is_object()) {
      continue;
    }
    const auto found = scope.find(std::string(first));
    if (found == scope.end()) {
      continue;
    }
    const Json *node = &(*found);
    const std::vector<std::string_view> parts = split_path(path);
    for (std::size_t i = 1; i < parts.size(); ++i) {
      if (parts[i].empty() || !node->is_object()) {
        return nullptr;
      }
      const auto nested = node->find(std::string(parts[i]));
      if (nested == node->end()) {
        return nullptr;
      }
      node = &(*nested);
    }
    return node;
  }

  const Json *node = &root_;
  for (const std::string_view part : split_path(path)) {
    if (part.empty()) {
      continue;
    }
    if (!node->is_object()) {
      return nullptr;
    }
    const auto found = node->find(std::string(part));
    if (found == node->end()) {
      return nullptr;
    }
    node = &(*found);
  }
  return node;
}

bool DataContext::truthy(std::string_view path) const {
  const Json *node = lookup(path);
  if (node == nullptr) {
    return false;
  }
  if (node->is_boolean()) {
    return node->get<bool>();
  }
  if (node->is_number()) {
    return node->get<double>() != 0.0;
  }
  if (node->is_string()) {
    const std::string &text = node->get_ref<const std::string &>();
    return !text.empty() && text != "false" && text != "0";
  }
  if (node->is_array()) {
    return !node->empty();
  }
  return !node->is_null();
}

std::string DataContext::resolve_path(std::string_view path) const {
  const Json *node = lookup(path);
  return node == nullptr ? std::string{} : json_to_text(*node);
}

std::string DataContext::resolve(std::string_view text) const {
  std::string result;
  result.reserve(text.size());
  std::size_t cursor = 0;
  while (cursor < text.size()) {
    const std::size_t open = text.find("{{", cursor);
    if (open == std::string_view::npos) {
      result.append(text.substr(cursor));
      break;
    }
    result.append(text.substr(cursor, open - cursor));
    const std::size_t close = text.find("}}", open + 2);
    if (close == std::string_view::npos) {
      result.append(text.substr(open));
      break;
    }
    std::string_view expression = text.substr(open + 2, close - open - 2);
    while (!expression.empty() && expression.front() == ' ') {
      expression.remove_prefix(1);
    }
    while (!expression.empty() && expression.back() == ' ') {
      expression.remove_suffix(1);
    }
    if (expression.starts_with("t:")) {
      const std::string key(expression.substr(2));
      result.append(i18n_ != nullptr ? i18n_->translate(key) : key);
    } else {
      result.append(resolve_path(expression));
    }
    cursor = close + 2;
  }
  return result;
}
} // namespace emerald::ui