#pragma once
#include "Config/ConfigSchema.hpp"
#include <filesystem>
#include <vector>
namespace emerald::launch {
std::vector<config::McServer>
read_server_list(const std::filesystem::path &instance_dir);
void write_server_list(const std::filesystem::path &instance_dir,
                       const std::vector<config::McServer> &servers);
void ensure_server_list(const std::filesystem::path &instance_dir,
                        const std::vector<config::McServer> &servers);
std::vector<config::McServer> lce_online_server();
std::vector<config::McServer> partnership_servers();
} // namespace emerald::launch
