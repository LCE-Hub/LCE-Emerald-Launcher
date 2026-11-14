#pragma once
#include <cstddef>
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>
namespace emerald::platform {
struct ProcessImpl;
struct ProcessSpec {
  std::string program;
  std::vector<std::string> arguments;
  std::filesystem::path working_dir;
  std::map<std::string, std::string> environment;
  std::vector<std::string> remove_environment;
  bool new_process_group = true;
  bool no_window = false;
};

class Process {
public:
  static constexpr std::size_t kMaxLogBytes = 1024 * 1024;
  Process();
  ~Process();
  Process(const Process &) = delete;
  Process &operator=(const Process &) = delete;
  Process(Process &&) = delete;
  Process &operator=(Process &&) = delete;
  bool spawn(const ProcessSpec &spec, std::string &error);
  bool started() const;
  bool running() const;
  int exit_code() const;
  bool poll(int &exit_code);
  std::string log() const;
  void clear_log();
  void terminate();
  void wait();

private:
  std::unique_ptr<ProcessImpl> impl_;
};
} // namespace emerald::platform
