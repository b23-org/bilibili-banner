import type * as THREE from "three";
import { type AsepriteData, createSpriteAnimator } from "./sprite-animator";

export function setupButterfly(
  scene: THREE.Scene,
  spriteData: { texture: THREE.Texture; jsonData: AsepriteData },
): {
  butterfly: THREE.Mesh;
  update(deltaTime: number): void;
  dispose(): void;
} {
  const { texture, jsonData } = spriteData;
  const animator = createSpriteAnimator(texture, jsonData);
  const mesh = animator.instance;

  mesh.scale.set(0.6, 0.6, 0.6);
  scene.add(mesh);

  const animations = animator.animations;
  if (animations.length > 0) {
    animations[0].setFrame(0);
  }

  let elapsed = 0;

  return {
    butterfly: mesh,
    update(deltaTime: number): void {
      elapsed += deltaTime;

      const x = 25 - ((4 * elapsed) % 50);
      const y = 5;
      const z = 38 + 3 * Math.cos(1.23 * elapsed);
      mesh.position.set(x, y, z);

      if (animations.length > 0) {
        animations[0].update(deltaTime);
      }
    },
    dispose(): void {
      scene.remove(mesh);
      animator.dispose();
    },
  };
}
