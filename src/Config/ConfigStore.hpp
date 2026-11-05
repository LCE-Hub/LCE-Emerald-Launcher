#pragma once
#include "Config/ConfigSchema.hpp"
#include "Core/Json.hpp"
#include <string>
#include <string_view>
namespace emerald::config {
class ConfigStore {
public:
  void load();
  bool save() const;
  AppConfig &data() { return config_; }
  const AppConfig &data() const { return config_; }
  const Json &document() const { return document_; }
  std::string export_pretty() const;
  bool import_from_string(std::string_view contents, std::string &error);

private:
  AppConfig config_;
  Json document_ = Json::object();
};
} // namespace emerald::config
