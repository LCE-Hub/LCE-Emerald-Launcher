#include "State/StateStore.hpp"
#include "Core/Fs.hpp"
#include "Core/Paths.hpp"
#include <chrono>
namespace emerald::state {
namespace {
std::uint64_t now_seconds() {
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  return static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::seconds>(now).count());
}

Json &ensure_object(Json &document, const char *key) {
  if (!document.contains(key) || !document[key].is_object()) {
    document[key] = Json::object();
  }
  return document[key];
}

} // namespace

void StateStore::load() {
  document_ = Json::object();
  auto contents = core::read_file(core::state_file_path());
  if (!contents.has_value()) {
    return;
  }
  Json parsed = Json::parse(*contents, nullptr, false);
  if (!parsed.is_discarded() && parsed.is_object()) {
    document_ = parsed;
  }
}

bool StateStore::save() const {
  return core::write_file_atomic(core::state_file_path(), document_.dump(2));
}

bool StateStore::migration_completed() const {
  const auto migration = document_.find("migration");
  if (migration == document_.end() || !migration->is_object()) {
    return false;
  }
  return migration->value("completed", false);
}

void StateStore::set_migration_completed(const std::string &version) {
  Json &migration = ensure_object(document_, "migration");
  migration["completed"] = true;
  migration["version"] = version;
  migration["timestamp"] = now_seconds();
}

const Json &StateStore::legacy_local_storage() const {
  static const Json empty = Json::object();
  const auto storage = document_.find("legacyLocalStorage");
  if (storage == document_.end() || !storage->is_object()) {
    return empty;
  }
  return *storage;
}

void StateStore::set_legacy_local_storage(Json storage) {
  document_["legacyLocalStorage"] = std::move(storage);
}
} // namespace emerald::state
