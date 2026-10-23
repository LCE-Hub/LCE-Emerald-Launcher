#include "Instances/ArgsSchema.hpp"
#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
namespace emerald::instances {
namespace {
constexpr std::string_view kValidTypes[] = {"boolean", "int", "number",
                                            "string", "choice"};
bool is_string_attr(const Json &object, const char *key) {
  const auto found = object.find(key);
  return found != object.end() && found->is_string() &&
         !found->get<std::string>().empty();
}

std::optional<OptionType> option_type(const std::string &type) {
  if (type == "boolean") {
    return OptionType::Boolean;
  }
  if (type == "int") {
    return OptionType::Int;
  }
  if (type == "number") {
    return OptionType::Number;
  }
  if (type == "string") {
    return OptionType::String;
  }
  if (type == "choice") {
    return OptionType::Choice;
  }
  return std::nullopt;
}

bool is_finite_number(const Json &value) {
  return value.is_number() && std::isfinite(value.get<double>());
}

std::optional<double> finite_number_attr(const Json &object, const char *key) {
  const auto found = object.find(key);
  if (found == object.end() || !is_finite_number(*found)) {
    return std::nullopt;
  }
  return found->get<double>();
}

bool is_valid_condition(const Json &cond);
bool is_valid_leaf(const Json &cond) {
  if (!is_string_attr(cond, "option")) {
    return false;
  }
  return cond.contains("equals") || cond.contains("in") ||
         cond.contains("not") || cond.contains("exists");
}

bool is_valid_condition(const Json &cond) {
  if (!cond.is_object()) {
    return false;
  }
  if (cond.contains("all")) {
    if (!cond["all"].is_array() || cond["all"].empty()) {
      return false;
    }
    for (const Json &item : cond["all"]) {
      if (!is_valid_condition(item)) {
        return false;
      }
    }
  } else if (cond.contains("any")) {
    if (!cond["any"].is_array() || cond["any"].empty()) {
      return false;
    }
    for (const Json &item : cond["any"]) {
      if (!is_valid_condition(item)) {
        return false;
      }
    }
  } else if (cond.contains("not")) {
    if (!is_valid_condition(cond["not"])) {
      return false;
    }
  } else if (!is_valid_leaf(cond)) {
    return false;
  }
  return true;
}

bool json_equal(const Json &left, const Json &right) {
  if (left.is_number() && right.is_number()) {
    return left.get<double>() == right.get<double>();
  }
  return left == right;
}

bool exists_truthy(const Json *value) {
  if (value == nullptr || value->is_null()) {
    return false;
  }
  if (value->is_string()) {
    return !value->get<std::string>().empty();
  }
  if (value->is_boolean()) {
    return value->get<bool>();
  }
  return true;
}

bool is_choice_value(const SchemaOption &option, const std::string &value) {
  return std::any_of(
      option.choices.begin(), option.choices.end(),
      [&](const SchemaChoice &choice) { return choice.value == value; });
}

std::string number_text(const Json &value, bool) {
  std::array<char, 32> buffer{};
  const auto result =
      std::to_chars(buffer.data(), buffer.data() + buffer.size(),
                    value.get<double>(), std::chars_format::general);
  return std::string(buffer.data(), result.ptr);
}
} // namespace

std::optional<ArgsSchema> parse_schema(const std::string &raw) {
  Json parsed;
  try {
    parsed = Json::parse(raw);
  } catch (const Json::parse_error &) {
    return std::nullopt;
  }
  if (!parsed.is_object() || !parsed.contains("$schema") ||
      !parsed["options"].is_array()) {
    return std::nullopt;
  }

  ArgsSchema schema;
  schema.schema = "$schema";
  if (parsed.contains("meta") && parsed["meta"].is_object()) {
    const Json &meta = parsed["meta"];
    if (meta.contains("name") && meta["name"].is_string()) {
      schema.meta_name = meta["name"].get<std::string>();
    }
    if (meta.contains("description") && meta["description"].is_string()) {
      schema.meta_description = meta["description"].get<std::string>();
    }
  }

  std::vector<std::string> group_ids;
  for (const Json &item : parsed.value("groups", Json::array())) {
    if (!item.is_object() || !is_string_attr(item, "id")) {
      continue;
    }
    SchemaGroup group;
    group.id = item["id"].get<std::string>();
    group.title = item.value("title", group.id);
    group.description =
        item.contains("description") && item["description"].is_string()
            ? std::optional<std::string>(item["description"].get<std::string>())
            : std::nullopt;
    if (std::find(group_ids.begin(), group_ids.end(), group.id) !=
        group_ids.end()) {
      continue;
    }
    group_ids.push_back(group.id);
    schema.groups.push_back(std::move(group));
  }

  std::vector<std::string> option_ids;
  for (const Json &item : parsed["options"]) {
    if (!item.is_object() || !is_string_attr(item, "id") ||
        !is_string_attr(item, "title") || !is_string_attr(item, "arg")) {
      continue;
    }
    const std::string id = item["id"].get<std::string>();
    const std::string type_name = item.value("type", "");
    if (!is_string_attr(item, "type") || !option_type(type_name).has_value()) {
      continue;
    }
    if (std::find(option_ids.begin(), option_ids.end(), id) !=
        option_ids.end()) {
      continue;
    }

    SchemaOption option;
    option.id = id;
    option.title = item["title"].get<std::string>();
    option.arg = item["arg"].get<std::string>();
    option.type = *option_type(type_name);
    option.default_value = json_optional<Json>(item, "default");
    const OptionType type = option.type;
    if (type == OptionType::Choice) {
      if (!item["choices"].is_array() || item["choices"].empty()) {
        continue;
      }
      std::vector<std::string> choice_values;
      bool valid_choices = true;
      for (const Json &choice : item["choices"]) {
        if (!choice.is_object() || !is_string_attr(choice, "value")) {
          valid_choices = false;
          break;
        }
        const std::string value = choice["value"].get<std::string>();
        if (std::find(choice_values.begin(), choice_values.end(), value) !=
            choice_values.end()) {
          valid_choices = false;
          break;
        }
        choice_values.push_back(value);
        SchemaChoice parsed_choice;
        parsed_choice.value = value;
        parsed_choice.label =
            choice.contains("label") && choice["label"].is_string()
                ? choice["label"].get<std::string>()
                : value;
        option.choices.push_back(std::move(parsed_choice));
      }
      if (!valid_choices || option.choices.empty()) {
        continue;
      }
      if (option.default_value.has_value() &&
          (!option.default_value->is_string() ||
           !is_choice_value(option,
                            option.default_value->get<std::string>()))) {
        option.default_value.reset();
      }
    } else {
      if (option.default_value.has_value()) {
        const Json &value = *option.default_value;
        const bool ok =
            (type == OptionType::Boolean && value.is_boolean()) ||
            ((type == OptionType::Int || type == OptionType::Number) &&
             is_finite_number(value)) ||
            (type == OptionType::String && value.is_string());
        if (!ok) {
          option.default_value.reset();
        }
      }
    }

    option.min = finite_number_attr(item, "min");
    option.max = finite_number_attr(item, "max");
    option.step = finite_number_attr(item, "step");
    option.description =
        item.contains("description") && item["description"].is_string()
            ? std::optional<std::string>(item["description"].get<std::string>())
            : std::nullopt;
    option.group =
        item.contains("group") && item["group"].is_string()
            ? std::optional<std::string>(item["group"].get<std::string>())
            : std::nullopt;
    option.placeholder =
        item.contains("placeholder") && item["placeholder"].is_string()
            ? std::optional<std::string>(item["placeholder"].get<std::string>())
            : std::nullopt;

    option_ids.push_back(id);
    schema.options.push_back(std::move(option));
  }

  if (schema.options.empty()) {
    return std::nullopt;
  }

  for (const Json &item : parsed.value("dependencies", Json::array())) {
    if (!item.is_object() || !is_string_attr(item, "target")) {
      continue;
    }
    const std::string target = item["target"].get<std::string>();
    if (std::find(option_ids.begin(), option_ids.end(), target) ==
        option_ids.end()) {
      continue;
    }
    const auto when = item.find("when");
    if (when == item.end() || !is_valid_condition(*when)) {
      continue;
    }
    SchemaDependency dependency;
    dependency.target = target;
    dependency.when = *when;
    dependency.hide = item.value("effect", "disable") == "hide";
    schema.dependencies.push_back(std::move(dependency));
  }

  schema.schema_version = 1;
  return schema;
}

Json option_default(const SchemaOption &option) {
  switch (option.type) {
  case OptionType::Boolean:
    return option.default_value.has_value() &&
                   option.default_value->is_boolean()
               ? *option.default_value
               : Json(false);
  case OptionType::Int:
  case OptionType::Number:
    if (option.default_value.has_value() &&
        is_finite_number(*option.default_value)) {
      return *option.default_value;
    }
    return Json(0);
  case OptionType::String:
    return option.default_value.has_value() && option.default_value->is_string()
               ? *option.default_value
               : Json(std::string{});
  case OptionType::Choice:
    if (option.default_value.has_value() && option.default_value->is_string() &&
        is_choice_value(option, option.default_value->get<std::string>())) {
      return *option.default_value;
    }
    if (!option.choices.empty()) {
      return Json(option.choices.front().value);
    }
    return Json(std::string{});
  }
  return Json(std::string{});
}

Json merge_values(const ArgsSchema &schema, const Json &saved) {
  Json merged = Json::object();
  for (const SchemaOption &option : schema.options) {
    merged[option.id] = option_default(option);
  }
  const Json *saved_object = saved.is_object() ? &saved : nullptr;
  if (saved_object == nullptr) {
    return merged;
  }
  for (const SchemaOption &option : schema.options) {
    const auto found = saved_object->find(option.id);
    if (found == saved_object->end()) {
      continue;
    }
    const Json &value = *found;
    bool ok = false;
    switch (option.type) {
    case OptionType::Boolean:
      ok = value.is_boolean();
      break;
    case OptionType::Int:
    case OptionType::Number:
      ok = is_finite_number(value);
      break;
    case OptionType::String:
      ok = value.is_string();
      break;
    case OptionType::Choice:
      ok = value.is_string() &&
           is_choice_value(option, value.get<std::string>());
      break;
    }
    if (ok) {
      merged[option.id] = value;
    }
  }
  return merged;
}

namespace {
bool evaluate_condition(const Json &cond, const Json &values);
bool evaluate_leaf(const Json &cond, const Json &values) {
  const std::string option = cond["option"].get<std::string>();
  const auto found = values.find(option);
  if (cond.contains("equals")) {
    return found != values.end() && json_equal(*found, cond["equals"]);
  }
  if (cond.contains("in")) {
    if (!cond["in"].is_array() || found == values.end()) {
      return false;
    }
    for (const Json &candidate : cond["in"]) {
      if (json_equal(*found, candidate)) {
        return true;
      }
    }
    return false;
  }
  if (cond.contains("not")) {
    return found == values.end() || !json_equal(*found, cond["not"]);
  }
  if (cond.contains("exists")) {
    const bool expect_true = cond["exists"].get<bool>();
    return expect_true
               ? exists_truthy(found != values.end() ? &(*found) : nullptr)
               : !exists_truthy(found != values.end() ? &(*found) : nullptr);
  }
  return false;
}

bool evaluate_condition(const Json &cond, const Json &values) {
  if (!cond.is_object()) {
    return false;
  }
  if (cond.contains("all")) {
    const Json &entries = cond["all"];
    return std::all_of(entries.begin(), entries.end(), [&](const Json &item) {
      return evaluate_condition(item, values);
    });
  }
  if (cond.contains("any")) {
    const Json &entries = cond["any"];
    return std::any_of(entries.begin(), entries.end(), [&](const Json &item) {
      return evaluate_condition(item, values);
    });
  }
  if (cond.contains("not")) {
    return !evaluate_condition(cond["not"], values);
  }
  return evaluate_leaf(cond, values);
}
} // namespace

std::map<std::string, OptionEffects> compute_effects(const ArgsSchema &schema,
                                                     const Json &values) {
  std::map<std::string, OptionEffects> effects;
  for (const SchemaOption &option : schema.options) {
    effects[option.id] = OptionEffects{};
  }
  for (const SchemaDependency &dependency : schema.dependencies) {
    if (!evaluate_condition(dependency.when, values)) {
      continue;
    }
    OptionEffects &effect = effects[dependency.target];
    effect.disabled = true;
    if (dependency.hide) {
      effect.hidden = true;
    }
  }
  return effects;
}

std::vector<std::string>
build_args(const ArgsSchema &schema, const Json &values,
           const std::map<std::string, OptionEffects> &effects) {
  std::vector<std::string> args;
  for (const SchemaOption &option : schema.options) {
    const auto effect = effects.find(option.id);
    if (effect != effects.end() &&
        (effect->second.hidden || effect->second.disabled)) {
      continue;
    }
    const auto found = values.find(option.id);
    if (found == values.end()) {
      continue;
    }
    const Json &value = *found;
    switch (option.type) {
    case OptionType::Boolean:
      if (value.is_boolean() && value.get<bool>()) {
        args.push_back(option.arg);
      }
      break;
    case OptionType::Int:
      if (is_finite_number(value)) {
        args.push_back(option.arg);
        args.push_back(number_text(value, true));
      }
      break;
    case OptionType::Number:
      if (is_finite_number(value)) {
        args.push_back(option.arg);
        args.push_back(number_text(value, false));
      }
      break;
    case OptionType::String:
      if (value.is_string()) {
        const std::string &text = value.get_ref<const std::string &>();
        if (!text.empty()) {
          args.push_back(option.arg);
          args.push_back(text);
        }
      }
      break;
    case OptionType::Choice:
      if (value.is_string() && !value.get<std::string>().empty()) {
        args.push_back(option.arg);
        args.push_back(value.get<std::string>());
      }
      break;
    }
  }
  return args;
}

std::string display_value(const SchemaOption &option, const Json &value) {
  switch (option.type) {
  case OptionType::Boolean:
    return value.is_boolean() ? (value.get<bool>() ? "true" : "false")
                              : std::string{};
  case OptionType::Int:
    return is_finite_number(value) ? number_text(value, true) : std::string{};
  case OptionType::Number:
    return is_finite_number(value) ? number_text(value, false) : std::string{};
  case OptionType::String:
    return value.is_string() ? value.get<std::string>() : std::string{};
  case OptionType::Choice: {
    if (!value.is_string()) {
      return std::string{};
    }
    const std::string text = value.get<std::string>();
    for (const SchemaChoice &choice : option.choices) {
      if (choice.value == text) {
        return choice.label;
      }
    }
    return text;
  }
  }
  return std::string{};
}
} // namespace emerald::instances