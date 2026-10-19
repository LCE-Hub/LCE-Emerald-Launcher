#pragma once
#include "Core/Json.hpp"
#include <string>
namespace emerald::state {
class StateStore {
public:
  void load();
  bool save() const;
  bool migration_completed() const;
  void set_migration_completed(const std::string &version);
  const Json &legacy_local_storage() const;
  void set_legacy_local_storage(Json storage);
  const Json &document() const { return document_; }

private:
  Json document_ = Json::object();
};

} // namespace emerald::state
