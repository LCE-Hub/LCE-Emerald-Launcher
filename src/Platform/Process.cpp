#include "Platform/Process.hpp"
#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <set>
#include <thread>
#if defined(_WIN32)
#include <windows.h>
#else
#include <cerrno>
#include <csignal>
#include <fcntl.h>
#include <poll.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
extern char **environ;
#endif
namespace emerald::platform {
#if defined(_WIN32)
namespace {
std::string quote_argument(const std::string &argument) {
  if (!argument.empty() &&
      argument.find_first_of(" \t\"") == std::string::npos) {
    return argument;
  }
  std::string result = "\"";
  std::size_t backslashes = 0;
  for (const char character : argument) {
    if (character == '\\') {
      ++backslashes;
      continue;
    }
    if (character == '"') {
      result.append(backslashes * 2 + 1, '\\');
      result += '"';
      backslashes = 0;
      continue;
    }
    result.append(backslashes, '\\');
    backslashes = 0;
    result += character;
  }
  result.append(backslashes * 2, '\\');
  result += '"';
  return result;
}
} // namespace
#endif

struct ProcessImpl {
  bool started = false;
  bool running = false;
  bool new_process_group = true;
  int exit_code = -1;
  std::thread reader;
  std::atomic<bool> reader_stop{false};
  std::atomic<bool> reader_done{false};
  bool child_reaped = false;
  mutable std::mutex mutex;
  std::string log;
#if defined(_WIN32)
  void *process = nullptr;
  void *read_handle = nullptr;
#else
  int read_fd = -1;
  pid_t pid = -1;
#endif
};

namespace {
void append_log(ProcessImpl &impl, const char *data, std::size_t size) {
  std::lock_guard<std::mutex> lock(impl.mutex);
  impl.log.append(data, size);
  if (impl.log.size() > Process::kMaxLogBytes) {
    impl.log.erase(0, impl.log.size() - Process::kMaxLogBytes);
  }
}
} // namespace

Process::Process() : impl_(std::make_unique<ProcessImpl>()) {}
Process::~Process() {
  if (impl_ != nullptr && impl_->started && impl_->running) {
    terminate();
    wait();
  }
  if (impl_ != nullptr && impl_->reader.joinable()) {
    impl_->reader_stop.store(true);
    impl_->reader.join();
  }
}

bool Process::started() const { return impl_ != nullptr && impl_->started; }
bool Process::running() const { return impl_ != nullptr && impl_->running; }
int Process::exit_code() const {
  return impl_ != nullptr ? impl_->exit_code : -1;
}

#if !defined(_WIN32)
namespace {
std::string resolve_program(const std::string &program) {
  if (program.find('/') != std::string::npos) {
    return program;
  }
  const char *path_env = std::getenv("PATH");
  if (path_env == nullptr) {
    return program;
  }
  const std::string paths(path_env);
  std::size_t start = 0;
  while (start <= paths.size()) {
    const std::size_t colon = paths.find(':', start);
    const std::string directory = paths.substr(
        start, colon == std::string::npos ? std::string::npos : colon - start);
    if (!directory.empty()) {
      const std::string candidate = directory + "/" + program;
      if (access(candidate.c_str(), X_OK) == 0) {
        return candidate;
      }
    }
    if (colon == std::string::npos) {
      break;
    }
    start = colon + 1;
  }
  return program;
}

std::vector<std::string> build_environment(const ProcessSpec &spec) {
  const std::set<std::string> removed(spec.remove_environment.begin(),
                                      spec.remove_environment.end());
  std::vector<std::string> environment;
  for (char **entry = environ; entry != nullptr && *entry != nullptr; ++entry) {
    const std::string text(*entry);
    const std::size_t equal = text.find('=');
    const std::string key = text.substr(0, equal);
    if (removed.count(key) != 0) {
      continue;
    }
    environment.push_back(text);
  }
  for (const auto &[key, value] : spec.environment) {
    bool replaced = false;
    const std::string prefix = key + "=";
    for (std::string &existing : environment) {
      if (existing.rfind(prefix, 0) == 0) {
        existing = prefix + value;
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      environment.push_back(prefix + value);
    }
  }
  return environment;
}

void read_output(ProcessImpl &impl) {
  char buffer[16384];
  for (;;) {
    struct pollfd descriptor{};
    descriptor.fd = impl.read_fd;
    descriptor.events = POLLIN;
    const int ready = poll(&descriptor, 1, 100);
    if (ready < 0) {
      if (errno == EINTR) {
        continue;
      }
      break;
    }
    if (ready == 0) {
      if (impl.reader_stop.load()) {
        break;
      }
      continue;
    }
    const ssize_t count = read(impl.read_fd, buffer, sizeof(buffer));
    if (count > 0) {
      append_log(impl, buffer, static_cast<std::size_t>(count));
      continue;
    }
    if (count == 0) {
      break;
    }
    if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK) {
      continue;
    }
    break;
  }
  close(impl.read_fd);
  impl.read_fd = -1;
  impl.reader_done.store(true);
}
} // namespace

bool Process::spawn(const ProcessSpec &spec, std::string &error) {
  if (impl_->started) {
    error = "process already started";
    return false;
  }
  if (spec.program.empty()) {
    error = "no program specified";
    return false;
  }

  const std::string resolved = resolve_program(spec.program);
  std::vector<std::string> argument_storage;
  argument_storage.push_back(spec.program);
  for (const std::string &argument : spec.arguments) {
    argument_storage.push_back(argument);
  }
  std::vector<char *> argv;
  argv.reserve(argument_storage.size() + 1);
  for (std::string &argument : argument_storage) {
    argv.push_back(argument.data());
  }
  argv.push_back(nullptr);
  std::vector<std::string> environment_storage = build_environment(spec);
  std::vector<char *> envp;
  envp.reserve(environment_storage.size() + 1);
  for (std::string &entry : environment_storage) {
    envp.push_back(entry.data());
  }
  envp.push_back(nullptr);
  int output_pipe[2] = {-1, -1};
  int error_pipe[2] = {-1, -1};
  if (pipe(output_pipe) != 0 || pipe(error_pipe) != 0) {
    error = std::strerror(errno);
    return false;
  }
  fcntl(error_pipe[1], F_SETFD, FD_CLOEXEC);

  const pid_t pid = fork();
  if (pid < 0) {
    error = std::strerror(errno);
    close(output_pipe[0]);
    close(output_pipe[1]);
    close(error_pipe[0]);
    close(error_pipe[1]);
    return false;
  }

  if (pid == 0) {
    if (spec.new_process_group) {
      setpgid(0, 0);
    }
    if (!spec.working_dir.empty()) {
      if (chdir(spec.working_dir.c_str()) != 0) {
        const int code = errno;
        (void)!write(error_pipe[1], &code, sizeof(code));
        _exit(127);
      }
    }
    const int devnull = open("/dev/null", O_RDONLY);
    if (devnull >= 0) {
      dup2(devnull, STDIN_FILENO);
    }
    dup2(output_pipe[1], STDOUT_FILENO);
    dup2(output_pipe[1], STDERR_FILENO);
    if (devnull > 2) {
      close(devnull);
    }
    close(output_pipe[0]);
    close(output_pipe[1]);
    close(error_pipe[0]);
    execve(resolved.c_str(), argv.data(), envp.data());
    const int code = errno;
    (void)!write(error_pipe[1], &code, sizeof(code));
    _exit(127);
  }

  close(output_pipe[1]);
  close(error_pipe[1]);
  int child_errno = 0;
  const ssize_t read_count =
      read(error_pipe[0], &child_errno, sizeof(child_errno));
  close(error_pipe[0]);
  if (read_count > 0) {
    int status = 0;
    waitpid(pid, &status, 0);
    close(output_pipe[0]);
    error =
        "failed to start '" + spec.program + "': " + std::strerror(child_errno);
    return false;
  }

  impl_->read_fd = output_pipe[0];
  impl_->pid = pid;
  impl_->new_process_group = spec.new_process_group;
  impl_->started = true;
  impl_->running = true;
  impl_->reader = std::thread(read_output, std::ref(*impl_));
  return true;
}

bool Process::poll(int &exit_code) {
  if (impl_ == nullptr || !impl_->started) {
    return false;
  }
  if (!impl_->running) {
    exit_code = impl_->exit_code;
    return true;
  }
  if (!impl_->child_reaped) {
    int status = 0;
    const pid_t result = waitpid(impl_->pid, &status, WNOHANG);
    if (result == impl_->pid) {
      if (WIFEXITED(status)) {
        impl_->exit_code = WEXITSTATUS(status);
      } else if (WIFSIGNALED(status)) {
        impl_->exit_code = 128 + WTERMSIG(status);
      } else {
        impl_->exit_code = -1;
      }
      impl_->child_reaped = true;
    } else if (result < 0 && errno == ECHILD) {
      impl_->child_reaped = true;
    } else {
      return false;
    }
  }
  if (!impl_->reader_done.load()) {
    return false;
  }
  if (impl_->reader.joinable()) {
    impl_->reader.join();
  }
  impl_->running = false;
  exit_code = impl_->exit_code;
  return true;
}

void Process::terminate() {
  if (impl_ == nullptr || !impl_->running) {
    return;
  }
  if (impl_->new_process_group) {
    kill(-impl_->pid, SIGKILL);
  } else {
    kill(impl_->pid, SIGKILL);
  }
}

void Process::wait() {
  if (impl_ == nullptr || !impl_->started || !impl_->running) {
    return;
  }
  int code = 0;
  while (!poll(code)) {
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
}
#else
namespace {
void read_output(ProcessImpl &impl) {
  char buffer[16384];
  for (;;) {
    DWORD read = 0;
    const BOOL ok =
        ReadFile(impl.read_handle, buffer, sizeof(buffer), &read, nullptr);
    if (!ok || read == 0) {
      break;
    }
    append_log(impl, buffer, read);
  }
  CloseHandle(impl.read_handle);
  impl.read_handle = nullptr;
  impl.reader_done.store(true);
}
} // namespace

bool Process::spawn(const ProcessSpec &spec, std::string &error) {
  if (impl_->started) {
    error = "process already started";
    return false;
  }
  SECURITY_ATTRIBUTES attributes{};
  attributes.nLength = sizeof(attributes);
  attributes.bInheritHandle = TRUE;
  HANDLE read_pipe = nullptr;
  HANDLE write_pipe = nullptr;
  if (!CreatePipe(&read_pipe, &write_pipe, &attributes, 0)) {
    error = "failed to create pipe";
    return false;
  }
  SetHandleInformation(read_pipe, HANDLE_FLAG_INHERIT, 0);
  std::string command_line = quote_argument(spec.program);
  for (const std::string &argument : spec.arguments) {
    command_line += ' ';
    command_line += quote_argument(argument);
  }

  std::vector<char> environment_block;
  const bool has_environment =
      !spec.environment.empty() || !spec.remove_environment.empty();
  if (has_environment) {
    const std::set<std::string> removed(spec.remove_environment.begin(),
                                        spec.remove_environment.end());
    std::map<std::string, std::string> variables;
    LPCH current = GetEnvironmentStringsA();
    if (current != nullptr) {
      for (LPCH entry = current; *entry != '\0';) {
        const std::string text(entry);
        entry += text.size() + 1;
        const std::size_t equal = text.find('=');
        if (equal == std::string::npos || equal == 0) {
          continue;
        }
        const std::string key = text.substr(0, equal);
        if (removed.count(key) != 0) {
          continue;
        }
        variables[key] = text.substr(equal + 1);
      }
      FreeEnvironmentStringsA(current);
    }
    for (const auto &[key, value] : spec.environment) {
      variables[key] = value;
    }
    for (const auto &[key, value] : variables) {
      const std::string text = key + "=" + value;
      environment_block.insert(environment_block.end(), text.begin(),
                               text.end());
      environment_block.push_back('\0');
    }
    environment_block.push_back('\0');
  }

  STARTUPINFOA startup{};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdOutput = write_pipe;
  startup.hStdError = write_pipe;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  PROCESS_INFORMATION info{};
  DWORD flags = 0;
  if (spec.no_window) {
    flags |= CREATE_NO_WINDOW;
  }
  if (spec.new_process_group) {
    flags |= CREATE_NEW_PROCESS_GROUP;
  }
  std::vector<char> mutable_command(command_line.begin(), command_line.end());
  mutable_command.push_back('\0');
  const std::string working = spec.working_dir.string();
  const BOOL ok = CreateProcessA(
      nullptr, mutable_command.data(), nullptr, nullptr, TRUE, flags,
      has_environment ? environment_block.data() : nullptr,
      spec.working_dir.empty() ? nullptr : working.c_str(), &startup, &info);
  CloseHandle(write_pipe);
  if (!ok) {
    CloseHandle(read_pipe);
    error = "failed to start process";
    return false;
  }
  CloseHandle(info.hThread);
  impl_->process = info.hProcess;
  impl_->read_handle = read_pipe;
  impl_->new_process_group = spec.new_process_group;
  impl_->started = true;
  impl_->running = true;
  impl_->reader = std::thread(read_output, std::ref(*impl_));
  return true;
}

bool Process::poll(int &exit_code) {
  if (impl_ == nullptr || !impl_->started) {
    return false;
  }
  if (!impl_->running) {
    exit_code = impl_->exit_code;
    return true;
  }
  if (!impl_->child_reaped) {
    const DWORD result = WaitForSingleObject(impl_->process, 0);
    if (result != WAIT_OBJECT_0) {
      return false;
    }
    DWORD code = 0;
    if (GetExitCodeProcess(impl_->process, &code)) {
      impl_->exit_code = static_cast<int>(code);
    }
    impl_->child_reaped = true;
  }
  if (!impl_->reader_done.load()) {
    return false;
  }
  if (impl_->reader.joinable()) {
    impl_->reader.join();
  }
  impl_->running = false;
  exit_code = impl_->exit_code;
  return true;
}

void Process::terminate() {
  if (impl_ == nullptr || !impl_->running) {
    return;
  }
  TerminateProcess(impl_->process, 1);
}

void Process::wait() {
  if (impl_ == nullptr || !impl_->started) {
    return;
  }
  WaitForSingleObject(impl_->process, INFINITE);
  if (impl_->reader.joinable()) {
    impl_->reader.join();
  }
  impl_->running = false;
}
#endif

std::string Process::log() const {
  if (impl_ == nullptr) {
    return {};
  }
  std::lock_guard<std::mutex> lock(impl_->mutex);
  return impl_->log;
}

void Process::clear_log() {
  if (impl_ == nullptr) {
    return;
  }
  std::lock_guard<std::mutex> lock(impl_->mutex);
  impl_->log.clear();
}
} // namespace emerald::platform
