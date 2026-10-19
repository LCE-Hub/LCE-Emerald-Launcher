#include "Instances/InstanceManager.hpp"
#include "Core/Paths.hpp"
namespace emerald::instances {
namespace {
const std::vector<std::string> kKeepList{
    "Windows64",
    "Windows64Media",
    "uid.dat",
    "username.txt",
    "settings.dat",
    "servers.dat",
    "servers.txt",
    "server.properties",
    "options.txt",
    "servers.db",
    "workshop_files.json",
    "screenshots",
    "update_timestamp.txt",
    "profile0.dat",
    "profile1.dat",
    "profile2.dat",
    "profile3.dat",
    "profile4.dat",
    "profile5.dat",
    "profile6.dat",
    "profile7.dat",
    "profile8.dat",
    "profile9.dat",
    "profile10.dat",
    "proton_prefix",
};
}

InstanceManager::InstanceManager(const config::AppConfig &config)
    : config_(config) {}

std::filesystem::path
InstanceManager::default_dir(std::string_view instance_id) const {
  return core::instances_dir() / std::string(instance_id);
}

std::filesystem::path
InstanceManager::working_dir(std::string_view instance_id) const {
  if (config_.custom_editions.has_value()) {
    for (const config::CustomEdition &edition : *config_.custom_editions) {
      if (edition.id == instance_id && edition.path.has_value() &&
          !edition.path->empty()) {
        return std::filesystem::path(*edition.path);
      }
    }
  }
  if (config_.custom_paths.has_value()) {
    const auto found = config_.custom_paths->find(std::string(instance_id));
    if (found != config_.custom_paths->end() && !found->second.empty()) {
      return std::filesystem::path(found->second);
    }
  }
  return default_dir(instance_id);
}

bool InstanceManager::is_installed(std::string_view instance_id) const {
  return std::filesystem::exists(working_dir(instance_id) /
                                 std::string(kExecutableMarker));
}

bool InstanceManager::is_managed(std::string_view instance_id) const {
  return working_dir(instance_id) == default_dir(instance_id);
}

bool InstanceManager::create_dir(std::string_view instance_id) const {
  std::error_code error;
  return std::filesystem::create_directories(working_dir(instance_id), error);
}

bool InstanceManager::delete_instance(std::string_view instance_id) const {
  if (!is_managed(instance_id)) {
    return false;
  }
  const std::filesystem::path dir = default_dir(instance_id);
  if (!std::filesystem::exists(dir)) {
    return true;
  }
  std::error_code error;
  return std::filesystem::remove_all(dir, error) > 0;
}

const std::vector<std::string> &keep_list() { return kKeepList; }
} // namespace emerald::instances
