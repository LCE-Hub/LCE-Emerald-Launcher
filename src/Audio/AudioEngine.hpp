#pragma once
#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <string_view>
namespace emerald::audio {
class AudioEngine {
public:
  AudioEngine();
  ~AudioEngine();
  AudioEngine(const AudioEngine &) = delete;
  AudioEngine &operator=(const AudioEngine &) = delete;
  AudioEngine(AudioEngine &&) = delete;
  AudioEngine &operator=(AudioEngine &&) = delete;
  bool initialize(std::filesystem::path assets_root);
  void shutdown();
  bool available() const;
  void set_music_volume(std::uint32_t volume);
  void set_sfx_volume(std::uint32_t volume);
  std::uint32_t music_volume() const;
  std::uint32_t sfx_volume() const;
  void play_sfx(std::string_view name);
  void play_press();
  void play_back();
  void play_scroll();
  void play_splash();
  void start_music();
  void stop_music();
  void skip_track(int direction = 1);
  void set_music_paused(bool paused);
  bool music_paused() const;
  bool music_playing() const;
  std::string current_track_name() const;
  void update();

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
} // namespace emerald::audio
