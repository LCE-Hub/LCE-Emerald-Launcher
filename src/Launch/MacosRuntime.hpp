#pragma once
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
namespace emerald::launch {
enum class MacosSetupStage {
  idle,
  resolving,
  downloading,
  extracting,
  initializing,
  dxvk_downloading,
  dxvk_extracting,
  patching,
  done,
  failed,
};

struct MacosSetupProgress {
  MacosSetupStage stage = MacosSetupStage::idle;
  std::string message;
  std::optional<double> percent;
  bool active() const {
    return stage != MacosSetupStage::idle && stage != MacosSetupStage::done &&
           stage != MacosSetupStage::failed;
  }
};

class MacosRuntime {
public:
  MacosRuntime() = default;
  ~MacosRuntime();
  MacosRuntime(const MacosRuntime &) = delete;
  MacosRuntime &operator=(const MacosRuntime &) = delete;
  bool start(const std::optional<std::string> &proxy);
  void cancel();
  void shutdown();
  MacosSetupProgress progress() const;
  bool active() const;
  std::uint64_t revision() const;

private:
  struct Job;
  void run(const std::shared_ptr<Job> &job, std::optional<std::string> proxy);
  void update(const std::shared_ptr<Job> &job, MacosSetupStage stage,
              std::string message, std::optional<double> percent);
  void fail(const std::shared_ptr<Job> &job, const std::string &message);
  mutable std::mutex mutex_;
  std::shared_ptr<Job> job_;
  std::uint64_t revision_ = 0;
};
} // namespace emerald::launch
