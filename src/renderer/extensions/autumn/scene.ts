import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { initAudioManager } from "./audio";
import type { ExtensionEventBus } from "./event-bus";
import { createLeftScene } from "./scenes/left";
import { createMainScene } from "./scenes/main";
import { createRightScene } from "./scenes/right";

export interface SceneData {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update(deltaTime: number): void;
  dispose(): void;
  clickableObjects?: Map<THREE.Object3D, (hits: THREE.Intersection[]) => void>;
}

/**
 * 将 ISO-8859-1 (Latin-1) 编码的乱码字符串还原为正确的 UTF-8 中文。
 * 用于解决 3D 模型导出的中文节点名在 JS 运行时解析为 "åœ°é\x9d¢" 等乱码的问题。
 */
export function decodeLatin1ToUtf8(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

/**
 * 包装 Three.js 的 TextureLoader 为 Promise 形式的异步贴图加载器。
 * 设置色彩空间为 SRGBColorSpace 以确保颜色渲染正确。
 */
export function loadTexture(
  textureLoader: THREE.TextureLoader,
  path: string,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    textureLoader.load(
      path,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

interface HotspotConfig {
  name: string;
  style: Record<string, string>;
}

const HOTSPOT_CONFIG: Record<string, HotspotConfig[]> = {
  main: [
    {
      name: "left",
      style: {
        borderRadius: "30% 30% 0 0",
        top: "37%",
        left: "11%",
        width: "11%",
        height: "63%",
      },
    },
    {
      name: "right",
      style: {
        borderRadius: "30% 30% 0 0",
        top: "37%",
        left: "84%",
        width: "12%",
        height: "63%",
      },
    },
  ],
  left: [
    {
      name: "seagull",
      style: { top: "30%", left: "40%", width: "4%", height: "25%" },
    },
    {
      name: "people",
      style: { top: "57%", left: "52%", width: "15%", height: "32%" },
    },
    {
      name: "whale",
      style: { top: "16%", left: "53%", width: "11%", height: "20%" },
    },
  ],
  right: [
    {
      name: "rainbow",
      style: { top: "12%", left: "45%", width: "18%", height: "60%" },
    },
    {
      name: "bell",
      style: { top: "32%", left: "30.5%", width: "2%", height: "22%" },
    },
    {
      name: "leaves",
      style: { top: "21%", left: "63%", width: "10%", height: "40%" },
    },
  ],
};

const fadeShader = {
  uniforms: {
    tDiffuse: { value: null },
    fade: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float fade;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    vec4 LinearToSRGB(vec4 color) {
      return vec4(
        pow(color.rgb, vec3(1.0 / 2.2)),
        color.a
      );
    }

    void main() {
      gl_FragColor = LinearToSRGB(texture2D(tDiffuse, vUv));
      gl_FragColor = mix(gl_FragColor, vec4(1.), fade);
    }`,
};

interface SceneManagerHandle {
  update(deltaTime: number): void;
  resize(): void;
  changeScene(sceneName: "main" | "left" | "right"): Promise<void>;
  dispose(): void;
  onExit: () => void;
}

export function initSceneManager(
  containerEl: HTMLElement,
  eventBus: ExtensionEventBus,
  basePath: string,
): SceneManagerHandle {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const onResize = (): void => {
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const w = containerEl.clientWidth || 1920;
      const h = containerEl.clientHeight || 360;
      renderer.setSize(w, h);
      composer.setSize(w, h);
    });
  };

  let resizeRAF = requestAnimationFrame(() => {});

  containerEl.appendChild(renderer.domElement);
  onResize();
  window.addEventListener("resize", onResize);

  const composer = new EffectComposer(renderer);
  const audioListener = new THREE.AudioListener();

  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();

  const audioManager = initAudioManager(audioListener, eventBus, basePath);

  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  const clickableObjects = new Map<
    THREE.Object3D,
    (hits: THREE.Intersection[]) => void
  >();
  let activeCamera: THREE.Camera | null = null;

  renderer.domElement.addEventListener("click", (event) => {
    if (!activeCamera) return;

    mouseNDC.x = (event.offsetX / renderer.domElement.clientWidth) * 2 - 1;
    mouseNDC.y = -(event.offsetY / renderer.domElement.clientHeight) * 2 + 1;

    raycaster.setFromCamera(mouseNDC, activeCamera);
    const objects = Array.from(clickableObjects.keys());
    const hits = raycaster.intersectObjects(objects);

    for (const hit of hits) {
      const handler = clickableObjects.get(hit.object);
      handler?.(hits);
    }
  });

  const uiContainer = document.createElement("div");
  Object.assign(uiContainer.style, {
    position: "absolute",
    top: "24px",
    right: "24px",
    height: "36px",
    display: "flex",
    flexDirection: "row-reverse",
    zIndex: "2",
  });

  const btnBaseStyle: Record<string, string> = {
    width: "36px",
    height: "36px",
    borderRadius: "4px",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    cursor: "pointer",
    marginLeft: "6px",
  };

  const closeBtn = document.createElement("div");
  Object.assign(closeBtn.style, btnBaseStyle, {
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='21' y1='3' x2='3' y2='21'/%3E%3Cline x1='3' y1='3' x2='21' y2='21'/%3E%3C/svg%3E\")",
  });

  const backBtn = document.createElement("div");
  Object.assign(backBtn.style, btnBaseStyle, {
    display: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='15 18 9 12 15 6'/%3E%3C/svg%3E\")",
  });

  const muteBtn = document.createElement("div");
  const unmutedIcon =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/%3E%3Cpath d='M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07'/%3E%3C/svg%3E\")";
  const mutedIcon =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/%3E%3Cline x1='23' y1='9' x2='17' y2='15'/%3E%3Cline x1='17' y1='9' x2='23' y2='15'/%3E%3C/svg%3E\")";

  const isMuted = localStorage.getItem("banner_audio_paused") === "1";
  Object.assign(muteBtn.style, btnBaseStyle, {
    backgroundImage: isMuted ? mutedIcon : unmutedIcon,
  });

  muteBtn.addEventListener("click", () => {
    const newMuted = localStorage.getItem("banner_audio_paused") !== "1";
    muteBtn.style.backgroundImage = newMuted ? mutedIcon : unmutedIcon;
    localStorage.setItem("banner_audio_paused", newMuted ? "1" : "0");
    eventBus.emit("toggleMute", newMuted);
  });

  uiContainer.appendChild(closeBtn);
  uiContainer.appendChild(backBtn);
  uiContainer.appendChild(muteBtn);

  const uiParent = containerEl.parentElement;
  if (uiParent) {
    uiParent.appendChild(uiContainer);
  }

  let cleanupClickAreas = setupClickAreas(containerEl, "main", eventBus);

  let currentSceneData: SceneData | null = null;
  let renderPass: RenderPass | null = null;

  const fadePass = new ShaderPass(fadeShader);
  composer.addPass(fadePass);

  let fadeState = 0;
  let isFadeIn = false;
  let fadeProgress = 0;
  const FADE_DURATION = 0.7;

  let fadeMiddleResolve: (() => void) | null = null;
  let fadeEndResolve: (() => void) | null = null;

  const fadeIn = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      fadeState = 1;
      isFadeIn = true;
      fadeProgress = 0;
      fadeMiddleResolve = resolve;
    });
  };

  const fadeOut = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      fadeState = 1;
      isFadeIn = false;
      fadeProgress = 0;
      fadeEndResolve = resolve;
    });
  };

  const updateFade = (deltaTime: number): void => {
    if (fadeState === 1) {
      fadeState = 2;
    }
    if (fadeState === 2) {
      if (fadeProgress + deltaTime < FADE_DURATION) {
        fadeProgress += deltaTime;
        const t = fadeProgress / FADE_DURATION;
        fadePass.uniforms.fade.value = isFadeIn ? t : 1 - t;
      } else {
        fadePass.uniforms.fade.value = isFadeIn ? 1 : 0;
        fadeState = 0;
        fadeProgress = 0;

        if (isFadeIn && fadeMiddleResolve) {
          fadeMiddleResolve();
          fadeMiddleResolve = null;
        } else if (!isFadeIn && fadeEndResolve) {
          fadeEndResolve();
          fadeEndResolve = null;
        }
      }
    }
  };

  let disposed = false;

  createMainScene(
    gltfLoader,
    textureLoader,
    eventBus,
    basePath,
    audioManager,
    containerEl,
  ).then(async (sceneData) => {
    if (disposed) return;

    currentSceneData = sceneData;
    renderPass = new RenderPass(sceneData.scene, sceneData.camera);
    composer.insertPass(renderPass, 0);

    activeCamera = sceneData.camera;

    clickableObjects.clear();
    if (sceneData.clickableObjects) {
      for (const [key, value] of sceneData.clickableObjects) {
        clickableObjects.set(key, value);
      }
    }

    // 挂载至 scene 根节点以防 dispose 时影响
    sceneData.scene.add(audioListener);

    try {
      await audioManager.loadSceneAudio("main");
    } catch (e) {
      console.error("[SceneManager] Failed to load main scene audio:", e);
    }
  });

  let isSceneChanging = false;

  eventBus.on("changeScene", async (targetScene: "main" | "left" | "right") => {
    if (isSceneChanging) return;
    isSceneChanging = true;

    cleanupClickAreas();

    let scenePromise: Promise<SceneData>;
    if (targetScene === "main") {
      scenePromise = createMainScene(
        gltfLoader,
        textureLoader,
        eventBus,
        basePath,
        audioManager,
        containerEl,
      );
    } else if (targetScene === "left") {
      scenePromise = createLeftScene(
        gltfLoader,
        textureLoader,
        eventBus,
        basePath,
        audioManager,
        containerEl,
      );
    } else {
      scenePromise = createRightScene(
        gltfLoader,
        textureLoader,
        eventBus,
        basePath,
        audioManager,
        containerEl,
      );
    }

    const [newSceneData] = await Promise.all([scenePromise, fadeIn()]);

    if (disposed) {
      isSceneChanging = false;
      return;
    }

    if (renderPass) {
      composer.removePass(renderPass);
    }
    currentSceneData?.dispose();
    currentSceneData = newSceneData;
    renderPass = new RenderPass(newSceneData.scene, newSceneData.camera);
    composer.insertPass(renderPass, 0);
    activeCamera = newSceneData.camera;

    clickableObjects.clear();
    if (newSceneData.clickableObjects) {
      for (const [key, value] of newSceneData.clickableObjects) {
        clickableObjects.set(key, value);
      }
    }

    newSceneData.scene.add(audioListener);

    try {
      await audioManager.loadSceneAudio(targetScene);
    } catch (e) {
      console.error(
        `[SceneManager] Failed to load scene audio for ${targetScene}:`,
        e,
      );
    }

    await fadeOut();

    cleanupClickAreas = setupClickAreas(containerEl, targetScene, eventBus);
    backBtn.style.display = targetScene === "main" ? "none" : "block";
    eventBus.emit("changeSceneEnd", targetScene);
    isSceneChanging = false;
  });

  backBtn.addEventListener("click", () => {
    eventBus.emit("changeScene", "main");
  });

  let lastTime = Infinity;
  let firstRendered = false;
  let rafId = requestAnimationFrame(() => {});

  const tick = (timestamp: number): void => {
    rafId = requestAnimationFrame(tick);

    const deltaTime = Number.isFinite(lastTime)
      ? (timestamp - lastTime) / 1000
      : 1 / 30;

    if (deltaTime < 0.02857) return;

    currentSceneData?.update(deltaTime);
    updateFade(deltaTime);

    if (activeCamera) {
      audioListener.position.copy(activeCamera.position);
      audioListener.quaternion.copy(activeCamera.quaternion);
    }

    composer.render();

    if (!firstRendered && currentSceneData) {
      firstRendered = true;
      eventBus.emit("sceneReady", true);
    }

    lastTime = timestamp;
  };

  rafId = requestAnimationFrame(tick);

  const exitHandler = (): void => {
    eventBus.emit("toggleMute", true);

    disposed = true;
    cancelAnimationFrame(rafId);

    currentSceneData?.dispose();
    audioManager.dispose();
    composer.passes = [];

    if (uiParent) {
      uiParent.removeChild(uiContainer);
    }

    containerEl.removeChild(renderer.domElement);
    window.removeEventListener("resize", onResize);

    clickableObjects.clear();
    activeCamera = null;

    eventBus.clear();
    renderer.dispose();

    handle.onExit();
  };

  closeBtn.addEventListener("click", exitHandler);

  const handle: SceneManagerHandle = {
    update(_deltaTime: number): void {},
    resize: onResize,
    async changeScene(sceneName: "main" | "left" | "right"): Promise<void> {
      eventBus.emit("changeScene", sceneName);
    },
    dispose: exitHandler,
    onExit: () => {},
  };

  return handle;
}

function setupClickAreas(
  container: HTMLElement,
  sceneName: string,
  eventBus: ExtensionEventBus,
): () => void {
  const areasConfig = HOTSPOT_CONFIG[sceneName] || [];

  const hotspots = areasConfig.map((area) => {
    const div = document.createElement("div");
    const handler = () => eventBus.emit("clickArea", area.name);
    div.addEventListener("click", handler);
    Object.assign(
      div.style,
      {
        position: "absolute",
        cursor: "pointer",
        borderRadius: "50%",
      },
      area.style,
    );
    container.appendChild(div);
    return { element: div, handler };
  });

  return () =>
    hotspots.forEach(({ element, handler }) => {
      element.removeEventListener("click", handler);
      container.removeChild(element);
    });
}

export interface MouseTracker {
  mousePercent: { x: number; y: number };
  dispose(): void;
}

export function createMouseTracker(containerEl: HTMLElement): MouseTracker {
  const mousePercent = { x: 0.5, y: 0.5 };
  const parent = containerEl.parentElement || containerEl;

  const onMove = (e: MouseEvent) => {
    mousePercent.x = e.clientX / parent.clientWidth;
    mousePercent.y = e.clientY / parent.clientHeight;
  };
  const onLeave = () => {
    mousePercent.x = 0.5;
    mousePercent.y = 0.5;
  };

  parent.addEventListener("mousemove", onMove);
  parent.addEventListener("mouseleave", onLeave);

  return {
    mousePercent,
    dispose: () => {
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
    },
  };
}

export interface SphericalCameraFollowParams {
  radius: number;
  target: THREE.Vector3;
  maxTheta: number;
  minTheta: number;
  maxPhi: number;
  minPhi: number;
}

export function setupSphericalCameraFollow(
  camera: THREE.Camera,
  params: SphericalCameraFollowParams,
  containerEl: HTMLElement,
): { update(): void; dispose(): void } {
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  const baseQuaternion = new THREE.Quaternion();

  const currentAngles = {
    phi: (params.maxPhi + params.minPhi) / 2,
    theta: (params.maxTheta + params.minTheta) / 2,
  };

  const tracker = createMouseTracker(containerEl);

  const updateCamera = () => {
    offset.setFromSpherical(spherical);
    offset.applyQuaternion(baseQuaternion);
    spherical.setFromVector3(offset);
    camera.position.copy(params.target).add(offset);
    camera.lookAt(params.target);
  };

  // 初始化
  spherical.set(params.radius, currentAngles.phi, currentAngles.theta);
  updateCamera();

  return {
    update() {
      const targetPhi = THREE.MathUtils.lerp(
        params.minPhi,
        params.maxPhi,
        1 - tracker.mousePercent.y,
      );
      const targetTheta = THREE.MathUtils.lerp(
        params.minTheta,
        params.maxTheta,
        1 - tracker.mousePercent.x,
      );

      currentAngles.phi += 0.05 * (targetPhi - currentAngles.phi);
      currentAngles.theta += 0.05 * (targetTheta - currentAngles.theta);

      if (
        Math.abs(spherical.phi - currentAngles.phi) > 1e-6 ||
        Math.abs(spherical.theta - currentAngles.theta) > 1e-6
      ) {
        spherical.set(params.radius, currentAngles.phi, currentAngles.theta);
        updateCamera();
      }
    },
    dispose() {
      tracker.dispose();
    },
  };
}
