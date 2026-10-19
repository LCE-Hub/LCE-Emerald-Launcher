#include "Core/Log.hpp"
#include <SDL3/SDL_log.h>
namespace emerald::core {
namespace {
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

void log(LogLevel level, std::string_view message) {
  SDL_LogMessage(SDL_LOG_CATEGORY_APPLICATION, to_sdl_priority(level), "%.*s",
                 static_cast<int>(message.size()), message.data());
}

void debug(std::string_view message) { log(LogLevel::Debug, message); }
void info(std::string_view message) { log(LogLevel::Info, message); }
void warn(std::string_view message) { log(LogLevel::Warn, message); }
void error(std::string_view message) { log(LogLevel::Error, message); }
} // namespace emerald::core
