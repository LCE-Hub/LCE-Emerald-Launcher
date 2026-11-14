#include "App/Application.hpp"
#include "Core/Log.hpp"
#include <SDL3/SDL_main.h>
#include <string_view>
int main(int argc, char *argv[]) {
  for (int i = 1; i < argc; ++i) {
    if (std::string_view{argv[i]} == "--verbose") {
      emerald::core::set_verbose(true);
    }
  }
  if (emerald::core::verbose()) {
    emerald::core::info("verbose logging enabled");
  }
  emerald::app::Application application;
  return application.run();
}
