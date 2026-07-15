import { useState, useEffect, useRef, useCallback } from "react";
import { SPLASHES } from "../data/splashes";

const TRACKS = [
  "music/Moog City 2.opus",
  "music/Blind Spots.ogg",
  "music/Key.ogg",
  "music/Living Mice.ogg",
  "music/Oxygene.ogg",
  "music/Subwoofer Lullaby.ogg",
];

const resolveAudioUrl = (path: string) => {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, window.location.origin).href;
};


interface AudioControllerProps {
  musicVol: number;
  sfxVol: number;
  isGameRunning: boolean;
  isWindowVisible: boolean;
}

export function useAudioController({
  musicVol,
  sfxVol,
  isGameRunning,
  isWindowVisible,
}: AudioControllerProps) {
  const [currentTrack, setCurrentTrack] = useState(0);
  const [splashIndex, setSplashIndex] = useState(-1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const trackBuffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const sfxBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const musicPausedRef = useRef<{ at: number; track: number } | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const targetVolumeRef = useRef(musicVol / 100);
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);
  const isManualSkipRef = useRef(false);
  const ensureAudioContextReady = useCallback(async () => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx;
  }, [getAudioContext]);

  const loadAudioBuffer = useCallback(
    async (url: string): Promise<AudioBuffer | undefined> => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = await ensureAudioContextReady();
        return await ctx.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error("Failed to load audio:", url, error);
        return undefined;
      }
    },
    [ensureAudioContextReady],
  );

  const playSfx = useCallback(
    async (file: string) => {
      const url = resolveAudioUrl(`/sounds/${file}`);
      let buffer = sfxBufferCacheRef.current.get(file);
      if (!buffer) {
        buffer = await loadAudioBuffer(url);
        if (buffer) {
          sfxBufferCacheRef.current.set(file, buffer);
        }
      }

      if (buffer) {
        const ctx = await ensureAudioContextReady();
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        source.buffer = buffer;
        gainNode.gain.value = sfxVol / 100;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start();
      }
    },
    [sfxVol, loadAudioBuffer, ensureAudioContextReady],
  );

  const playPressSound = useCallback(() => playSfx("press.wav"), [playSfx]);
  const playBackSound = useCallback(() => playSfx("back.ogg"), [playSfx]);
  const playSplashSound = useCallback(() => playSfx("orb.ogg"), [playSfx]);

  const stopMusic = useCallback(() => {
    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.stop();
      } catch (e) {}
      musicSourceRef.current.disconnect();
      musicSourceRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  }, []);

  const playMusicBuffer = useCallback(
    async (buffer: AudioBuffer, startTime: number = 0) => {
      const ctx = await ensureAudioContextReady();
      stopMusic();
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.value = 0;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      const offset = startTime % buffer.duration;
      source.start(0, offset);
      musicSourceRef.current = source;
      musicGainRef.current = gainNode;
      const steps = 5;
      const stepDuration = 100;
      let currentStep = 0;
      fadeIntervalRef.current = window.setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = targetVolumeRef.current * progress;
        }
        if (currentStep >= steps) {
          clearInterval(fadeIntervalRef.current || undefined);
          fadeIntervalRef.current = null;
          if (musicGainRef.current) {
            musicGainRef.current.gain.value = targetVolumeRef.current;
          }
        }
      }, stepDuration);
      source.onended = () => {
        if (musicSourceRef.current && !isManualSkipRef.current) {
          setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
        }
        isManualSkipRef.current = false;
      };
    },
    [stopMusic, ensureAudioContextReady],
  );

  const fadeOutMusic = useCallback(
    (duration: number = 500): Promise<void> => {
      return new Promise((resolve) => {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
        if (!musicGainRef.current) {
          resolve();
          return;
        }

        const steps = 5;
        const stepDuration = duration / steps;
        const initialVolume = musicGainRef.current.gain.value;
        let currentStep = 0;

        fadeIntervalRef.current = window.setInterval(() => {
          currentStep++;
          const progress = currentStep / steps;
          if (musicGainRef.current) {
            musicGainRef.current.gain.value = initialVolume * (1 - progress);
          }
          if (currentStep >= steps) {
            clearInterval(fadeIntervalRef.current || undefined);
            fadeIntervalRef.current = null;
            stopMusic();
            if (musicGainRef.current) {
              musicGainRef.current.gain.value = initialVolume;
            }
            resolve();
          }
        }, stepDuration);
      });
    },
    [stopMusic],
  );

  const fadeInMusic = useCallback(
    async (buffer: AudioBuffer, targetVolume: number, duration: number = 500) => {
      const ctx = await ensureAudioContextReady();
      stopMusic();
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.value = 0;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start();
      musicSourceRef.current = source;
      musicGainRef.current = gainNode;
      targetVolumeRef.current = targetVolume;
      const steps = 5;
      const stepDuration = duration / steps;
      let currentStep = 0;
      fadeIntervalRef.current = window.setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        if (musicGainRef.current) {
          musicGainRef.current.gain.value = targetVolume * progress;
        }
        if (currentStep >= steps) {
          clearInterval(fadeIntervalRef.current || undefined);
          fadeIntervalRef.current = null;
          if (musicGainRef.current) {
            musicGainRef.current.gain.value = targetVolume;
          }
        }
      }, stepDuration);

      source.onended = () => {
        if (musicSourceRef.current && !isManualSkipRef.current) {
          setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
        }
        isManualSkipRef.current = false;
      };
    },
    [stopMusic, ensureAudioContextReady],
  );

  const cycleSplash = useCallback(() => {
    playSplashSound();
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * SPLASHES.length);
    } while (newIndex === splashIndex && SPLASHES.length > 1);
    setSplashIndex(newIndex);
  }, [playSplashSound, splashIndex]);
  const skipTrack = useCallback(() => {
    isManualSkipRef.current = true;
    setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
  }, []);
  const [isMusicStarted, setIsMusicStarted] = useState(false);

  const startMusic = useCallback(() => {
    setIsMusicStarted(true);
  }, []);

  useEffect(() => {
    if (!isMusicStarted) return;

    const loadAndPlay = async () => {
      await ensureAudioContextReady();
      
      let buffer = trackBuffersRef.current.get(currentTrack);
      if (!buffer) {
        buffer = await loadAudioBuffer(resolveAudioUrl(TRACKS[currentTrack]));
        if (buffer) {
          trackBuffersRef.current.set(currentTrack, buffer);
        }
      }
      if (buffer) {
        if (currentTrack === 0) {
          await playMusicBuffer(buffer);
        } else {
          await fadeInMusic(buffer, targetVolumeRef.current, 500);
        }
      }
    };

    loadAndPlay();
  }, [isMusicStarted, currentTrack, loadAudioBuffer, playMusicBuffer, fadeInMusic, ensureAudioContextReady]);

  useEffect(() => {
    const shouldPause = isGameRunning || !isWindowVisible;

    if (shouldPause) {
      if (musicSourceRef.current || fadeIntervalRef.current) {
        if (!musicPausedRef.current) {
          const ctx = getAudioContext();
          if (musicGainRef.current) {
            musicPausedRef.current = {
              at: ctx.currentTime,
              track: currentTrack,
            };
          } else {
            musicPausedRef.current = { at: 0, track: currentTrack };
          }
        }
        fadeOutMusic(500);
      }
    } else if (musicPausedRef.current) {
      const { track } = musicPausedRef.current;
      musicPausedRef.current = null;
      targetVolumeRef.current = musicVol / 100;

      const playWithPos = async () => {
        let buffer = trackBuffersRef.current.get(currentTrack);
        if (!buffer) {
          buffer = await loadAudioBuffer(resolveAudioUrl(TRACKS[currentTrack]));
          if (buffer) {
            trackBuffersRef.current.set(currentTrack, buffer);
          }
        }
        if (buffer) {
          await fadeInMusic(buffer, musicVol / 100, 500);
        }
      };

      if (track === currentTrack) {
        playWithPos();
      } else {
        setCurrentTrack(track);
      }
    }
  }, [
    isGameRunning,
    isWindowVisible,
    currentTrack,
    musicVol,
    fadeOutMusic,
    fadeInMusic,
    loadAudioBuffer,
    getAudioContext,
  ]);

  useEffect(() => {
    targetVolumeRef.current = musicVol / 100;
    if (musicGainRef.current && !fadeIntervalRef.current) {
      musicGainRef.current.gain.value = musicVol / 100;
    }
  }, [musicVol]);

  return {
    currentTrack,
    setCurrentTrack,
    skipTrack,
    splashIndex,
    setSplashIndex,
    cycleSplash,
    playPressSound,
    playBackSound,
    playSfx,
    tracks: TRACKS,
    splashes: SPLASHES,
    startMusic,
  };
}
