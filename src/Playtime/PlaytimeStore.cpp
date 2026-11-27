#include "Playtime/PlaytimeStore.hpp"
#include "Core/Fs.hpp"
#include "Core/Json.hpp"
#include "Core/Paths.hpp"
#include <algorithm>
#include <chrono>
#include <filesystem>
namespace emerald::playtime {
namespace {
constexpr std::uint64_t kMaxSessionSeconds = 12 * 60 * 60;
constexpr std::uint64_t kDaySeconds = 24 * 60 * 60;
std::filesystem::path active_session_path() {
  return core::app_data_dir() / "active_session.json";
}

} // namespace

std::uint64_t now_seconds() {
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  return static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::seconds>(now).count());
}

void PlaytimeStore::load() {
  data_ = PlaytimeData{};
  auto contents = core::read_file(core::playtime_file_path());
  if (!contents.has_value()) {
    return;
  }

  Json parsed = Json::parse(*contents, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) {
    return;
  }
  const auto sessions = parsed.find("sessions");
  if (sessions == parsed.end() || !sessions->is_object()) {
    return;
  }

  for (const auto &[instance_id, entries] : sessions->items()) {
    if (!entries.is_array()) {
      continue;
    }
    std::vector<Session> list;
    list.reserve(entries.size());
    for (const Json &entry : entries) {
      Session session;
      session.start = entry.value("start", std::uint64_t{0});
      session.end = entry.value("end", std::uint64_t{0});
      list.push_back(session);
    }
    data_.sessions[instance_id] = std::move(list);
  }
}

bool PlaytimeStore::save() const {
  Json sessions = Json::object();
  for (const auto &[instance_id, entries] : data_.sessions) {
    Json array = Json::array();
    for (const Session &session : entries) {
      array.push_back(Json{
          {"start", session.start},
          {"end", session.end},
      });
    }
    sessions[instance_id] = std::move(array);
  }

  Json document = Json::object();
  document["sessions"] = std::move(sessions);
  return core::write_file_atomic(core::playtime_file_path(), document.dump(2));
}

void PlaytimeStore::record_session(const std::string &instance_id,
                                   std::uint64_t start, std::uint64_t end) {
  load();
  data_.sessions[instance_id].push_back(Session{start, end});
  save();
}

void PlaytimeStore::start_active_session(const std::string &instance_id) {
  Json document = Json::object();
  document["instance_id"] = instance_id;
  document["start"] = now_seconds();
  core::write_file_atomic(active_session_path(), document.dump());
}

void PlaytimeStore::finish_active_session() {
  const std::filesystem::path path = active_session_path();
  auto contents = core::read_file(path);
  if (!contents.has_value()) {
    return;
  }
  std::error_code error;
  std::filesystem::remove(path, error);
  Json parsed = Json::parse(*contents, nullptr, false);
  if (parsed.is_discarded() || !parsed.is_object()) {
    return;
  }

  const std::string instance_id = parsed.value("instance_id", std::string{});
  const std::uint64_t start = parsed.value("start", std::uint64_t{0});
  const std::uint64_t now = now_seconds();
  if (now > start && now - start <= kMaxSessionSeconds) {
    record_session(instance_id, start, now);
  }
}

PlaytimeResponse
PlaytimeStore::get_playtime(const std::string &instance_id) const {
  PlaytimeResponse response;
  const auto iterator = data_.sessions.find(instance_id);
  if (iterator == data_.sessions.end()) {
    return response;
  }

  const std::uint64_t now = now_seconds();
  const std::uint64_t week_ago = now - 7 * kDaySeconds;
  const std::uint64_t day_ago = now - kDaySeconds;
  for (const Session &session : iterator->second) {
    const std::uint64_t duration = session.end - session.start;
    response.total_seconds += duration;
    if (session.start >= week_ago) {
      response.week_seconds += duration;
    }
    if (session.start >= day_ago) {
      response.day_seconds += duration;
    }
  }

  return response;
}

std::vector<DayEntry>
PlaytimeStore::get_playtime_daily(const std::string &instance_id,
                                  std::uint64_t days) const {
  const std::uint64_t now = now_seconds();
  std::vector<std::pair<std::uint64_t, std::uint64_t>> entries;
  entries.reserve(static_cast<std::size_t>(days));
  for (std::uint64_t day = 0; day < days; ++day) {
    const std::uint64_t day_start =
        now - (day * kDaySeconds) - (now % kDaySeconds);
    entries.emplace_back(day_start, 0);
  }

  const auto iterator = data_.sessions.find(instance_id);
  if (iterator != data_.sessions.end()) {
    for (const Session &session : iterator->second) {
      for (auto &[day_start, seconds] : entries) {
        const std::uint64_t day_end = day_start + kDaySeconds;
        if (session.start < day_end && session.end > day_start) {
          const std::uint64_t overlap_start =
              std::max(session.start, day_start);
          const std::uint64_t overlap_end = std::min(session.end, day_end);
          if (overlap_end > overlap_start) {
            seconds += overlap_end - overlap_start;
          }
        }
      }
    }
  }

  std::reverse(entries.begin(), entries.end());
  static const char *const kDayNames[] = {"Sun", "Mon", "Tue", "Wed",
                                          "Thu", "Fri", "Sat"};
  std::vector<DayEntry> result;
  result.reserve(entries.size());
  for (const auto &[day_start, seconds] : entries) {
    const std::uint64_t weekday = ((day_start / kDaySeconds) + 4) % 7;
    result.push_back(DayEntry{kDayNames[weekday], seconds});
  }
  return result;
}

} // namespace emerald::playtime
