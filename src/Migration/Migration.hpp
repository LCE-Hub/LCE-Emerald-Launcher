#pragma once
#include "Config/ConfigStore.hpp"
#include "Core/Json.hpp"
#include "Migration/WebviewStorage.hpp"
#include "State/StateStore.hpp"
#include <cstddef>
#include <vector>
namespace emerald::migration {
struct MigrationReport {
  bool ran = false;
  bool completed = false;
  std::size_t storage_files = 0;
  std::size_t entries = 0;
  std::size_t mapped = 0;
};

MigrationReport run_migration(config::ConfigStore &config,
                              state::StateStore &state);
std::size_t apply_local_storage(const std::vector<StorageEntry> &entries,
                                config::AppConfig &config, Json &legacy_out);

} // namespace emerald::migration
