#pragma once
#include "Instances/Downloader.hpp"
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::instances {
bool extract_archive(const std::filesystem::path &archive,
                     const std::filesystem::path &dest, std::string &error);

bool extract_archive_strip(const std::filesystem::path &archive,
                           const std::filesystem::path &dest,
                           int strip_components, std::string &error);

void prune_instance(const std::filesystem::path &instance_dir,
                    const std::vector<std::string> &keep,
                    const std::vector<std::string> &workshop_files);

void flatten_instance(const std::filesystem::path &instance_dir);
DownloadStatus install_instance_archive(
    net::HttpClient &client, const std::string &url,
    const std::filesystem::path &instance_dir,
    const std::filesystem::path &archive_dir, net::CancelToken &token,
    const std::function<void(double percent)> &on_progress = nullptr);

} // namespace emerald::instances