#pragma once
#include <filesystem>
#include <string>
namespace emerald::instances {
bool sync_instance(const std::filesystem::path &instance_dir,
                   const std::string &username,
                   const std::filesystem::path &dlc_source,
                   const std::filesystem::path &skin_pck);

}