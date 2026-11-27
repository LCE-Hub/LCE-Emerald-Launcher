#include "Instances/InstanceSync.hpp"
#include "Core/Fs.hpp"
namespace emerald::instances {
bool sync_instance(const std::filesystem::path &instance_dir,
                   const std::string &username,
                   const std::filesystem::path &dlc_source,
                   const std::filesystem::path &skin_pck) {
  std::error_code error;
  if (!std::filesystem::is_directory(instance_dir, error)) {
    return false;
  }

  core::write_file(instance_dir / "username.txt", username);
  if (!skin_pck.empty() && core::file_exists(skin_pck)) {
    const std::filesystem::path skin_dir =
        instance_dir / "Windows64Media" / "DLC" / "Custom Skins";
    if (core::ensure_directory(skin_dir)) {
      core::copy_file(skin_pck, skin_dir / "Skin.pck");
    }
  }

  if (dlc_source.empty() || !std::filesystem::is_directory(dlc_source, error)) {
    return true;
  }

  const std::filesystem::path dlc_dest =
      instance_dir / "Windows64Media" / "DLC";
  if (!core::ensure_directory(dlc_dest)) {
    return false;
  }

  std::filesystem::directory_iterator it(dlc_source, error);
  if (error) {
    return false;
  }
  for (const std::filesystem::directory_entry &entry : it) {
    const std::filesystem::path target = dlc_dest / entry.path().filename();
    std::error_code entry_error;
    if (std::filesystem::exists(target, entry_error)) {
      continue;
    }
    if (entry.is_directory(entry_error)) {
      core::copy_directory(entry.path(), target);
    } else {
      core::copy_file(entry.path(), target);
    }
  }
  return true;
}
} // namespace emerald::instances