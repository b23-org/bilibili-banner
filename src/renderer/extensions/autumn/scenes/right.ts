import gsap from "gsap";
import * as THREE from "three";
import type {
  GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import type { initAudioManager } from "../audio";
import { ASSETS } from "../constants";
import type { ExtensionEventBus } from "../event-bus";
import { setupLeafParticles } from "../particles";
import {
  loadTexture,
  type SceneData,
  setupSphericalCameraFollow,
} from "../scene";
import { createSpriteAnimator } from "../sprite-animator";

export async function createRightScene(
  gltfLoader: GLTFLoader,
  textureLoader: THREE.TextureLoader,
  eventBus: ExtensionEventBus,
  basePath: string,
  audioManager?: ReturnType<typeof initAudioManager>,
  containerEl?: HTMLElement,
): Promise<SceneData> {
  const scene = new THREE.Scene();

  const [subSceneGLB, bellGLB, waterfallSpriteData, leafTextures] =
    await Promise.all([
      gltfLoader.loadAsync(`${basePath}${ASSETS.models.subSceneRight}`),
      gltfLoader.loadAsync(`${basePath}${ASSETS.models.bell2}`),
      loadSpriteData(
        textureLoader,
        basePath,
        ASSETS.textures.waterfallImg,
        ASSETS.textures.waterfallJson,
      ),
      Promise.all(
        ["main/leaf01.png", "main/leaf02.png", "main/leaf03.png"].map((path) =>
          loadTexture(textureLoader, `${basePath}${path}`),
        ),
      ),
    ]);

  scene.add(subSceneGLB.scene);

  const camera = subSceneGLB.cameras[0];

  const target = new THREE.Vector3(0, 0, 4.25);
  const radius = camera.position.distanceTo(target);

  let followController: ReturnType<typeof setupSphericalCameraFollow> | null =
    null;
  let cameraFollowEnabled = false;

  if (containerEl) {
    // 官方顺序：先初始化球坐标控制器，后推远相机 Z 轴
    followController = setupSphericalCameraFollow(
      camera,
      {
        target,
        radius,
        maxTheta: 5 * THREE.MathUtils.DEG2RAD,
        minTheta: -5 * THREE.MathUtils.DEG2RAD,
        maxPhi: 80 * THREE.MathUtils.DEG2RAD,
        minPhi: 76 * THREE.MathUtils.DEG2RAD,
      },
      containerEl,
    );
  }

  // 初始推远 Z 轴 — 必须在 setupSphericalCameraFollow 之后
  camera.position.z += 0.2;

  const onChangeSceneEnd = (sceneName: string): void => {
    if (sceneName === "right") {
      const targetZ = camera.position.z - 0.2;
      gsap.to(camera.position, {
        z: targetZ,
        duration: 3,
        ease: "power2.inOut",
        onComplete: () => {
          cameraFollowEnabled = true;
        },
      });
    }
  };

  eventBus.on("changeSceneEnd", onChangeSceneEnd);

  // 官方: 彩虹来自 bellGLB.scene.children[1]，不是 subSceneGLB
  const rainbowMesh = bellGLB.scene.children[1] as THREE.Mesh;
  const originalMaterial = rainbowMesh?.material as THREE.MeshStandardMaterial;
  const originalMap = originalMaterial?.map;
  if (originalMap) {
    originalMap.wrapS = THREE.RepeatWrapping;
    originalMap.wrapT = THREE.RepeatWrapping;
  }

  const rainbowMaterial = new THREE.ShaderMaterial({
    lights: false,
    transparent: true,
    uniforms: {
      map: { value: originalMap || null },
      opacity: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        gl_FragColor = texture(map, vUv);
        gl_FragColor.a *= opacity;
      }
    `,
  });

  if (rainbowMesh) {
    rainbowMesh.material = rainbowMaterial;
  }

  const waterfallSprite = createSpriteAnimator(
    waterfallSpriteData.texture,
    waterfallSpriteData.jsonData as Parameters<typeof createSpriteAnimator>[1],
  );
  waterfallSprite.instance.position.set(-0.42, -1.38, -2.4);
  waterfallSprite.instance.scale.set(4.0704, 1.3 * 1.28, 1);
  waterfallSprite.animations[0].setFrame(0);
  scene.add(waterfallSprite.instance);

  scene.add(bellGLB.scene);

  // 官方: bellMixer 根节点是 bellGLB.scene.children[0]
  const bellMixer = new THREE.AnimationMixer(bellGLB.scene.children[0]);
  const bellAction = bellMixer.clipAction(bellGLB.animations[0]);
  bellAction.setLoop(THREE.LoopOnce, 1);

  const rightParticleParams = {
    countPerTexture: 6,
    positionRange: {
      x: [-0.15, 0.15] as [number, number],
      y: [-0.05, 0.05] as [number, number],
      z: [-0.01, 0.01] as [number, number],
    },
    initialVelocity: {
      x: [-0.267, -0.067] as [number, number],
      y: [-0.4, -0.2] as [number, number],
      z: [0.04, 0.06] as [number, number],
    },
    velocityDelta: {
      x: -0.002,
      y: -0.001,
      z: 0,
    },
    size: 0.3,
    visible: false,
    groupPosition: [1.2, -0.8, -0.4] as [number, number, number],
    depthTest: true,
  };

  const particles = setupLeafParticles(
    scene,
    leafTextures,
    rightParticleParams,
  );

  let isRainbowAnimating = false;
  let isLeavesAnimating = false;
  let isBellAnimating = false;

  const handleHotspotClick = (name: string): void => {
    if (name === "bell") {
      if (!isBellAnimating) {
        isBellAnimating = true;
        audioManager?.playEffect("bell");

        bellAction.play();

        const onFinished = (
          e: THREE.Event & { action?: THREE.AnimationAction },
        ) => {
          if (e.action === bellAction) {
            bellMixer.removeEventListener("finished", onFinished);
            bellAction.stop();
            bellAction.reset();
            isBellAnimating = false;
          }
        };
        bellMixer.addEventListener("finished", onFinished);
      }
    } else if (name === "rainbow") {
      if (!isRainbowAnimating) {
        isRainbowAnimating = true;
        audioManager?.playEffect("rainbow");
        gsap.to(rainbowMaterial.uniforms.opacity, {
          value: 0.8,
          duration: 1.8,
          onComplete: () => {
            gsap.to(rainbowMaterial.uniforms.opacity, {
              value: 0,
              duration: 1.8,
              onComplete: () => {
                isRainbowAnimating = false;
              },
            });
          },
        });
      }
    } else if (name === "leaves") {
      if (!isLeavesAnimating) {
        isLeavesAnimating = true;
        audioManager?.playEffect("leaves");
        particles.reset();
        particles.group.visible = true;
        setTimeout(() => {
          particles.group.visible = false;
          isLeavesAnimating = false;
        }, 3000);
      }
    }
  };

  eventBus.on("clickArea", handleHotspotClick);

  return {
    scene,
    camera,
    update(deltaTime: number): void {
      // 官方: T && v(), l.update(t), y && c.update(t), M && u.update(t)
      if (cameraFollowEnabled && followController) {
        followController.update();
      }
      waterfallSprite.animations[0].update(deltaTime);
      if (isBellAnimating) {
        bellMixer.update(deltaTime);
      }
      if (particles.group.visible) {
        particles.update(deltaTime);
      }
    },
    dispose(): void {
      eventBus.off("clickArea", handleHotspotClick);
      eventBus.off("changeSceneEnd", onChangeSceneEnd);

      if (followController) {
        followController.dispose();
      }

      gsap.killTweensOf(rainbowMaterial.uniforms.opacity);
      gsap.killTweensOf(camera.position);

      rainbowMaterial.dispose();
      waterfallSprite.dispose();
      bellMixer.stopAllAction();
      particles.dispose();

      leafTextures.forEach((t) => {
        t.dispose();
      });

      disposeGLTF(subSceneGLB);
      disposeGLTF(bellGLB);
    },
  };
}

async function loadSpriteData(
  textureLoader: THREE.TextureLoader,
  basePath: string,
  imgPath: string,
  jsonPath: string,
): Promise<{ texture: THREE.Texture; jsonData: object }> {
  const [texture, jsonData] = await Promise.all([
    loadTexture(textureLoader, `${basePath}${imgPath}`),
    fetch(`${basePath}${jsonPath}`).then((r) => r.json()),
  ]);

  return { texture, jsonData };
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
