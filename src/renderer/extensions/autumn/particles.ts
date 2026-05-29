import * as THREE from "three";

export interface ParticleParams {
  countPerTexture: number;
  positionRange: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
  initialVelocity: {
    x: [number, number] | number;
    y: [number, number] | number;
    z: [number, number] | number;
  };
  velocityDelta: { x: number; y: number; z: number };
  size: number;
  visible: boolean;
  groupPosition: [number, number, number];
  depthTest: boolean;
  yResetThreshold?: number;
}

const getRandom = (range: [number, number] | number): number => {
  if (Array.isArray(range)) {
    return range[0] + (range[1] - range[0]) * Math.random();
  }
  return range;
};

export function setupLeafParticles(
  scene: THREE.Scene,
  textures: THREE.Texture[],
  params: ParticleParams,
): {
  group: THREE.Group;
  update(deltaTime: number): void;
  reset(): void;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.position.set(...params.groupPosition);
  group.visible = params.visible;
  scene.add(group);

  const particleSets: Array<{
    points: THREE.Points;
    velocities: Float32Array;
  }> = [];

  const count = params.countPerTexture;

  const initParticles = (): void => {
    for (const texture of textures) {
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[3 * i + 0] = getRandom(params.positionRange.x);
        positions[3 * i + 1] = getRandom(params.positionRange.y);
        positions[3 * i + 2] = getRandom(params.positionRange.z);

        velocities[3 * i + 0] = getRandom(params.initialVelocity.x);
        velocities[3 * i + 1] = getRandom(params.initialVelocity.y);
        velocities[3 * i + 2] = getRandom(params.initialVelocity.z);
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setDrawRange(0, count);

      const material = new THREE.PointsMaterial({
        size: params.size,
        map: texture,
        depthTest: params.depthTest,
        depthWrite: false,
        transparent: true,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      group.add(points);
      particleSets.push({ points, velocities });
    }
  };

  initParticles();

  return {
    group,
    update(deltaTime: number): void {
      for (const set of particleSets) {
        const { points, velocities } = set;
        const posArr = (
          points.geometry.attributes.position as THREE.BufferAttribute
        ).array as Float32Array;

        for (let i = 0; i < count; i++) {
          velocities[3 * i + 0] += params.velocityDelta.x;
          velocities[3 * i + 1] += params.velocityDelta.y;
          velocities[3 * i + 2] += params.velocityDelta.z;

          posArr[3 * i + 0] += velocities[3 * i + 0] * deltaTime;
          posArr[3 * i + 1] += velocities[3 * i + 1] * deltaTime;
          posArr[3 * i + 2] += velocities[3 * i + 2] * deltaTime;

          if (
            params.yResetThreshold !== undefined &&
            posArr[3 * i + 1] < params.yResetThreshold
          ) {
            velocities[3 * i + 0] = getRandom(params.initialVelocity.x);
            velocities[3 * i + 1] = getRandom(params.initialVelocity.y);
            velocities[3 * i + 2] = getRandom(params.initialVelocity.z);
            posArr[3 * i + 0] = getRandom(params.positionRange.x);
            posArr[3 * i + 1] = getRandom(params.positionRange.y);
            posArr[3 * i + 2] = 60 * Math.random() - 20; // 对应复位时 Z ∈ [-20, 40]
          }
        }

        (
          points.geometry.attributes.position as THREE.BufferAttribute
        ).needsUpdate = true;
      }
    },

    reset(): void {
      for (const set of particleSets) {
        const { points, velocities } = set;
        const posArr = (
          points.geometry.attributes.position as THREE.BufferAttribute
        ).array as Float32Array;

        for (let i = 0; i < count; i++) {
          posArr[3 * i + 0] = getRandom(params.positionRange.x);
          posArr[3 * i + 1] = getRandom(params.positionRange.y);
          posArr[3 * i + 2] = getRandom(params.positionRange.z);

          velocities[3 * i + 0] = getRandom(params.initialVelocity.x);
          velocities[3 * i + 1] = getRandom(params.initialVelocity.y);
          velocities[3 * i + 2] = getRandom(params.initialVelocity.z);
        }

        (
          points.geometry.attributes.position as THREE.BufferAttribute
        ).needsUpdate = true;
      }
    },

    dispose(): void {
      scene.remove(group);
      for (const set of particleSets) {
        set.points.geometry.dispose();
        (set.points.material as THREE.PointsMaterial).dispose();
      }
      particleSets.length = 0;
    },
  };
}
