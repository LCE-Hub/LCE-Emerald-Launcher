#pragma once
#include <filesystem>
#include <string>
#include <vector>
namespace emerald::platform {
enum class BridgeAction {
  Play,
  OpenContainer,
  OpenSettings,
  SwitchProton,
  InstallDriver,
  SetAudioBackend,
};

bool android_bridge_start(const std::filesystem::path &instance_path,
                          BridgeAction action,
                          const std::vector<std::string> &extra_args = {});
void android_prepare_runtime_files();
} // namespace emerald::platform
