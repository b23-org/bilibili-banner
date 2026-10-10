import * as THREE from "three";
import type {
  GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import type { initAudioManager } from "../audio";
import { setupButterfly } from "../butterfly";
import { setupCharacters } from "../character";
import { ASSETS } from "../constants";
import type { ExtensionEventBus } from "../event-bus";
import { setupLeafParticles } from "../particles";
import {
  createMouseTracker,
  decodeLatin1ToUtf8,
  loadTexture,
  type SceneData,
} from "../scene";

export async function createMainScene(
  gltfLoader: GLTFLoader,
  textureLoader: THREE.TextureLoader,
  eventBus: ExtensionEventBus,
  basePath: string,
  audioManager?: ReturnType<typeof initAudioManager>,
  containerEl?: HTMLElement,
): Promise<SceneData> {
  const scene = new THREE.Scene();

  const [
    mainGLB,
    butterflyTexture,
    butterflyJson,
    char22Left,
    char22Right,
    char33Left,
    char33Right,
    leafTextures,
  ] = await Promise.all([
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.mainScene}`),
    loadTexture(textureLoader, `${basePath}${ASSETS.textures.butterflyImg}`),
    fetch(`${basePath}${ASSETS.textures.butterflyJson}`).then((r) => r.json()),
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.char22Left}`),
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.char22Right}`),
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.char33Left}`),
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.char33Right}`),
    Promise.all(
      ["main/leaf01.png", "main/leaf02.png", "main/leaf03.png"].map((path) =>
        loadTexture(textureLoader, `${basePath}${path}`),
      ),
    ),
  ]);

  mainGLB.scene.scale.set(10, 10, 10);
  scene.add(mainGLB.scene);

  const camera = mainGLB.cameras[0];

  let ground: THREE.Object3D | undefined;
  mainGLB.scene.traverse((node) => {
    if (decodeLatin1ToUtf8(node.name) === "地面") {
      ground = node;
    }
  });

  const characters = setupCharacters({
    scene,
    models: {
      char22Left,
      char22Right,
      char33Left,
      char33Right,
    },
    groundMesh: ground || mainGLB.scene,
    eventBus,
    audioManager,
  });

  const mainParticleParams = {
    countPerTexture: 64,
    positionRange: {
      x: [-50, 50] as [number, number],
      y: [0, 40] as [number, number],
      z: [10, 50] as [number, number],
    },
    initialVelocity: {
      x: 0,
      y: -1,
      z: 0,
    },
    velocityDelta: {
      x: 0.01,
      y: -0.01,
      z: 0.005,
    },
    size: 4,
    visible: true,
    groupPosition: [0, 0, 0] as [number, number, number],
    depthTest: false,
    yResetThreshold: -5,
  };

  const particles = setupLeafParticles(scene, leafTextures, mainParticleParams);

  const butterfly = setupButterfly(scene, {
    texture: butterflyTexture,
    jsonData: butterflyJson,
  });

  let sceneTransitionTriggered = false;

  const checkSceneTransition = (pos: THREE.Vector2): void => {
    if (sceneTransitionTriggered) return;

    if (pos.x < -12) {
      sceneTransitionTriggered = true;
      eventBus.emit("listen", "left");
      audioManager?.playEffect("recording");
    } else if (pos.x > 14) {
      sceneTransitionTriggered = true;
      eventBus.emit("listen", "right");
      audioManager?.playEffect("recording");
    }
  };

  eventBus.on("bili22Move", checkSceneTransition);

  const handleHotspotClick = (name: string): void => {
    const targets: Record<string, THREE.Vector3> = {
      left: new THREE.Vector3(-14.447, -0.053, 34.36),
      right: new THREE.Vector3(15.305, -0.015, 34.36),
    };
    const target = targets[name];
    if (target) {
      eventBus.emit("moveTo", target);
    }
  };

  eventBus.on("clickArea", handleHotspotClick);

  const clickableObjects = new Map<
    THREE.Object3D,
    (hits: THREE.Intersection[]) => void
  >();

  if (ground) {
    clickableObjects.set(ground, (hits) => {
      if (hits.length === 1) {
        eventBus.emit("moveTo", hits[0].point);
      }
    });
  }

  let cameraFollow: { update(): void; dispose(): void } | null = null;
  if (containerEl) {
    const tracker = createMouseTracker(containerEl);
    const smooth = { x: 0.5, y: 0.5 };
    const basePosition = camera.position.clone();

    cameraFollow = {
      update() {
        smooth.x += 0.05 * (tracker.mousePercent.x - smooth.x);
        smooth.y += 0.05 * (tracker.mousePercent.y - smooth.y);

        if (
          Math.abs(tracker.mousePercent.x - smooth.x) > 0.001 ||
          Math.abs(tracker.mousePercent.y - smooth.y) > 0.001
        ) {
          const offsetX = (smooth.x - 0.5) / 2;
          const offsetY = (0.5 - smooth.y) / 4;
          camera.position.set(
            basePosition.x + offsetX,
            basePosition.y + offsetY,
            basePosition.z,
          );
        }
      },
      dispose() {
        tracker.dispose();
      },
    };
  }

  return {
    scene,
    camera,
    clickableObjects,
    update(deltaTime: number): void {
      cameraFollow?.update();
      characters.update(deltaTime);
      particles.update(deltaTime);
      butterfly.update(deltaTime);
    },
    dispose(): void {
      eventBus.off("bili22Move", checkSceneTransition);
      eventBus.off("clickArea", handleHotspotClick);
      clickableObjects.clear();
      characters.dispose();
      particles.dispose();
      butterfly.dispose();
      cameraFollow?.dispose();

      leafTextures.forEach((t) => {
        t.dispose();
      });
      butterflyTexture.dispose();

      disposeGLTF(mainGLB);
    },
  };
}

function disposeGLTF(gltf: GLTF): void {
  const disposeNode = (node: THREE.Object3D) => {
    if (node.children?.length) {
      node.children.forEach(disposeNode);
    }
    const mesh = node as THREE.Mesh;
    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of materials) {
        const material = mat as THREE.MeshStandardMaterial;
        if (material.map) material.map.dispose();
        mat.dispose();
      }
    }
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
  };
  gltf.scenes.forEach((s: THREE.Group) => {
    disposeNode(s);
  });
}
