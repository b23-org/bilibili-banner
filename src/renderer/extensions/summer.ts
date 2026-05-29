import * as THREE from "three";
import {
  type BannerExtension,
  type BannerExtensionContext,
  queryBannerUiElements,
} from "./core";

// ── Resource manifests ──

const BASE = "assets/extensions/summer/";

const VIDEO_FILES = [
  "SKE8wd45QU.webm", // 0: 空背景视频 (无内容)
  "0niZsL8MB2.webm", // 1: 22玩游戏视频
  "d6e21ea6c0a43f5d04c46d6d3bf8c2be1f68fa52.webm", // 2: 22玩游戏画面
  "jldzj4Xjg6.webm", // 3: 33在桌子前看书动画一 (默认循环)
  "wVMuVaizdV.webm", // 4: 33放下手机视频
  "Mkq24Q07yp.webm", // 5: 33拿起手机视频
  "Dxra9kefPp.webm", // 6: 33在桌子前看书动画二 (分支一)
  "eyVg5JzCuv.webm", // 7: 33在桌子前看书动画三 (分支二)
  "YGFpy87q1A.webm", // 8: 雨滴落在窗户上聚拢下落动画一
  "ea6faf4797a9a366c6ea84f99034b6621589ff1d.webm", // 9: 雨滴落在窗户上聚拢下落动画二
];

const IMAGE_FILES = [
  "VQj06ftSDE.png", // 0: 主场景的背景装饰图
  "NnTy0DIi2R.png", // 1: 主场景背景图
  "Xm1kA7GtjO.png", // 2: 33桌前电脑屏幕闪烁贴图
  "CwEe1GliH5.png", // 3: phone_bg - phone panel bg
  "JSI0DJmtSC.png", // 4: vol_active - volume on icon
  "1WZCKslZAM.png", // 5: vol_mute - volume mute icon
];

const AUDIO_FILES = [
  "5hXxHHvjtF.mp3", // 0: 主背景音效
  "CGa9nSkKhg.mp3", // 1: 33翻书音效 (伴随看书动画二触发)
  "v1oD0nZzBH.mp3", // 2: 33擦眼动作音效 (伴随看书动画三触发)
  "5gPxskknWD.mp3", // 3: 拿起手机音效
  "QJWxOXQtfA.mp3", // 4: 放下手机音效
];

// ── Type-safe navigator extension ──

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
  };
}

export default class SummerExtension implements BannerExtension {
  // ── Lifecycle state ──
  private context: BannerExtensionContext | null = null;
  private isExpanded = false;
  private isExtendMode = false;
  private originalHeight = 0;

  // ── Preloaded assets ──
  private videos: HTMLVideoElement[] = [];
  private imageTextures: THREE.Texture[] = [];
  private audioBuffers: AudioBuffer[] = [];

  // ── Three.js runtime ──
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private audioListener: THREE.AudioListener | null = null;
  private animationFrameId: number | null = null;
  private videoTextures: Map<HTMLVideoElement, THREE.VideoTexture> = new Map();
  private meshBlink: THREE.Mesh | null = null;
  private meshTV: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;

  // ── Audio runtime ──
  private audios: THREE.Audio[] = [];
  private bgMusic: THREE.Audio | null = null;
  private isMutedLocally = false;

  // ── Interactive state machine ──
  private phoneCallState = 0;
  private readingLoopCount = 5;
  private currentTVVid: HTMLVideoElement | null = null;
  private audioMap: Map<HTMLVideoElement, THREE.Audio> = new Map();

  // ── DOM references (owned and created by this extension) ──
  private summerBannerContainer: HTMLDivElement | null = null;
  private clickHotspot: HTMLDivElement | null = null;
  private gameArea: HTMLDivElement | null = null;
  private phoneArea: HTMLDivElement | null = null;
  private closeButton: HTMLDivElement | null = null;
  private closeIcon: SVGElement | null = null;
  private phonePanel: HTMLDivElement | null = null;
  private volStyleElement: HTMLStyleElement | null = null;

  // ── Timers & listeners (all explicitly cleared in dispose) ──
  private extendTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeRafId: ReturnType<typeof requestAnimationFrame> | null = null;
  private boundResize: (() => void) | null = null;
  private boundVisibilityChange: (() => void) | null = null;
  private boundPutDown: (() => void) | null = null;

  // ── Video role group: videos that auto-play in the background ──
  private backgroundVideos: HTMLVideoElement[] = [];

