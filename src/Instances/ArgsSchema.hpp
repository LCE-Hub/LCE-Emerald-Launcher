#pragma once
#include "Core/Json.hpp"
#include <map>
#include <optional>
#include <string>
#include <vector>
namespace emerald::instances {
enum class OptionType {
  Boolean,
  Int,
  Number,
  String,
  Choice,
};

struct SchemaChoice {
  std::string value;
  std::string label;
};

struct SchemaOption {
  std::string id;
  std::string title;
  std::string arg;
  OptionType type = OptionType::String;
  std::optional<std::string> description;
  std::optional<std::string> group;
  std::optional<Json> default_value;
  std::optional<double> min;
  std::optional<double> max;
  std::optional<double> step;
  std::optional<std::string> placeholder;
  std::vector<SchemaChoice> choices;
};

struct SchemaGroup {
  std::string id;
  std::string title;
  std::optional<std::string> description;
};

struct SchemaDependency {
  std::string target;
  Json when;
  bool hide = false;
};

struct ArgsSchema {
  std::string schema;
  int schema_version = 1;
  std::optional<std::string> meta_name;
  std::optional<std::string> meta_description;
  std::vector<SchemaGroup> groups;
  std::vector<SchemaOption> options;
  std::vector<SchemaDependency> dependencies;
};

struct OptionEffects {
  bool hidden = false;
  bool disabled = false;
};

std::optional<ArgsSchema> parse_schema(const std::string &raw);
Json option_default(const SchemaOption &option);
Json merge_values(const ArgsSchema &schema, const Json &saved);
std::map<std::string, OptionEffects> compute_effects(const ArgsSchema &schema,
                                                     const Json &values);
std::vector<std::string>
build_args(const ArgsSchema &schema, const Json &values,
           const std::map<std::string, OptionEffects> &effects);
std::string display_value(const SchemaOption &option, const Json &value);
} // namespace emerald::instances
