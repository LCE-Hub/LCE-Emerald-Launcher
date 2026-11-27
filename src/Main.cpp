#include "App/Application.hpp"
#include "Core/Log.hpp"
#include <SDL3/SDL_main.h>
#include <string_view>
#include <vector>
int main(int argc, char *argv[]) {
    std::vector<std::string_view> x;
    for (int i = 1; i < argc; ++i) {
        std::string_view arg{argv[i]};
        if (arg == "--verbose") {
            emerald::core::set_verbose(true);
            continue;
        }

        x.push_back(arg);
    }
  if (emerald::core::verbose()) {
    emerald::core::info(":: verbose logging enabled");
  }
  emerald::app::Application application;
  return application.run(x);
}