  // ════════════════════════════════════════════════════════════════
  // 1. prepare — capability check + asset preloading
  // ════════════════════════════════════════════════════════════════

  async prepare(context: BannerExtensionContext): Promise<boolean> {
    this.context = context;

    // A. Capability detection (mirrors original B站 Kx entry)
    const canvas = document.createElement("canvas");
    const hasWebGL2 = !!canvas.getContext("webgl2");
    const hasShadowDOM = !!document.createElement("div").attachShadow;

    const nav = navigator as NavigatorWithMemory;
    const effectiveType = nav.connection?.effectiveType;
    const isSlowNetwork =
      effectiveType != null && ["slow-2g", "2g"].includes(effectiveType);
    const isLowMemory = nav.deviceMemory != null && nav.deviceMemory < 4;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (
      !(
        hasWebGL2 &&
        hasShadowDOM &&
        !isSlowNetwork &&
        !isLowMemory &&
        !isSafari
      )
    ) {
      return false;
    }

    try {
      const signal = context.signal;

      // B. Preload videos
      const loadVideo = (fileName: string): Promise<HTMLVideoElement> =>
        new Promise((resolve, reject) => {
          if (signal.aborted)
            return reject(new DOMException("Aborted", "AbortError"));
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "auto";
          video.crossOrigin = "anonymous";
          video.src = `${BASE}${fileName}`;

          const onCanPlay = () => {
            video.removeEventListener("canplaythrough", onCanPlay);
            video.removeEventListener("error", onError);
            resolve(video);
          };
          const onError = () => {
            video.removeEventListener("canplaythrough", onCanPlay);
            video.removeEventListener("error", onError);
            reject(new Error(`Failed to load video: ${fileName}`));
          };
          const onAbort = () => {
            video.removeEventListener("canplaythrough", onCanPlay);
            video.removeEventListener("error", onError);
            video.src = "";
            reject(new DOMException("Aborted", "AbortError"));
          };

          video.addEventListener("canplaythrough", onCanPlay);
          video.addEventListener("error", onError);
          signal.addEventListener("abort", onAbort, { once: true });
        });

      this.videos = await Promise.all(VIDEO_FILES.map(loadVideo));

      // C. Preload images as Three.js textures
      const textureLoader = new THREE.TextureLoader();
      const loadTexture = (fileName: string): Promise<THREE.Texture> =>
        new Promise((resolve, reject) => {
          if (signal.aborted)
            return reject(new DOMException("Aborted", "AbortError"));
          textureLoader.load(
            `${BASE}${fileName}`,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              resolve(tex);
            },
            undefined,
            () => reject(new Error(`Failed to load image: ${fileName}`)),
          );
        });

      this.imageTextures = await Promise.all(IMAGE_FILES.map(loadTexture));

      // D. Preload audio buffers
      const audioLoader = new THREE.AudioLoader();
      const loadAudio = (fileName: string): Promise<AudioBuffer> =>
        new Promise((resolve, reject) => {
          if (signal.aborted)
            return reject(new DOMException("Aborted", "AbortError"));
          audioLoader.load(
            `${BASE}${fileName}`,
            (buf) => resolve(buf),
            undefined,
            () => reject(new Error(`Failed to load audio: ${fileName}`)),
          );
        });

      this.audioBuffers = await Promise.all(AUDIO_FILES.map(loadAudio));

      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }
      console.error("[SummerExtension] prepare failed:", error);
      return false;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. mount — DOM injection, Three.js init, event binding
  // ════════════════════════════════════════════════════════════════

