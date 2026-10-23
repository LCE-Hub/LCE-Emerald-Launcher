#pragma once
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>
namespace emerald::playtime {
struct Session {
  std::uint64_t start = 0;
  std::uint64_t end = 0;
};

struct PlaytimeData {
  std::unordered_map<std::string, std::vector<Session>> sessions;
};

struct PlaytimeResponse {
  std::uint64_t total_seconds = 0;
  std::uint64_t week_seconds = 0;
  std::uint64_t day_seconds = 0;
};

struct DayEntry {
  std::string label;
  std::uint64_t seconds = 0;
};

std::uint64_t now_seconds();
class PlaytimeStore {
public:
  void load();
  bool save() const;
  PlaytimeData &data() { return data_; }
  const PlaytimeData &data() const { return data_; }
  void record_session(const std::string &instance_id, std::uint64_t start,
                      std::uint64_t end);

  void start_active_session(const std::string &instance_id);
  void finish_active_session();
  PlaytimeResponse get_playtime(const std::string &instance_id) const;
  std::vector<DayEntry> get_playtime_daily(const std::string &instance_id,
                                           std::uint64_t days) const;

private:
  PlaytimeData data_;
};
} // namespace emerald::playtime
