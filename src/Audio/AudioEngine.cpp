#include "Audio/AudioEngine.hpp"
#include "Core/Log.hpp"
#include "miniaudio.h"
#include <atomic>
#include <utility>
namespace emerald::audio {
namespace {
constexpr const char *kMusicTracks[] = {
    "music/Moog City 2.ogg", "music/Blind Spots.ogg",
    "music/Key.ogg",         "music/Living Mice.ogg",
    "music/Oxygene.ogg",     "music/Subwoofer Lullaby.ogg",
};
constexpr std::size_t kMusicTrackCount =
    sizeof(kMusicTracks) / sizeof(kMusicTracks[0]);
constexpr const char *kPressSound = "press.wav";
constexpr const char *kBackSound = "back.ogg";
constexpr const char *kScrollSound = "scroll.ogg";
constexpr const char *kSplashSound = "orb.ogg";
constexpr ma_uint64 kFadeMilliseconds = 500;
constexpr ma_uint64 kPauseFadeMilliseconds = 300;
} // namespace

struct AudioEngine::Impl {
  ma_engine engine{};
  ma_sound_group music_group{};
  ma_sound_group sfx_group{};
  ma_sound music{};
  std::filesystem::path assets_root;
  std::atomic<bool> track_finished{false};
  bool engine_ready = false;
  bool music_group_ready = false;
  bool sfx_group_ready = false;
  bool music_loaded = false;
  bool started = false;
  bool paused = false;
  std::size_t track = 0;
  ma_uint64 pause_cursor = 0;
  std::uint32_t music_volume = 50;
  std::uint32_t sfx_volume = 100;
  static void on_track_end(void *user_data, ma_sound *sound) {
    (void)sound;
    static_cast<Impl *>(user_data)->track_finished.store(true);
  }

  void unload_music() {
    if (!music_loaded) {
      return;
    }
    ma_sound_stop(&music);
    ma_sound_uninit(&music);
    music_loaded = false;
  }

