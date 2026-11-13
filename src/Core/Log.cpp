#include "Core/Log.hpp"
#include <SDL3/SDL_log.h>
#include <atomic>
namespace emerald::core {
namespace {
std::atomic<bool> g_verbose{false};
SDL_LogPriority to_sdl_priority(LogLevel level) {
  switch (level) {
  case LogLevel::Debug:
    return SDL_LOG_PRIORITY_DEBUG;
  case LogLevel::Info:
    return SDL_LOG_PRIORITY_INFO;
  case LogLevel::Warn:
    return SDL_LOG_PRIORITY_WARN;
  case LogLevel::Error:
    return SDL_LOG_PRIORITY_ERROR;
  }
  return SDL_LOG_PRIORITY_INFO;
}

} // namespace

void set_verbose(bool enabled) { g_verbose.store(enabled); }
bool verbose() { return g_verbose.load(); }
void log(LogLevel level, std::string_view message) {
  SDL_LogMessage(SDL_LOG_CATEGORY_APPLICATION, to_sdl_priority(level), "%.*s",
                 static_cast<int>(message.size()), message.data());
}

void debug(std::string_view message) { log(LogLevel::Debug, message); }
void info(std::string_view message) { log(LogLevel::Info, message); }
void warn(std::string_view message) { log(LogLevel::Warn, message); }
void error(std::string_view message) { log(LogLevel::Error, message); }
} // namespace emerald::core