  async mount(context: BannerExtensionContext): Promise<void> {
    this.context = context;
    if (this.videos.length === 0 || this.imageTextures.length === 0) return;

    this.originalHeight = context.bannerEl.clientHeight;

    const [
      videoEmptyBg,
      videoBili22Gaming,
      videoGameScreen,
      videoBili33Reading1,
      videoBili33PutDownPhone,
      videoBili33PickupPhone,
      videoBili33Reading2,
      videoBili33Reading3,
      videoRaindrops1,
      videoRaindrops2,
    ] = this.videos;
    const [texDecoBg, texSceneBg, texScreenBlink] = this.imageTextures;
    this.currentTVVid = videoBili33Reading1;

    // Group by role: videos that auto-play vs. state-machine-driven
    this.backgroundVideos = [
      videoEmptyBg,
      videoBili22Gaming,
      videoGameScreen,
      videoBili33Reading1,
      videoRaindrops1,
      videoRaindrops2,
    ];
    for (const vid of this.backgroundVideos) {
      vid.autoplay = true;
    }

    // A. Create WebGL host container (div.summer-banner)
    const summerBanner = document.createElement("div");
    summerBanner.className = "summer-banner";
    Object.assign(summerBanner.style, {
      position: "absolute",
      top: "75%",
      transform: "translate(-50%, -50%)",
      left: "50%",
      width: "100%",
      minWidth: "1654px",
      transition: "top 0.6s linear",
      zIndex: "1",
    });
    this.summerBannerContainer = summerBanner;

    const { innerEl, logoEl } = queryBannerUiElements(context.bannerEl);
    if (logoEl) {
      logoEl.style.setProperty("z-index", "3");
    }
    if (innerEl) {
      context.bannerEl.insertBefore(summerBanner, innerEl);
    } else {
      context.bannerEl.appendChild(summerBanner);
    }

    // Responsive height calculation
    const updateHeight = () => {
      if (this.resizeRafId != null) cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = requestAnimationFrame(() => {
        if (!this.summerBannerContainer || !this.context) return;
        const h = Math.max(
          0.1875 * this.summerBannerContainer.clientWidth,
          155,
        );
        this.summerBannerContainer.style.height = `${h}px`;
        if (this.isExpanded) {
          this.context.bannerEl.style.height = `${h}px`;
          this.context.bannerEl.style.maxHeight = `${h}px`;
        }
      });
    };
    updateHeight();

    this.boundResize = () => updateHeight();
    window.addEventListener("resize", this.boundResize);

    // B. Header container styles
    context.bannerEl.style.overflow = "hidden";
    context.bannerEl.style.transition = "height 0.6s linear";

    // C. Init Three.js scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-960, 960, 180, -180, 1, 1000);
    this.camera.position.set(0, 0, 100);
    this.camera.lookAt(0, 0, 0);

    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(1920, 360);
    Object.assign(this.renderer.domElement.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
    });
    summerBanner.appendChild(this.renderer.domElement);

    // D. Instantiate audio objects
    const savedPaused = localStorage.getItem("banner_audio_paused") === "1";
    this.isMutedLocally = savedPaused;
    const rawVol = parseFloat(
      localStorage.getItem("banner_audio_volume") || "",
    );
    const currentVolume = Number.isNaN(rawVol)
      ? 0.5
      : Math.max(0, Math.min(1, rawVol));

    this.audios = this.audioBuffers.map((buffer) => {
      const audio = new THREE.Audio(this.audioListener!);
      audio.setBuffer(buffer);
      audio.setVolume(currentVolume);
      return audio;
    });

    const [
      bgMusic,
      audioBili33FlipBook,
      audioRubEyes,
      audioPickupPhone,
      audioPutDownPhone,
    ] = this.audios;
    this.bgMusic = bgMusic;
    this.bgMusic.setLoop(true);

    this.audioMap = new Map([
      [videoBili33Reading2, audioBili33FlipBook],
      [videoBili33Reading3, audioRubEyes],
      [videoBili33PickupPhone, audioPickupPhone],
      [videoBili33PutDownPhone, audioPutDownPhone],
    ]);

    // E. Build video textures
    this.videoTextures = new Map(
      this.videos.map((vid) => {
        const tex = new THREE.VideoTexture(vid);
        tex.colorSpace = THREE.SRGBColorSpace;
        return [vid, tex];
      }),
    );

