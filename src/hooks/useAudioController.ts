import { useState, useEffect, useRef, useCallback } from "react";

const TRACKS = [
  "/music/Blind Spots.ogg",
  "/music/Key.ogg",
  "/music/Living Mice.ogg",
  "/music/Oxygene.ogg",
  "/music/Subwoofer Lullaby.ogg",
];

const SPLASHES = [
  "Legacy is back!", "Pixelated goodness!", "Console Edition vibe!", "100% Not Microsoft!",
  "Symmetry is key!", "Does anyone even read these?", "Task failed successfully.",
  "Hardware accelerated!", "It's a feature, not a bug.", "Look behind you.",
  "Works on my machine.", "Now gluten-free!", "Mom, get the camera!", "Batteries not included.",
  "May contain nuts.", "Press Alt+F4 for diamonds!", "Downloading more RAM...",
  "Reinventing the wheel!", "The cake is a lie.", "Powered by copious amounts of coffee.",
  "I'm running out of ideas.", "That's no moon...", "Now with 100% more nostalgia!",
  "Legacy is the new modern.", "No microtransactions!", "As seen on TV!", "Ironic, isn't it?",
  "Creeper? Aww man.", "Technoblade never dies!", "is smartcmd dead ?", "NO BUILT IN MS AUTH !",
  "Mr_Anilex wasn't here!", "Who's Jack ?", "This text is blue!", "Bonjour!", "Hola!",
  "Salam!", "Hi!", "Reverse engineering WiiU version", "Try Terraria", "Don't try Valorant",
  "This could never be a sad place!", "Made without microslop", "Thank you C418", "Bread is pain",
  "From the star!", "Never gonna give you up!", "9+10=21", ".party() was successful", "Not Kogama",
  "You can be proud of you!", "Let's drink Orange Joe", "Kirater is a great singer!",
  "Mirkette My beloved", "Started in Bordeaux", "Oui Oui Baguette", "Milk In The Microwave",
  "8-3: DISINTEGRATION LOOP", "Turn the light OFF", "Not written by Mr_Anilex",
  "The One Who's Running the Show!", "Playing Forever", "The World looks cubic!", "huh?",
  "Sybau", "Available on Toaster", "Try ArchLinux", "67% Accurate", "A molecule of meow",
  "http://localhost:3000", "uuhhhh...", "Oyasumi", "XDDCC", "I don't want to set the world on fire",
  "Directed by Michael Bay", "We see you, Opal!", "A Cool Cat in Town", "pikmin",
  "Not BrainRotted!", "Farting is Natural -Leon", "93/100 on metacritic", "Not (anymore) on Steam",
  "Sudo apt install EmeraldLauncher", "Sudo pacman -S EmeraldLauncher", "Kay-Chan my beloved! <3",
  "Peak!", "OpenSource!", "made by human with bone and flesh", "Made with hate against microslop",
  "Steelorse :fire:", "It's Minecraft but i'm not sure", "Look at you!", "You're beautiful",
  "Mr_Anilex has a big ego", "Traduis-moi !", "May contains Mr_Anilex", "Neoapps didn't write this splash",
  "Where's Kinger ?", "KayJann, Breakcore and code", "Hey Goku!", "Vegeta is a DZ mashallah",
  "Bogos Binted? Vorp", "YOU SHALL NOT PASS !", "Bready, Steady, GO !", "Not-so-Empty-house",
  "We'll Meet Again", "idk", "wdym", "Not making sense", "Dw!", "i forgor", "Remember to be patient!",
  "NOW'S YOUR CHANCE TO BE A.", "BIG SHOT", "A burning memory", "FREE MONEY!",
  "Can You Really Call This A Hotel. I didn't Reveive A Mint On My Pillow Or Anything",
  "Try Indie Game", "SHARK WITH LEGS!", "it's a seal!", "Shrimp.", "Limited edition!",
  "Fat free!", "GOTY!", "Water proof!", "LALALA-LAVA", "CHICHICHI-CHICKEN", "Tasty ah hell",
  "1% sugar!", "150% hyperbole!", "Hotter than the sun!", "Woo, reddit!",
  "J'ai fait une blague à un poisson il m'a dit que c'était trop marin !",
  "piebot was here!", "Legacy in an evolved manner.", "neoapps is cool!", "Also try neoLegacy!",
  "$20 is $20", "no RenderDragon!", "Iggy Jiggy", "Arch, btw!", "Bedrock bad!"
];

