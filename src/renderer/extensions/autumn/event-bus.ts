import type * as THREE from "three";

export interface AutumnEventMap {
  moveTo: THREE.Vector3;
  listen: "left" | "right";
  bili22Move: THREE.Vector2;
  changeScene: "main" | "left" | "right";
  toggleMute: boolean;
  clickArea: string;
  changeSceneEnd: string;
  sceneReady: boolean;
}

export class ExtensionEventBus {
  // biome-ignore lint/complexity/noBannedTypes: Generic callback registry using Function type is safe here
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof AutumnEventMap>(
    event: K,
    callback: (data: AutumnEventMap[K]) => void,
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof AutumnEventMap>(
    event: K,
    callback: (data: AutumnEventMap[K]) => void,
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  emit<K extends keyof AutumnEventMap>(
    event: K,
    data: AutumnEventMap[K],
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[EventBus] Error in callback for event ${event}:`, e);
        }
      });
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
