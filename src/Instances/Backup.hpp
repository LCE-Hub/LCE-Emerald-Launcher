#pragma once
#include <filesystem>
#include <optional>
#include <string>
namespace emerald::instances {
bool create_instance_backup(const std::filesystem::path &instance_dir,
                            const std::filesystem::path &destination,
                            std::string &error);

std::optional<std::string>
restore_instance_backup(const std::filesystem::path &archive,
                        const std::filesystem::path &instances_dir,
                        std::string &error);

} // namespace emerald::instances