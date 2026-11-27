#pragma once
#include "Net/HttpClient.hpp"
#include <filesystem>
#include <functional>
#include <string>
#include <vector>
namespace emerald::instances {
struct Runner {
  std::string id;
  std::string name;
  std::string path;
  std::string type;
};

bool is_proton_runner(const Runner &runner);
std::string runner_program(const Runner &runner);
class RunnerManager {
public:
  std::vector<Runner> available() const;
  static std::filesystem::path runners_dir();
  static bool
  download_runner(net::HttpClient &client, const std::string &name,
                  const std::string &url, net::CancelToken &token,
                  const std::function<void(double percent)> &on_progress,
                  std::string &error);
};
} // namespace emerald::instances