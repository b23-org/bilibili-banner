import * as THREE from "three";
import type { ExtensionEventBus } from "./event-bus";

type SceneName = "main" | "left" | "right";

type EffectName =
  | "walk"
  | "recording"
  | "rainbow"
  | "bell"
  | "leaves"
  | "peoples"
  | "whale";

interface AudioSceneConfig {
  bg: string;
  effects: Record<string, string>;
}

const SCENE_AUDIO_CONFIG: Record<SceneName, AudioSceneConfig> = {
  main: {
    bg: "main/bg.mp3",
    effects: {
      walk: "main/walk.mp3",
      recording: "main/recording.mp3",
    },
  },
  left: {
    bg: "left/bg.mp3",
    effects: {
      peoples: "left/peoples.mp3",
      bell: "left/bell.mp3",
      whale: "left/whale.mp3",
    },
  },
  right: {
    bg: "right/bg.mp3",
    effects: {
      rainbow: "right/rainbow.mp3",
      bell: "right/bell.mp3",
      leaves: "right/leaves.mp3",
    },
  },
};

export function initAudioManager(
  audioListener: THREE.AudioListener,
  eventBus: ExtensionEventBus,
  basePath: string,
): {
  loadSceneAudio(sceneName: SceneName): Promise<void>;
  playEffect(name: EffectName): void;
  stopEffect(name: EffectName): void;
  dispose(): void;
} {
  const audioLoader = new THREE.AudioLoader();
  const audioCache = new Map<string, THREE.Audio>();
  const effectAudios = new Map<EffectName, THREE.Audio>();
  let currentBg: THREE.Audio | null = null;
  let isMuted = localStorage.getItem("banner_audio_paused") === "1";

  const loadAudio = async (path: string): Promise<THREE.Audio> => {
    const cached = audioCache.get(path);
    if (cached) return cached;

    const buffer = await audioLoader.loadAsync(`${basePath}${path}`);
    const audio = new THREE.Audio(audioListener);
    audio.setBuffer(buffer);
    audio.setVolume(0.7);
    audioCache.set(path, audio);
    return audio;
  };

  const handleToggleMute = (muted: boolean): void => {
    isMuted = muted;
    if (muted) {
      currentBg?.pause();
      for (const audio of audioCache.values()) {
        try {
          if (audio.isPlaying) {
            audio.pause();
          }
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        currentBg?.play();
      } catch {
        /* AudioContext may be suspended */
      }
    }
  };

  eventBus.on("toggleMute", handleToggleMute);

  return {
    async loadSceneAudio(sceneName: SceneName): Promise<void> {
      const config = SCENE_AUDIO_CONFIG[sceneName];
      if (!config) return;

      if (currentBg) {
        try {
          if (currentBg.isPlaying) {
            currentBg.stop();
          }
        } catch {
          /* already stopped */
        }
        currentBg = null;
      }

      for (const [name, audio] of effectAudios.entries()) {
        if (name === "recording") continue;
        try {
          if (audio.isPlaying) {
            audio.stop();
          }
        } catch {
          /* already stopped */
        }
      }
      for (const key of Array.from(effectAudios.keys())) {
        if (key !== "recording") {
          effectAudios.delete(key);
        }
      }

      const bgAudio = await loadAudio(config.bg);
      bgAudio.setVolume(0.3);
      bgAudio.setLoop(true);
      currentBg = bgAudio;

      for (const [name, path] of Object.entries(config.effects)) {
        const audio = await loadAudio(path);
        if (name === "walk") {
          audio.setLoop(true);
        }
        effectAudios.set(name as EffectName, audio);
      }

      if (!isMuted) {
        try {
          bgAudio.play();
        } catch {
          /* AudioContext may be suspended */
        }
      }
    },

    playEffect(name: EffectName): void {
      if (isMuted) return;
      const audio = effectAudios.get(name);
      if (audio) {
        try {
          audio.stop();
          audio.play();
        } catch {
          /* AudioContext may be suspended */
        }
      }
    },

    stopEffect(name: EffectName): void {
      const audio = effectAudios.get(name);
      if (audio?.isPlaying) {
        try {
          audio.stop();
        } catch {
          /* already stopped */
        }
      }
    },

    dispose(): void {
      eventBus.off("toggleMute", handleToggleMute);

      currentBg?.pause();
      currentBg = null;

      for (const audio of audioCache.values()) {
        try {
          if (audio.isPlaying) audio.stop();
        } catch {
          /* already stopped */
        }
      }
      audioCache.clear();
      effectAudios.clear();
    },
  };
}
