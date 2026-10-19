#pragma once
#include <nlohmann/json.hpp>
#include <optional>
#include <utility>
namespace emerald {
using Json = nlohmann::json;
template <typename T>
std::optional<T> json_optional(const Json &object, const char *key) {
  if (!object.is_object()) {
    return std::nullopt;
  }
  const auto iterator = object.find(key);
  if (iterator == object.end() || iterator->is_null()) {
    return std::nullopt;
  }
  return iterator->get<T>();
}

template <typename T>
void json_set(Json &object, const char *key, const std::optional<T> &value) {
  if (value.has_value()) {
    object[key] = *value;
  } else {
    object[key] = nullptr;
  }
}

inline void json_set(Json &object, const char *key,
                     const std::optional<std::string> &value) {
  if (value.has_value()) {
    object[key] = *value;
  } else {
    object[key] = nullptr;
  }
}

} // namespace emerald
