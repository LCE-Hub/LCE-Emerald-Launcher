#pragma once
#include "Config/ConfigSchema.hpp"
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>
namespace emerald::instances {
class InstanceManager {
public:
  explicit InstanceManager(const config::AppConfig &config);
  std::filesystem::path working_dir(std::string_view instance_id) const;
  std::filesystem::path default_dir(std::string_view instance_id) const;
  bool is_installed(std::string_view instance_id) const;
  bool is_managed(std::string_view instance_id) const;
  bool create_dir(std::string_view instance_id) const;
  bool delete_instance(std::string_view instance_id) const;

private:
  const config::AppConfig &config_;
};

const std::vector<std::string> &keep_list();
constexpr std::string_view kExecutableMarker = "Minecraft.Client.exe";
} // namespace emerald::instances
