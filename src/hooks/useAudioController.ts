import { useState, useEffect, useRef, useCallback } from "react";

const TRACKS = [
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

const SPLASHES = [
  "Legacy is back!",
  "Pixelated goodness!",
  "Console Edition vibe!",
  "100% Not Microsoft!",
  "Symmetry is key!",
  "Does anyone even read these?",
  "Task failed successfully.",
  "Hardware accelerated!",
  "It's a feature, not a bug.",
  "Look behind you.",
  "Works on my machine.",
  "Now gluten-free!",
  "Mom, get the camera!",
  "Batteries not included.",
  "May contain nuts.",
  "Press Alt+F4 for diamonds!",
  "Downloading more RAM...",
  "Reinventing the wheel!",
  "The cake is a lie.",
  "Powered by copious amounts of coffee.",
  "I'm running out of ideas.",
  "That's no moon...",
  "Now with 100% more nostalgia!",
  "Legacy is the new modern.",
  "No microtransactions!",
  "As seen on TV!",
  "Ironic, isn't it?",
  "Creeper? Aww man.",
  "Technoblade never dies!",
  "is smartcmd dead ?",
  "NO BUILT IN MS AUTH !",
  "Mr_Anilex wasn't here!",
  "Who's Jack ?",
  "This text is blue!",
  "Bonjour!",
  "Salam!",
  "Reverse engineering Wii U version",
  "Don't try Valorant!",
  "This could never be a sad place!",
  "Made without microslop",
  "Thank you C418",
  "Bread is pain",
  "From the star!",
  "Never gonna give you up!",
  "9+10=21",
  ".party() was successful",
  "Not Kogama",
  "You can be proud of you!",
  "Let's drink Orange Joe",
  "Kirater is a great singer!",
  "Mirkette My beloved",
  "Started in Bordeaux",
  "Oui Oui Baguette",
  "Milk In The Microwave",
  "8-3: DISINTEGRATION LOOP",
  "Turn the light OFF",
  "Not written by Mr_Anilex",
  "The One Who's Running the Show!",
  "Playing Forever",
  "The World looks cubic!",
  "huh?",
  "Sybau",
  "Available on Toaster",
  "Try ArchLinux",
  "69% Accurate",
  "A molecule of meow",
  "http://localhost:3000",
  "uuhhhh...",
  "Oyasumi",
  "I don't want to set the world on fire",
  "Directed by Michael Bay",
  "We see you, Opal!",
  "A Cool Cat in Town",
  "Not BrainRotted!",
  "Farting is Natural -Leon",
  "93/100 on metacritic",
  "Not (anymore) on Steam",
  "Sudo apt install EmeraldLauncher",
  "Sudo pacman -S EmeraldLauncher",
  "Kay-Chan my beloved! <3",
  "Peak!",
  "OpenSource!",
  "made by human with bone and flesh",
  "Made with hate against microslop",
  "Steelorse :fire:",
  "It's Minecraft but i'm not sure",
  "Look at you!",
  "You're beautiful",
  "Mr_Anilex has a big ego",
  "Traduis-moi !",
  "May contains Mr_Anilex",
  "Neoapps didn't write this splash",
  "Where's Kinger ?",
  "KayJann, Breakcore and code",
  "Hey Goku!",
  "Vegeta is a DZ mashallah",
  "Bogos Binted? Vorp",
  "YOU SHALL NOT PASS !",
  "Bready, Steady, GO !",
  "Not-so-Empty-house",
  "We'll Meet Again",
  "idk",
  "wdym",
  "Not making sense",
  "Dw!",
  "i forgor",
  "Remember to be patient!",
  "NOW'S YOUR CHANCE TO BE A.",
  "BIG SHOT",
  "A burning memory",
  "FREE MONEY!",
  "Can You Really Call This A Hotel. I didn't Reveive A Mint On My Pillow Or Anything",
  "Try Indie Game",
  "SHARK WITH LEGS!",
  "it's a seal!",
  "Shrimp.",
  "Limited edition!",
  "Fat free!",
  "GOTY!",
  "Water proof!",
  "LALALA-LAVA",
  "CHICHICHI-CHICKEN",
  "Tasty ah hell",
  "1% sugar!",
  "150% hyperbole!",
  "Hotter than the sun!",
  "Woo, reddit!",
  "piebot was here!",
  "Legacy in an evolved manner.",
  "neoapps is cool!",
  "Also try neoLegacy!",
  "$20 is $20",
  "no RenderDragon!",
  "Iggy Jiggy",
  "Arch, btw!",
  "Bedrock bad!",
  "Also try Terraria!",
  "Also try LC Launcher!",
];

interface AudioControllerProps {
  musicVol: number;
  sfxVol: number;
  showIntro: boolean;
  isGameRunning: boolean;
  isWindowVisible: boolean;
}

export function useAudioController({
  musicVol,
  sfxVol,
  showIntro,
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
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const loadAudioBuffer = useCallback(
    async (url: string): Promise<AudioBuffer | undefined> => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const ctx = getAudioContext();
        return await ctx.decodeAudioData(arrayBuffer);
      } catch (error) {
        console.error("Failed to load audio:", url, error);
        return undefined;
      }
    },
    [getAudioContext],
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
        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        source.buffer = buffer;
        gainNode.gain.value = sfxVol / 100;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start();
      }
    },
    [sfxVol, loadAudioBuffer, getAudioContext],
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
    (buffer: AudioBuffer, startTime: number = 0) => {
      stopMusic();
      const ctx = getAudioContext();
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
        if (musicSourceRef.current) {
          setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
        }
      };
    },
    [stopMusic, getAudioContext],
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
    (buffer: AudioBuffer, targetVolume: number, duration: number = 500) => {
      stopMusic();
      const ctx = getAudioContext();
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
        if (musicSourceRef.current) {
          setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
        }
      };
    },
    [stopMusic, getAudioContext],
  );

  const cycleSplash = useCallback(() => {
    playSplashSound();
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * SPLASHES.length);
    } while (newIndex === splashIndex && SPLASHES.length > 1);
    setSplashIndex(newIndex);
  }, [playSplashSound, splashIndex]);

  useEffect(() => {
    if (showIntro) return;

    const loadAndPlay = async () => {
      let buffer = trackBuffersRef.current.get(currentTrack);
      if (!buffer) {
        buffer = await loadAudioBuffer(resolveAudioUrl(TRACKS[currentTrack]));
        if (buffer) {
          trackBuffersRef.current.set(currentTrack, buffer);
        }
      }
      if (buffer) {
        playMusicBuffer(buffer);
      }
    };

    loadAndPlay();

    return () => {
      stopMusic();
    };
  }, [showIntro, currentTrack, loadAudioBuffer, playMusicBuffer, stopMusic]);

  useEffect(() => {
    if (!audioContextRef.current || showIntro) return;

    const loadAndPlay = async () => {
      let buffer = trackBuffersRef.current.get(currentTrack);
      if (!buffer) {
        buffer = await loadAudioBuffer(resolveAudioUrl(TRACKS[currentTrack]));
        if (buffer) {
          trackBuffersRef.current.set(currentTrack, buffer);
        }
      }
      if (buffer) {
        fadeInMusic(buffer, musicVol / 100, 500);
      }
    };

    loadAndPlay();
  }, [currentTrack, showIntro, musicVol, loadAudioBuffer, fadeInMusic]);

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
          fadeInMusic(buffer, musicVol / 100, 500);
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
    splashIndex,
    setSplashIndex,
    cycleSplash,
    playPressSound,
    playBackSound,
    playSfx,
    tracks: TRACKS,
    splashes: SPLASHES,
  };
}
