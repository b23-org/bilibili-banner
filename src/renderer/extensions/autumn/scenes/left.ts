import gsap from "gsap";
import * as THREE from "three";
import type {
  GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import type { initAudioManager } from "../audio";
import { ASSETS } from "../constants";
import type { ExtensionEventBus } from "../event-bus";
import {
  loadTexture,
  type SceneData,
  setupSphericalCameraFollow,
} from "../scene";
import { createSpriteAnimator } from "../sprite-animator";

export async function createLeftScene(
  gltfLoader: GLTFLoader,
  textureLoader: THREE.TextureLoader,
  eventBus: ExtensionEventBus,
  basePath: string,
  audioManager?: ReturnType<typeof initAudioManager>,
  containerEl?: HTMLElement,
): Promise<SceneData> {
  const scene = new THREE.Scene();

  // 官方源码: const e = new Va(16777215, 0.25); t.add(e);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.25);
  scene.add(dirLight);

  const [subSceneGLB, seagullGLB] = await Promise.all([
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.subSceneLeft}`),
    gltfLoader.loadAsync(`${basePath}${ASSETS.models.seagull}`),
  ]);

  scene.add(subSceneGLB.scene);

  const camera = subSceneGLB.cameras[0];

  const target = new THREE.Vector3(0, 0, 4.2);
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
        maxPhi: 79 * THREE.MathUtils.DEG2RAD,
        minPhi: 74 * THREE.MathUtils.DEG2RAD,
      },
      containerEl,
    );
  }

  // 初始推远 Z 轴 — 必须在 setupSphericalCameraFollow 之后
  camera.position.z += 0.3;

  const onChangeSceneEnd = (sceneName: string): void => {
    if (sceneName === "left") {
      const targetZ = camera.position.z - 0.3;
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

  const spriteDataArray = await Promise.all([
    loadSpriteData(
      textureLoader,
      basePath,
      ASSETS.textures.peoplesImg,
      ASSETS.textures.peoplesJson,
    ),
    loadSpriteData(
      textureLoader,
      basePath,
      ASSETS.textures.seaImg,
      ASSETS.textures.seaJson,
    ),
    loadSpriteData(
      textureLoader,
      basePath,
      ASSETS.textures.whaleImg,
      ASSETS.textures.whaleJson,
    ),
    loadSpriteData(
      textureLoader,
      basePath,
      ASSETS.textures.seagullImg,
      ASSETS.textures.seagullJson,
    ),
  ]);

  // 人群
  const peoplesSprite = createSpriteAnimator(
    spriteDataArray[0].texture,
    spriteDataArray[0].jsonData as Parameters<typeof createSpriteAnimator>[1],
  );
  peoplesSprite.instance.position.set(0.4, -0.56, 2.4923);
  peoplesSprite.instance.scale.set(2.43 * 0.17, 0.2397, 1);
  peoplesSprite.animations[0].setFrame(0);
  scene.add(peoplesSprite.instance);

  // 海浪
  const seaSprite = createSpriteAnimator(
    spriteDataArray[1].texture,
    spriteDataArray[1].jsonData as Parameters<typeof createSpriteAnimator>[1],
  );
  seaSprite.instance.position.set(1.249, -1.635, -5.72);
  seaSprite.instance.scale.set(1.68, 0.54, 1);
  scene.add(seaSprite.instance);

  // 鲸鱼
  const whaleSprite = createSpriteAnimator(
    spriteDataArray[2].texture,
    spriteDataArray[2].jsonData as Parameters<typeof createSpriteAnimator>[1],
  );
  whaleSprite.instance.position.set(1.249, -1.52, -5.7);
  whaleSprite.instance.visible = false;
  scene.add(whaleSprite.instance);

  // 海鸥精灵图 (3只)
  const seagullSprites = Array.from({ length: 3 }, () => {
    const sprite = createSpriteAnimator(
      spriteDataArray[3].texture,
      spriteDataArray[3].jsonData as Parameters<typeof createSpriteAnimator>[1],
    );
    sprite.instance.scale.set(0.1, 0.1, 1);
    sprite.instance.visible = false;
    scene.add(sprite.instance);
    return sprite;
  });

  // 官方: 3 个 clipAction，LoopOnce + 1 次重复
  const seagullMixer = new THREE.AnimationMixer(seagullGLB.scene);
  const seagullActions = seagullGLB.animations.map((clip) => {
    const action = seagullMixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    return action;
  });

  let isPeopleAnimating = false;
  let isWhaleAnimating = false;
  let isSeagullAnimating = false;
  let seagullTimer: ReturnType<typeof setTimeout> | null = null;

  // 官方使用 playOnce() 做防重入守卫
  const handleHotspotClick = (name: string): void => {
    if (name === "people") {
      if (!isPeopleAnimating) {
        isPeopleAnimating = true;
        audioManager?.playEffect("peoples");
        peoplesSprite.animations[0].playOnce().then(() => {
          isPeopleAnimating = false;
        });
      }
    } else if (name === "whale") {
      if (!isWhaleAnimating) {
        isWhaleAnimating = true;
        audioManager?.playEffect("whale");
        whaleSprite.instance.visible = true;
        whaleSprite.animations[0].playOnce().then(() => {
          whaleSprite.instance.visible = false;
          isWhaleAnimating = false;
        });
      }
    } else if (name === "seagull") {
      if (!isSeagullAnimating) {
        isSeagullAnimating = true;
        audioManager?.playEffect("bell");

        for (let i = 0; i < seagullSprites.length; i++) {
          seagullActions[i].play();
          seagullSprites[i].instance.visible = true;
        }

        if (seagullTimer) clearTimeout(seagullTimer);
        seagullTimer = setTimeout(() => {
          for (let i = 0; i < seagullSprites.length; i++) {
            seagullSprites[i].instance.visible = false;
            seagullActions[i].stop();
            seagullActions[i].reset();
          }
          isSeagullAnimating = false;
        }, 3500);
      }
    }
  };

  eventBus.on("clickArea", handleHotspotClick);

  return {
    scene,
    camera,
    update(deltaTime: number): void {
      // 官方 update 逻辑: T && M(), E && u.update(t), p.update(t), A && m.update(t),
      // C && (g.update(t), v.map(...))
      if (cameraFollowEnabled && followController) {
        followController.update();
      }

      // 人群动画 — 仅在 isPeopleAnimating 时更新
      if (isPeopleAnimating) {
        peoplesSprite.animations[0].update(deltaTime);
      }

      // 海浪为背景循环动画，始终更新
      seaSprite.animations[0].update(deltaTime);

      // 鲸鱼动画 — 仅在 isWhaleAnimating 时更新
      if (isWhaleAnimating) {
        whaleSprite.animations[0].update(deltaTime);
      }

      // 海鸥动画 — 仅在 isSeagullAnimating 时更新
      if (isSeagullAnimating) {
        seagullMixer.update(deltaTime);
        for (let i = 0; i < seagullSprites.length; i++) {
          // 实时同步海鸥精灵位置到骨骼位置
          seagullSprites[i].instance.position.copy(
            seagullGLB.scene.children[i].position,
          );
          seagullSprites[i].instance.position.z -= 0.5;
          seagullSprites[i].animations[0].update(deltaTime);
        }
      }
    },
    dispose(): void {
      eventBus.off("clickArea", handleHotspotClick);
      eventBus.off("changeSceneEnd", onChangeSceneEnd);

      if (followController) {
        followController.dispose();
      }

      peoplesSprite.dispose();
      seaSprite.dispose();
      whaleSprite.dispose();
      for (const sprite of seagullSprites) {
        sprite.dispose();
      }

      if (seagullTimer) {
        clearTimeout(seagullTimer);
      }

      gsap.killTweensOf(camera.position);

      seagullMixer.stopAllAction();
      disposeGLTF(subSceneGLB);
      disposeGLTF(seagullGLB);
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
