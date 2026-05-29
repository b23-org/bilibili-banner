import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ExtensionEventBus } from "./event-bus";

export interface CharacterModels {
  char22Left: GLTF;
  char22Right: GLTF;
  char33Left: GLTF;
  char33Right: GLTF;
}

interface AudioManager {
  playEffect(name: string): void;
  stopEffect(name: string): void;
}

export interface CharacterSetup {
  scene: THREE.Scene;
  models: CharacterModels;
  groundMesh: THREE.Object3D;
  eventBus: ExtensionEventBus;
  audioManager?: AudioManager;
}

function crossFadeAnimation(
  fromAction: THREE.AnimationAction,
  toAction: THREE.AnimationAction,
  duration: number,
): void {
  toAction.enabled = true;
  toAction.setEffectiveTimeScale(1);
  toAction.setEffectiveWeight(1);
  toAction.time = 0;
  fromAction.crossFadeTo(toAction, duration, true);
}

export function setupCharacters(setup: CharacterSetup): {
  update(deltaTime: number): void;
  dispose(): void;
} {
  const { scene, models, groundMesh, eventBus, audioManager } = setup;
  const { char22Left, char22Right, char33Left, char33Right } = models;

  // 1. 进行动画重映射
  // bili22
  char22Left.animations = [
    char22Left.animations[0],
    char22Left.animations[1],
    char22Left.animations[3],
  ];
  char22Right.animations = [
    char22Right.animations[1],
    char22Right.animations[2],
    char22Right.animations[0],
  ];

  // bili33
  char33Left.animations = [
    char33Left.animations[2],
    char33Left.animations[1],
    char33Left.animations[0],
  ];
  // char33Right.animations 保持原序 [0, 1, 2]

  const group22 = new THREE.Group();
  const group33 = new THREE.Group();
  scene.add(group22);
  scene.add(group33);

  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3(0, 10, 0);
  const rayDirection = new THREE.Vector3(0, -1, 0);

  const getGroundPositionY = (worldPos: THREE.Vector3): number => {
    if (!groundMesh) return 0;
    rayOrigin.x = worldPos.x;
    rayOrigin.z = worldPos.z;
    raycaster.set(rayOrigin, rayDirection);
    const hits = raycaster.intersectObject(groundMesh);
    return hits[0]?.distance ? rayOrigin.y - hits[0].distance : 0;
  };

  // ================= Bili22 初始化 =================
  group22.add(char22Left.scene, char22Right.scene);
  char22Left.scene.visible = false;
  group22.position.set(0, 0, 30);
  group22.rotateX(-20 * THREE.MathUtils.DEG2RAD);

  const mixers22 = [char22Left.scene, char22Right.scene].map(
    (s) => new THREE.AnimationMixer(s),
  );

  let facingRight22 = true;
  let isWalking22 = false;
  let isListening22 = false;
  let currentAnim22 = "idle";

  const animActions22 = mixers22.map((mixer, idx) => {
    const actions = Array.from({ length: 3 }, (_, animIdx) => {
      const action = mixer.clipAction(
        (idx === 0 ? char22Left : char22Right).animations[animIdx],
      );
      action.play();
      action.weight = 0;
      return action;
    });
    actions[0].weight = 1;
    return actions;
  });

  const setAnimation22 = (newAnim: string, duration = 0.1): void => {
    if (newAnim === currentAnim22) return;
    animActions22.forEach((actions) => {
      const animMap: Record<string, THREE.AnimationAction> = {
        idle: actions[0],
        lean: actions[1],
        walk: actions[2],
      };
      crossFadeAnimation(animMap[currentAnim22], animMap[newAnim], duration);
    });
    currentAnim22 = newAnim;
  };

  const setFacing22 = (right: boolean): void => {
    facingRight22 = right;
    char22Left.scene.visible = !right;
    char22Right.scene.visible = right;
  };

  const targetPos22 = new THREE.Vector2(group22.position.x, group22.position.z);
  const currentPos22 = new THREE.Vector2(
    group22.position.x,
    group22.position.z,
  );

  const onMoveTo = (point: THREE.Vector3) => {
    if (!isListening22) {
      targetPos22.x = point.x;
      targetPos22.y = point.z;
    }
  };
  eventBus.on("moveTo", onMoveTo);

  const onListen22 = async (targetScene: "left" | "right") => {
    isListening22 = true;
    isWalking22 = false;
    audioManager?.stopEffect("walk");
    targetPos22.copy(currentPos22);
    setAnimation22("lean", 0.1);
    let hasTriggered = false;

    for (const mixer of mixers22) {
      const leanAction = animActions22[mixers22.indexOf(mixer)][1];
      leanAction.clampWhenFinished = true;
      leanAction.loop = THREE.LoopOnce;

      await new Promise<void>((resolve) => {
        const handler = (
          e: THREE.Event & { action?: THREE.AnimationAction },
        ) => {
          if (e.action === leanAction) {
            mixer.removeEventListener("finished", handler);
            resolve();
          }
        };
        mixer.addEventListener("finished", handler);
      });

      if (!hasTriggered) {
        eventBus.emit("changeScene", targetScene);
        hasTriggered = true;
      }
    }
  };
  eventBus.on("listen", onListen22);

  // ================= Bili33 初始化 =================
  group33.add(char33Left.scene, char33Right.scene);
  char33Right.scene.visible = false;
  group33.position.set(5, 0, 30);
  group33.rotateX(-20 * THREE.MathUtils.DEG2RAD);
  group33.scale.set(0.8, 0.8, 0.8);

  const mixers33 = [char33Left.scene, char33Right.scene].map(
    (s) => new THREE.AnimationMixer(s),
  );

  let facingRight33 = false;
  let isWalking33 = false;
  let isListening33 = false;
  let currentAnim33 = "idle";

  const animActions33 = mixers33.map((mixer, idx) => {
    const actions = Array.from({ length: 3 }, (_, animIdx) => {
      const action = mixer.clipAction(
        (idx === 0 ? char33Left : char33Right).animations[animIdx],
      );
      action.play();
      action.weight = 0;
      return action;
    });
    actions[0].weight = 1;
    return actions;
  });

  const setAnimation33 = (newAnim: string, duration = 0.3): void => {
    if (newAnim === currentAnim33) return;
    animActions33.forEach((actions) => {
      const animMap: Record<string, THREE.AnimationAction> = {
        idle: actions[0],
        lean: actions[1],
        walk: actions[2],
      };
      crossFadeAnimation(animMap[currentAnim33], animMap[newAnim], duration);
    });
    currentAnim33 = newAnim;
  };

  const setFacing33 = (right: boolean): void => {
    facingRight33 = right;
    char33Left.scene.visible = !right;
    char33Right.scene.visible = right;
  };

  const bili22Pos = new THREE.Vector2(group22.position.x, group22.position.z);
  const currentPos33 = new THREE.Vector2(
    group33.position.x,
    group33.position.z,
  );

  const onBili22Move = (pos: THREE.Vector2) => {
    bili22Pos.copy(pos);
  };
  eventBus.on("bili22Move", onBili22Move);

  const onListen33 = () => {
    isListening33 = true;
    isWalking33 = false;
    setAnimation33("lean", 0.3);
    mixers33.forEach(async (mixer, idx) => {
      const leanAction = animActions33[idx][1];
      leanAction.clampWhenFinished = true;
      leanAction.loop = THREE.LoopOnce;
      await new Promise<void>((resolve) => {
        const handler = (
          e: THREE.Event & { action?: THREE.AnimationAction },
        ) => {
          if (e.action === leanAction) {
            mixer.removeEventListener("finished", handler);
            resolve();
          }
        };
        mixer.addEventListener("finished", handler);
      });
    });
  };
  eventBus.on("listen", onListen33);

  return {
    update(deltaTime: number): void {
      // 1. Update Bili22
      mixers22.forEach((m) => {
        m.update(deltaTime);
      });

      if (targetPos22.distanceTo(currentPos22) > 0.1) {
        if (currentPos22.x > targetPos22.x && facingRight22) setFacing22(false);
        else if (currentPos22.x < targetPos22.x && !facingRight22)
          setFacing22(true);

        if (!isWalking22 && !isListening22) {
          isWalking22 = true;
          setAnimation22("walk");
          audioManager?.playEffect("walk");
        }

        const moveDir = new THREE.Vector2()
          .copy(targetPos22)
          .sub(currentPos22)
          .normalize()
          .multiplyScalar(5 * deltaTime);
        currentPos22.add(moveDir);

        const groundY = getGroundPositionY(group22.position);
        group22.position.x = currentPos22.x;
        group22.position.z = currentPos22.y;
        group22.position.y = groundY;

        eventBus.emit("bili22Move", currentPos22);
      } else if (isWalking22) {
        isWalking22 = false;
        if (!isListening22) setAnimation22("idle");
        currentPos22.copy(targetPos22);
        group22.position.x = currentPos22.x;
        group22.position.z = currentPos22.y;
        audioManager?.stopEffect("walk");
        eventBus.emit("bili22Move", currentPos22);
      }

      // 2. Update Bili33
      mixers33.forEach((m) => {
        m.update(deltaTime);
      });

      if (isListening33) return;

      if (bili22Pos.distanceTo(currentPos33) - 5 > 0.2) {
        if (currentPos33.x > bili22Pos.x && facingRight33) setFacing33(false);
        else if (currentPos33.x < bili22Pos.x && !facingRight33)
          setFacing33(true);

        if (!isWalking33 && !isListening33) {
          isWalking33 = true;
          setAnimation33("walk");
        }

        const moveDir = new THREE.Vector2()
          .copy(bili22Pos)
          .sub(currentPos33)
          .normalize()
          .multiplyScalar(4 * deltaTime);
        currentPos33.add(moveDir);

        const groundY = getGroundPositionY(group33.position);
        group33.position.x = currentPos33.x;
        group33.position.z = currentPos33.y;
        group33.position.y = groundY;
      } else if (isWalking33) {
        isWalking33 = false;
        if (!isListening33) setAnimation33("idle");

        const offset = new THREE.Vector2()
          .copy(currentPos33)
          .sub(bili22Pos)
          .normalize()
          .multiplyScalar(5);
        currentPos33.copy(bili22Pos).add(offset);

        const groundY = getGroundPositionY(group33.position);
        group33.position.x = currentPos33.x;
        group33.position.z = currentPos33.y;
        group33.position.y = groundY;
      }
    },

    dispose(): void {
      scene.remove(group22);
      scene.remove(group33);
      eventBus.off("moveTo", onMoveTo);
      eventBus.off("listen", onListen22);
      eventBus.off("bili22Move", onBili22Move);
      eventBus.off("listen", onListen33);

      audioManager?.stopEffect("walk");

      mixers22.forEach((m) => {
        m.stopAllAction();
      });
      mixers33.forEach((m) => {
        m.stopAllAction();
      });

      disposeGLTF(char22Left);
      disposeGLTF(char22Right);
      disposeGLTF(char33Left);
      disposeGLTF(char33Right);
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