    const helperCreateMesh = (
      texture: THREE.Texture,
      w = 1920,
      h = 360,
    ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        map: texture,
      });
      return new THREE.Mesh(geo, mat);
    };

    // Try to start background videos — may fail without user gesture, retried on click
    [videoEmptyBg, videoBili22Gaming, videoGameScreen].forEach((vid) => {
      vid.loop = true;
    });
    this.safePlayAll(this.backgroundVideos);

    // F. Periodic video meshes (bottom of scene graph — matches original order)
    const setupPeriodicVideo = (
      vid: HTMLVideoElement,
      period: number,
      width: number,
      height: number,
      xPos: number,
      yPos: number,
      zPos: number,
    ): ((time: number) => void) => {
      const mesh = helperCreateMesh(
        this.videoTextures.get(vid)!,
        width,
        height,
      );
      this.scene!.add(mesh);
      const targetX = -1920 / 2 + xPos + width / 2;
      const targetY = 360 / 2 - yPos - height / 2;
      mesh.position.set(targetX, targetY, zPos);
      vid.addEventListener("ended", () => {
        mesh.visible = false;
      });

      let elapsed = 0;
      let lastTime = 0;
      return (time: number) => {
        elapsed += time - lastTime;
        if (elapsed > period) {
          elapsed = 0;
          mesh.visible = true;
          vid.currentTime = 0;
          vid.play().catch(() => {});
        }
        lastTime = time;
      };
    };

    const updateRaindrops1 = setupPeriodicVideo(
      videoRaindrops1,
      3600,
      50,
      240,
      160,
      20,
      2,
    );
    const updateRaindrops2 = setupPeriodicVideo(
      videoRaindrops2,
      2000,
      30,
      220,
      30,
      70,
      2,
    );

    // G. Main scene meshes (on top of periodic meshes)
    const meshBg = helperCreateMesh(texDecoBg);
    meshBg.position.set(0, 0, 0);

    const meshVidBg = helperCreateMesh(this.videoTextures.get(videoEmptyBg)!);
    meshVidBg.position.set(0, 0, 1);

    const meshFgPerson = helperCreateMesh(
      this.videoTextures.get(videoGameScreen)!,
      96,
      48,
    );
    meshFgPerson.position.set(735, 60, 3);

    const meshNeon = helperCreateMesh(texSceneBg);
    meshNeon.position.set(0, 0, 4);

    const meshPersonMain = helperCreateMesh(
      this.videoTextures.get(videoBili22Gaming)!,
      200,
      265,
    );
    meshPersonMain.position.set(-960 + 1410 + 100, 180 - 50 - 132.5, 5);

    this.meshTV = helperCreateMesh(
      this.videoTextures.get(videoBili33Reading1)!,
      520,
      360,
    );
    this.meshTV.position.set(-960 + 560 + 260, 180 - 0 - 180, 6);

    this.scene.add(meshBg);
    this.scene.add(meshVidBg);
    this.scene.add(meshFgPerson);
    this.scene.add(meshNeon);
    this.scene.add(meshPersonMain);
    this.scene.add(this.meshTV);

    // H. Blink mesh (A_blink, topmost layer — toggled by blink sequence)
    this.meshBlink = helperCreateMesh(texScreenBlink);
    this.meshBlink.position.set(0, 0, 7);
    this.scene.add(this.meshBlink);

    const blinkSequence = [
      80, 160, 240, 320, 400, 480, 920, 960, 1040, 1120, 1200, 1280, 1360, 1440,
      5440, 5520,
    ];
    const blinkCycle = blinkSequence[blinkSequence.length - 1];
    let blinkElapsed = 0;
    let blinkIndex = 0;
    let blinkLastTime = 0;

    // I. 35 FPS capped render loop
    let lastRenderTime = 0;
    const renderLoop = (time: number) => {
      this.animationFrameId = requestAnimationFrame(renderLoop);
      if (lastRenderTime + 28.57 > time) return;

      blinkElapsed += time - blinkLastTime;
      if (blinkElapsed > blinkCycle) {
        blinkElapsed = 0;
        blinkIndex = 0;
        if (this.meshBlink) this.meshBlink.visible = blinkIndex % 2 === 0;
      } else if (blinkElapsed > blinkSequence[blinkIndex]) {
        blinkIndex += 1;
        if (this.meshBlink) this.meshBlink.visible = blinkIndex % 2 === 0;
      }
      blinkLastTime = time;

      updateRaindrops1(time);
      updateRaindrops2(time);

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      lastRenderTime = time;
    };
    this.animationFrameId = requestAnimationFrame(renderLoop);

    // H. Build DOM interaction hotspots
    this.gameArea = document.createElement("div");
    Object.assign(this.gameArea.style, {
      position: "absolute",
      left: "85%",
      top: "18%",
      width: "7.5%",
      height: "32%",
      cursor: "pointer",
      display: "none",
    });
    this.gameArea.addEventListener("click", () => {
      if (this.isExtendMode) {
        window.open(
          "https://www.bilibili.com/blackboard/fe/activity-HQjQSdd3L8.html",
        );
      }
    });

    this.phoneArea = document.createElement("div");
    Object.assign(this.phoneArea.style, {
      position: "absolute",
      left: "30%",
      top: "40%",
      width: "10%",
      height: "60%",
      cursor: "pointer",
      display: "none",
    });

    this.closeButton = document.createElement("div");
    Object.assign(this.closeButton.style, {
      position: "absolute",
      right: "24px",
      top: "24px",
      width: "36px",
      height: "36px",
      borderRadius: "4px",
      backgroundColor: "#ccc",
      mixBlendMode: "overlay",
      cursor: "pointer",
      display: "none",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "2",
    });

    this.closeIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    this.closeIcon.setAttribute("viewBox", "0 0 24 24");
    this.closeIcon.setAttribute("fill", "none");
    this.closeIcon.setAttribute("stroke", "white");
    this.closeIcon.setAttribute("stroke-width", "3.5");
    this.closeIcon.setAttribute("stroke-linecap", "round");
    this.closeIcon.setAttribute("stroke-linejoin", "round");
    this.closeIcon.innerHTML = `
      <line x1="21" y1="3" x2="3" y2="21"></line>
      <line x1="3" y1="3" x2="21" y2="21"></line>
    `;

    Object.assign(this.closeIcon.style, {
      width: "32px",
      height: "32px",
      pointerEvents: "none",
    });

    this.closeButton.appendChild(this.closeIcon);

    summerBanner.appendChild(this.gameArea);
    summerBanner.appendChild(this.phoneArea);
    context.bannerEl.appendChild(this.closeButton);

    // I. Phone control panel DOM
    this.phonePanel = document.createElement("div");
    Object.assign(this.phonePanel.style, {
      position: "absolute",
      top: "0%",
      left: "0%",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      display: "none",
      zIndex: "1",
      cursor: "pointer",
    });

    const phoneBody = document.createElement("div");
    Object.assign(phoneBody.style, {
      position: "absolute",
      bottom: "-100%",
      left: "40%",
      width: "20%",
      height: "98.75%",
      transition: "bottom 0.6s ease-in-out",
      backgroundImage: `url(${BASE}CwEe1GliH5.png)`,
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "bottom",
      cursor: "default",
    });
    this.phonePanel.appendChild(phoneBody);

    // Mute / unmute button
    const muteBtn = document.createElement("div");
    Object.assign(muteBtn.style, {
      position: "absolute",
      top: "33%",
      left: "45%",
      width: "12%",
      height: "12%",
      cursor: "pointer",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      backgroundImage: `url(${BASE}${savedPaused ? "1WZCKslZAM.png" : "JSI0DJmtSC.png"})`,
    });
    phoneBody.appendChild(muteBtn);

    // Volume slider
    const volInput = document.createElement("input");
    volInput.type = "range";
    volInput.classList.add("banner_2022_summer_volume");
    volInput.value = (currentVolume * 100).toString();

    const volStyle = document.createElement("style");
    volStyle.innerHTML =
      `input.banner_2022_summer_volume[type=range]{-webkit-appearance:none;background:transparent;position:absolute;width:36%;top:83%;left:32%;margin:0}` +
      `input.banner_2022_summer_volume[type=range]:focus{outline:none}` +
      `input.banner_2022_summer_volume[type=range]::-webkit-slider-runnable-track{width:100%;height:8px;cursor:pointer;background:#004a87;border-radius:4px}` +
      `input.banner_2022_summer_volume[type=range]::-webkit-slider-thumb{border:4px solid #fff;height:24px;width:24px;border-radius:50%;background:#004a87;cursor:pointer;-webkit-appearance:none;margin-top:-8px}` +
      `input.banner_2022_summer_volume[type=range]::-moz-range-track{width:100%;height:8px;cursor:pointer;background:#004a87;border-radius:4px}` +
      `input.banner_2022_summer_volume[type=range]::-moz-range-thumb{border:4px solid #fff;height:24px;width:24px;border-radius:50%;background:#004a87;cursor:pointer}`;
    this.volStyleElement = volStyle;
    document.head.appendChild(volStyle);

    phoneBody.appendChild(volInput);
    summerBanner.appendChild(this.phonePanel);

    // J. Phone panel event bindings
    muteBtn.addEventListener("click", () => {
      this.isMutedLocally = !this.isMutedLocally;
      muteBtn.style.backgroundImage = `url(${BASE}${this.isMutedLocally ? "1WZCKslZAM.png" : "JSI0DJmtSC.png"})`;
      if (this.isMutedLocally) {
        this.bgMusic?.pause();
        localStorage.setItem("banner_audio_paused", "1");
      } else {
        this.resumeAudioContext().then(() => {
          try {
            this.bgMusic?.play();
          } catch (_) {
            /* AudioContext may be suspended */
          }
        });
        localStorage.setItem("banner_audio_paused", "0");
      }
    });

    volInput.addEventListener("change", () => {
      const vVal = Number(volInput.value) / 100;
      this.audios.forEach((aud) => {
        aud.setVolume(vVal);
      });
      localStorage.setItem("banner_audio_volume", vVal.toString());
    });

    this.phonePanel.addEventListener("click", (evt) => {
      if (evt.target === this.phonePanel && this.boundPutDown) {
        this.boundPutDown();
      }
    });

    // K. Phone state machine interaction logic
    const handleTVEnded = async () => {
      const prevVid = this.currentTVVid!;
      if (this.currentTVVid === videoBili33Reading1) {
        this.readingLoopCount = Math.max(0, this.readingLoopCount - 1);
      } else {
        this.phoneCallState = 0;
        this.currentTVVid = videoBili33Reading1;
      }

      if (this.readingLoopCount === 0) {
        const rand = Math.random();
        if (rand < 0.5) {
          this.currentTVVid!.pause();
          this.currentTVVid!.currentTime = 0;
          if (rand < 0.3) {
            this.readingLoopCount = 3;
            this.currentTVVid = videoBili33Reading2;
          } else {
            this.readingLoopCount = 5;
            this.currentTVVid = videoBili33Reading3;
          }
        }
      }

      this.currentTVVid!.currentTime = 0;
      await this.currentTVVid!.play().catch(() => {});
      await new Promise((r) => requestAnimationFrame(r));

      if (prevVid !== this.currentTVVid) {
        this.meshTV!.material.map = this.videoTextures.get(this.currentTVVid!)!;
        try {
          const prevAudio = this.audioMap.get(prevVid);
          if (
            prevAudio &&
            (prevAudio as unknown as { source?: unknown }).source
          )
            (prevAudio as unknown as { stop(): void }).stop();
        } catch (_err) {
          /* Audio may not have started */
        }

        if (this.isExtendMode) {
          const nextAudio = this.audioMap.get(this.currentTVVid);
          if (nextAudio) {
            try {
              nextAudio.play();
            } catch (_) {}
          }
        }

        if (prevVid !== videoBili33Reading1) {
          prevVid.currentTime = 0;
          prevVid.pause();
        }
      }
    };

    [
      videoBili33Reading1,
      videoBili33Reading2,
      videoBili33Reading3,
      videoBili33PutDownPhone,
    ].forEach((vid) => {
      vid.addEventListener("ended", handleTVEnded);
    });

    videoBili33PickupPhone.addEventListener("ended", () => {
      this.phoneCallState = 2;
      this.phonePanel?.style.removeProperty("display");
      // Force reflow so Firefox registers the initial bottom:-100% before transition
      void this.phonePanel?.offsetHeight;
      requestAnimationFrame(() => {
        phoneBody.style.setProperty("bottom", "0%");
      });
    });

    this.phoneArea.addEventListener("click", async () => {
      if (this.isExtendMode && this.phoneCallState === 0) {
        this.phoneCallState = 1;
        this.currentTVVid?.pause();
        if (this.currentTVVid) this.currentTVVid.currentTime = 0;

        try {
          const curAudio = this.audioMap.get(this.currentTVVid!);
          if (curAudio && (curAudio as unknown as { source?: unknown }).source)
            (curAudio as unknown as { stop(): void }).stop();
        } catch (_err) {
          /* Audio may not have started */
        }

        this.currentTVVid = videoBili33PickupPhone;
        this.currentTVVid.currentTime = 0;
        await this.currentTVVid.play().catch(() => {});
        await new Promise((r) => requestAnimationFrame(r));

        if (this.isExtendMode) {
          try {
            audioPickupPhone.play();
          } catch (_) {}
        }
        this.meshTV!.material.map = this.videoTextures.get(this.currentTVVid)!;
      }
    });

    this.boundPutDown = async () => {
      if (this.phoneCallState !== 2) return;
      this.phoneCallState = 1;

      phoneBody.style.setProperty("bottom", "-100%");
      phoneBody.ontransitionend = () => {
        phoneBody.ontransitionend = null;
        this.phonePanel?.style.setProperty("display", "none");
      };

      const prevVid = this.currentTVVid!;
      await videoBili33PutDownPhone.play().catch(() => {});
      await new Promise((r) => requestAnimationFrame(r));
      videoBili33PutDownPhone.currentTime = 0;
      this.currentTVVid = videoBili33PutDownPhone;

      prevVid.pause();
      prevVid.currentTime = 0;

      if (this.isExtendMode) {
        try {
          audioPutDownPhone.play();
        } catch (_) {}
      }
      this.meshTV!.material.map = this.videoTextures.get(this.currentTVVid)!;
    };

    // L. Exit trigger handlers
    const triggerExit = () => {
      if (this.phoneCallState === 2) {
        this.boundPutDown?.();
      }
      this.collapseBanner();
    };

    this.closeButton.addEventListener("click", triggerExit);

    // M. Visibility change listener (pause/resume when tab switches)
    this.boundVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        this.currentTVVid?.pause();
        this.bgMusic?.pause();
      } else {
        this.currentTVVid?.play().catch(() => {});
        if (this.isExtendMode && !this.isMutedLocally) {
          try {
            this.bgMusic?.play();
          } catch (_) {}
        }
      }
    };
    document.addEventListener("visibilitychange", this.boundVisibilityChange);

    // N. Hidden click hotspot for triggering expand
    this.clickHotspot = document.createElement("div");
    this.clickHotspot.className = "summer-banner-click-hotspot";
    Object.assign(this.clickHotspot.style, {
      position: "absolute",
      top: "36%",
      left: "15%",
      width: "85%",
      height: "64%",
      cursor: "pointer",
      zIndex: "10",
    });
    context.bannerEl.appendChild(this.clickHotspot);

    this.clickHotspot.addEventListener("click", (evt) => {
      if (this.isExpanded) return;
      const path = evt.composedPath();
      const isIgnored = path.some((el) => {
        const classList = (el as HTMLElement).classList;
        return (
          classList?.contains("summer-banner") ||
          classList?.contains("inner-logo")
        );
      });
      if (isIgnored) return;

      this.expandBanner();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 3. expandBanner — layout transition + WebGL activation
  // ════════════════════════════════════════════════════════════════

  private async expandBanner(): Promise<void> {
    if (!this.context || !this.summerBannerContainer || !this.clickHotspot)
      return;

    this.isExpanded = true;

    // Resume AudioContext and retry background videos (user click grants activation)
    await this.resumeAudioContext();
    this.safePlayAll(this.backgroundVideos);

    // Dispatch expand event
    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: true }),
    );

    // Hide default banner UI
    const { innerEl, logoEl } = queryBannerUiElements(this.context.bannerEl);
    if (innerEl) innerEl.style.setProperty("display", "none");
    if (logoEl) logoEl.style.setProperty("display", "none");
    this.clickHotspot.style.setProperty("display", "none");

    // Animate header height + WebGL position
    const targetHeight = this.context.bannerEl.clientWidth * (3 / 16);
    Object.assign(this.context.bannerEl.style, {
      height: `${targetHeight}px`,
      maxHeight: `${targetHeight}px`,
    });
    this.summerBannerContainer.style.top = "50%";

    // Activate WebGL interactive UI after CSS transition (600ms)
    this.clearExtendTimer();
    this.extendTimer = setTimeout(() => {
      this.toggleExtend(true);
    }, 600);
  }

  // ════════════════════════════════════════════════════════════════
  // 4. collapseBanner — animated restoration (user-triggered exit)
  // ════════════════════════════════════════════════════════════════

  private collapseBanner(): void {
    if (!this.context || !this.summerBannerContainer || !this.clickHotspot)
      return;

    this.isExpanded = false;

    // Dispatch collapse event
    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: false }),
    );

    this.toggleExtend(false);

    // Restore header height and WebGL position (top → 80%, matches original)
    Object.assign(this.context.bannerEl.style, {
      height: `${this.originalHeight}px`,
    });
    this.summerBannerContainer.style.top = "80%";

    // Restore hidden UI after CSS transition (600ms)
    this.clearExtendTimer();
    this.extendTimer = setTimeout(() => {
      const { innerEl, logoEl } = queryBannerUiElements(this.context!.bannerEl);
      if (innerEl) innerEl.style.removeProperty("display");
      if (logoEl) {
        logoEl.style.setProperty("display", "inline-block");
        logoEl.style.setProperty("z-index", "3");
      }
      this.clickHotspot?.style.removeProperty("display");
      this.context!.bannerEl.style.maxHeight = "240px";
    }, 600);
  }

  // ════════════════════════════════════════════════════════════════
  // 5. toggleExtend — WebGL interactive UI visibility + bg music
  // ════════════════════════════════════════════════════════════════

  private toggleExtend(show: boolean): void {
    this.isExtendMode = show;
    const targets = [this.gameArea, this.phoneArea, this.closeButton];

    if (show) {
      targets.forEach((el) => {
        el?.style.removeProperty("display");
      });
      if (this.closeButton) this.closeButton.style.display = "flex";
      if (!this.isMutedLocally && this.bgMusic) {
        try {
          this.bgMusic.play();
        } catch (_) {}
      }
    } else {
      targets.forEach((el) => {
        el?.style.setProperty("display", "none");
      });
      this.bgMusic?.pause();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 6. dispose — full cleanup (synchronous, no animation)
  // ════════════════════════════════════════════════════════════════

  dispose(): void {
    // ── Phase 1: clear all timers to prevent async callbacks after DOM removal ──
    this.clearExtendTimer();
    if (this.resizeRafId != null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }

    // ── Phase 2: synchronously restore banner UI (no animation) ──
    if (this.context) {
      const { innerEl, logoEl } = queryBannerUiElements(this.context.bannerEl);
      if (innerEl) innerEl.style.removeProperty("display");
      if (logoEl) {
        logoEl.style.setProperty("display", "inline-block");
        logoEl.style.removeProperty("z-index");
      }
    }

    if (this.isExpanded) {
      this.isExpanded = false;
      this.toggleExtend(false);

      if (this.context) {
        this.context.bannerEl.style.removeProperty("height");
        this.context.bannerEl.style.removeProperty("maxHeight");
        this.context.bannerEl.style.removeProperty("overflow");
        this.context.bannerEl.style.removeProperty("transition");
      }

      if (this.clickHotspot) {
        this.clickHotspot.style.removeProperty("display");
      }

      if (this.summerBannerContainer) {
        this.summerBannerContainer.style.removeProperty("top");
      }
    } else {
      // Clean up header styles even if not expanded
      if (this.context) {
        this.context.bannerEl.style.removeProperty("overflow");
        this.context.bannerEl.style.removeProperty("transition");
      }
    }

    // ── Phase 3: remove event listeners ──
    if (this.boundResize) {
      window.removeEventListener("resize", this.boundResize);
      this.boundResize = null;
    }
    if (this.boundVisibilityChange) {
      document.removeEventListener(
        "visibilitychange",
        this.boundVisibilityChange,
      );
      this.boundVisibilityChange = null;
    }

    // ── Phase 4: cancel render loop & dispose Three.js ──
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.scene) {
      this.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => {
              mat.dispose();
            });
          } else {
            object.material.dispose();
          }
        }
      });
    }

    this.videoTextures.forEach((tex) => {
      tex.dispose();
    });
    this.videoTextures.clear();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }

    // ── Phase 5: stop and release audio ──
    this.audios.forEach((audio) => {
      try {
        if (audio.isPlaying) audio.stop();
      } catch (_err) {
        /* already stopped */
      }
    });
    this.audios = [];
    this.bgMusic = null;
    this.audioMap.clear();

    // ── Phase 6: pause and release video elements ──
    this.videos.forEach((vid) => {
      vid.pause();
      vid.removeAttribute("src");
      vid.load();
    });
    this.videos = [];
    this.backgroundVideos = [];

    // ── Phase 7: remove all owned DOM nodes ──
    if (this.summerBannerContainer) {
      this.summerBannerContainer.remove();
      this.summerBannerContainer = null;
    }
    if (this.clickHotspot) {
      this.clickHotspot.remove();
      this.clickHotspot = null;
    }
    if (this.closeButton) {
      this.closeButton.remove();
      this.closeButton = null;
    }
    if (this.closeIcon) {
      this.closeIcon.remove();
      this.closeIcon = null;
    }
    if (this.volStyleElement) {
      this.volStyleElement.remove();
      this.volStyleElement = null;
    }

    this.gameArea = null;
    this.phoneArea = null;
    this.phonePanel = null;

    // ── Phase 8: null out Three.js references ──
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.audioListener = null;
    this.meshBlink = null;
    this.currentTVVid = null;
    this.context = null;
  }

  // ════════════════════════════════════════════════════════════════
  // Private helpers
  // ════════════════════════════════════════════════════════════════

  private clearExtendTimer(): void {
    if (this.extendTimer != null) {
      clearTimeout(this.extendTimer);
      this.extendTimer = null;
    }
  }

  private async resumeAudioContext(): Promise<void> {
    if (
      this.audioListener &&
      this.audioListener.context.state === "suspended"
    ) {
      try {
        await this.audioListener.context.resume();
      } catch (_err) {
        // AudioContext resume may fail in some environments
      }
    }
  }

  private safePlayAll(videos: HTMLVideoElement[]): void {
    for (const vid of videos) {
      vid.play().catch((err) => {
        if (err.name !== "NotAllowedError") {
          console.warn("[SummerExtension] Video play failed:", err);
        }
      });
    }
  }
}
