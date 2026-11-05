#pragma once
#include <string_view>
namespace emerald::core {
enum class LogLevel {
  Debug,
  Info,
  Warn,
  Error,
};

void log(LogLevel level, std::string_view message);
void debug(std::string_view message);
void info(std::string_view message);
void warn(std::string_view message);
void error(std::string_view message);

} // namespace emerald::core