interface AudioControllerProps {
  musicVol: number;
  sfxVol: number;
  showIntro: boolean;
  isGameRunning: boolean;
  isWindowVisible: boolean;
}

export function useAudioController({ musicVol, sfxVol, showIntro, isGameRunning, isWindowVisible }: AudioControllerProps) {
  const [currentTrack, setCurrentTrack] = useState(0);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [splashIndex, setSplashIndex] = useState(-1);
  const musicPausedRef = useRef<{ at: number; track: number } | null>(null);
  const fadeIntervalRef = useRef<any>(null);
  const playSfx = useCallback((file: string) => {
    const a = new Audio(`/sounds/${file}`);
    a.volume = sfxVol / 100;
    a.play().catch(() => { });
  }, [sfxVol]);

  const playPressSound = useCallback(() => playSfx("press.wav"), [playSfx]);
  const playBackSound = useCallback(() => playSfx("back.ogg"), [playSfx]);
  const playSplashSound = useCallback(() => playSfx("orb.ogg"), [playSfx]);
  const fadeOut = useCallback((audio: HTMLAudioElement, duration: number = 500) => {
    return new Promise<void>((resolve) => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      const initialVolume = audio.volume;
      const steps = 5;
      const stepDuration = duration / steps;
      let currentStep = 0;
      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        audio.volume = initialVolume * (1 - progress);
        if (currentStep >= steps) {
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          audio.pause();
          audio.volume = initialVolume;
          resolve();
        }
      }, stepDuration);
    });
  }, []);

  const fadeIn = useCallback((audio: HTMLAudioElement, targetVolume: number, duration: number = 500) => {
    return new Promise<void>((resolve) => {
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
      audio.volume = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => { });
      }

      const steps = 5;
      const stepDuration = duration / steps;
      let currentStep = 0;
      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const progress = currentStep / steps;
        audio.volume = targetVolume * progress;
        if (currentStep >= steps) {
          if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          audio.volume = targetVolume;
          resolve();
        }
      }, stepDuration);
    });
  }, []);

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
    if (audioElement) return;
    const audio = new Audio(TRACKS[currentTrack]);
    audio.volume = musicVol / 100;
    const handleEnded = () => setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
    audio.addEventListener("ended", handleEnded);
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        const startMusic = () => {
          audio.play().catch(() => { });
          document.removeEventListener("click", startMusic);
          document.removeEventListener("keydown", startMusic);
        };
        document.addEventListener("click", startMusic, { once: true });
        document.addEventListener("keydown", startMusic, { once: true });
      });
    }

    setAudioElement(audio);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
  }, [showIntro, audioElement, currentTrack, musicVol]);

  useEffect(() => {
    if (!audioElement) return;
    audioElement.src = TRACKS[currentTrack];
    audioElement.play().catch(() => { });
  }, [currentTrack]);

  useEffect(() => {
    if (!audioElement) return;
    const shouldPause = isGameRunning || !isWindowVisible;

    if (shouldPause) {
      if (!audioElement.paused || fadeIntervalRef.current) {
        if (!musicPausedRef.current) {
          musicPausedRef.current = {
            at: audioElement.currentTime,
            track: currentTrack,
          };
        }
        fadeOut(audioElement, 500);
      }
    } else if (musicPausedRef.current) {
      const { at, track } = musicPausedRef.current;
      musicPausedRef.current = null;
      if (track === currentTrack) {
        audioElement.currentTime = at;
      }
      fadeIn(audioElement, musicVol / 100, 500);
    }
  }, [isGameRunning, isWindowVisible, audioElement, currentTrack, musicVol, fadeOut, fadeIn]);

  useEffect(() => {
    if (audioElement) {
      audioElement.volume = musicVol / 100;
    }
  }, [musicVol, audioElement]);

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