  bool play_track(std::size_t index, bool fade) {
    if (!engine_ready || kMusicTrackCount == 0) {
      return false;
    }
    unload_music();
    track = index % kMusicTrackCount;
    const std::filesystem::path path = assets_root / kMusicTracks[track];
    const ma_uint32 flags = MA_SOUND_FLAG_STREAM |
                            MA_SOUND_FLAG_NO_SPATIALIZATION |
                            MA_SOUND_FLAG_NO_PITCH;
    const ma_result result = ma_sound_init_from_file(
        &engine, path.string().c_str(), flags, &music_group, nullptr, &music);
    if (result != MA_SUCCESS) {
      core::warn(std::string{"audio: failed to load "} + path.string() + " (" +
                 ma_result_description(result) + ")");
      return false;
    }
    ma_sound_set_end_callback(&music, &Impl::on_track_end, this);
    ma_sound_set_volume(&music, 1.0F);
    if (fade) {
      ma_sound_set_fade_in_milliseconds(&music, 0.0F, 1.0F, kFadeMilliseconds);
    }
    ma_sound_start(&music);
    music_loaded = true;
    return true;
  }
};

AudioEngine::AudioEngine() : impl_(std::make_unique<Impl>()) {}
AudioEngine::~AudioEngine() { shutdown(); }
bool AudioEngine::initialize(std::filesystem::path assets_root) {
  if (impl_->engine_ready) {
    return true;
  }
  impl_->assets_root = std::move(assets_root);
  ma_engine_config config = ma_engine_config_init();
  const ma_result result = ma_engine_init(&config, &impl_->engine);
  if (result != MA_SUCCESS) {
    core::warn(std::string{"audio: engine unavailable ("} +
               ma_result_description(result) + ")");
    return false;
  }
  impl_->engine_ready = true;
  if (ma_sound_group_init(&impl_->engine, MA_SOUND_FLAG_NO_SPATIALIZATION,
                          nullptr, &impl_->music_group) == MA_SUCCESS) {
    impl_->music_group_ready = true;
  }
  if (ma_sound_group_init(&impl_->engine, MA_SOUND_FLAG_NO_SPATIALIZATION,
                          nullptr, &impl_->sfx_group) == MA_SUCCESS) {
    impl_->sfx_group_ready = true;
  }
  core::info(":: audio engine ready");
  return true;
}

void AudioEngine::shutdown() {
  if (impl_ == nullptr) {
    return;
  }
  impl_->unload_music();
  if (impl_->music_group_ready) {
    ma_sound_group_uninit(&impl_->music_group);
    impl_->music_group_ready = false;
  }
  if (impl_->sfx_group_ready) {
    ma_sound_group_uninit(&impl_->sfx_group);
    impl_->sfx_group_ready = false;
  }
  if (impl_->engine_ready) {
    ma_engine_uninit(&impl_->engine);
    impl_->engine_ready = false;
  }
  impl_->started = false;
  impl_->paused = false;
}

bool AudioEngine::available() const {
  return impl_ != nullptr && impl_->engine_ready;
}

void AudioEngine::set_music_volume(std::uint32_t volume) {
  impl_->music_volume = volume;
  if (!impl_->music_group_ready) {
    return;
  }
  ma_sound_group_set_volume(&impl_->music_group,
                            static_cast<float>(volume) / 100.0F);
}

void AudioEngine::set_sfx_volume(std::uint32_t volume) {
  impl_->sfx_volume = volume;
  if (!impl_->sfx_group_ready) {
    return;
  }
  ma_sound_group_set_volume(&impl_->sfx_group,
                            static_cast<float>(volume) / 100.0F);
}

std::uint32_t AudioEngine::music_volume() const { return impl_->music_volume; }
std::uint32_t AudioEngine::sfx_volume() const { return impl_->sfx_volume; }
void AudioEngine::play_sfx(std::string_view name) {
  if (!impl_->engine_ready || !impl_->sfx_group_ready || name.empty()) {
    return;
  }
  const std::filesystem::path path =
      impl_->assets_root / "sounds" / std::string(name);
  ma_engine_play_sound(&impl_->engine, path.string().c_str(),
                       &impl_->sfx_group);
}

void AudioEngine::play_press() { play_sfx(kPressSound); }
void AudioEngine::play_back() { play_sfx(kBackSound); }
void AudioEngine::play_scroll() { play_sfx(kScrollSound); }
void AudioEngine::play_splash() { play_sfx(kSplashSound); }
void AudioEngine::start_music() {
  if (!impl_->engine_ready || impl_->started) {
    return;
  }
  impl_->started = true;
  impl_->paused = false;
  impl_->play_track(0, true);
}

void AudioEngine::stop_music() {
  impl_->unload_music();
  impl_->started = false;
  impl_->paused = false;
}

void AudioEngine::skip_track(int direction) {
  if (!impl_->engine_ready || !impl_->started) {
    return;
  }
  const int count = static_cast<int>(kMusicTrackCount);
  int next = (static_cast<int>(impl_->track) + direction) % count;
  if (next < 0) {
    next += count;
  }
  impl_->track_finished.store(false);
  impl_->play_track(static_cast<std::size_t>(next), true);
}

void AudioEngine::set_music_paused(bool paused) {
  if (impl_->paused == paused) {
    return;
  }
  impl_->paused = paused;
  if (!impl_->engine_ready || !impl_->started) {
    return;
  }
  if (paused) {
    if (impl_->music_loaded) {
      ma_sound_get_cursor_in_pcm_frames(&impl_->music, &impl_->pause_cursor);
      ma_sound_set_fade_in_milliseconds(&impl_->music, -1.0F, 0.0F,
                                        kPauseFadeMilliseconds);
      const ma_uint64 now = ma_engine_get_time_in_milliseconds(&impl_->engine);
      ma_sound_set_stop_time_in_milliseconds(&impl_->music,
                                             now + kPauseFadeMilliseconds + 20);
    }
    return;
  }
  if (impl_->music_loaded) {
    ma_sound_reset_stop_time_and_fade(&impl_->music);
    ma_sound_seek_to_pcm_frame(&impl_->music, impl_->pause_cursor);
    ma_sound_set_volume(&impl_->music, 1.0F);
    ma_sound_set_fade_in_milliseconds(&impl_->music, 0.0F, 1.0F,
                                      kFadeMilliseconds);
    ma_sound_start(&impl_->music);
    return;
  }
  impl_->play_track(impl_->track, true);
}

bool AudioEngine::music_paused() const { return impl_->paused; }
bool AudioEngine::music_playing() const {
  return impl_->music_loaded && ma_sound_is_playing(&impl_->music) != 0;
}

std::string AudioEngine::current_track_name() const {
  if (!impl_->started) {
    return {};
  }
  return std::filesystem::path(kMusicTracks[impl_->track]).stem().string();
}

void AudioEngine::update() {
  if (!impl_->engine_ready) {
    return;
  }
  if (!impl_->track_finished.exchange(false)) {
    return;
  }
  if (!impl_->started || impl_->paused) {
    return;
  }
  impl_->play_track((impl_->track + 1) % kMusicTrackCount, true);
}
} // namespace emerald::audio
