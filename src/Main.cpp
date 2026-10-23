#include "App/Application.hpp"
#include <SDL3/SDL_main.h>
int main(int argc, char *argv[]) {
  (void)argc;
  (void)argv;
  emerald::app::Application application;
  return application.run();
}
