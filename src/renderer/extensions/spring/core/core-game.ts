import Matter from "matter-js";
import {
  Background,
  LeavesEffect,
  WindsManager,
} from "../entities/effect-particles";
import {
  BirdsManager,
  CountDown,
  EndEffectNode,
} from "../entities/game-decorations";
import type { LuckyLeaf, NormalLeaf, TrapLeaf } from "../entities/leaves";
import { Player } from "../entities/player";
import { ShamrocksManager } from "../entities/shamrocks-manager";
import { Vec3 } from "../render/math";
import { Camera, SceneNode } from "../render/scene";
import { WebGLRenderer } from "../render/webgl-renderer";
import { createGameElements, type GameDomElements } from "../ui/dom-manager";
import { showGuide } from "../ui/guide-interactive";
import { AssetManager } from "./asset-manager";
import { GameConfig, physicsConfig } from "./game-config";
import { KeyboardInput, StateMachine, TimeManager } from "./game-runtime";
import { renderShareCard } from "./share-card";

interface SyncLeafPlatformMaskOptions {
  currentMask: number;
  playerVelocityY: number;
  playerBodyY: number;
  playerHeight: number;
  leafBodyY: number;
}

const syncLeafPlatformMask = ({
  currentMask,
  playerVelocityY,
  playerBodyY,
  playerHeight,
  leafBodyY,
}: SyncLeafPlatformMaskOptions): number => {
  if (playerVelocityY < 0.5 && playerBodyY - playerHeight / 2 > leafBodyY + 8) {
    return 5 | currentMask;
  }

  return ~(5 | ~currentMask);
};

type ListenerRef = Record<string, () => void>;

export class BannerGameSpring2022 {
  private banner: HTMLElement;
  private gameContainer: HTMLDivElement;
  private root: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private domElements: GameDomElements;
  private listeners: ListenerRef = {};

  private renderer: WebGLRenderer;
  private camera: Camera;
  private scene: SceneNode;
  private keyboardInput: KeyboardInput;

  private gameState = new StateMachine([
    "MainMenu",
    "InGame",
    "Paused",
    "EndPage",
  ]);
  private lockInput = false;
  private player: Player | null = null;
  private shamrocks: ShamrocksManager | null = null;
  private winds: WindsManager | null = null;
  private birds: BirdsManager | null = null;
  private endEffectNode: SceneNode | null = null;
  private countDown: CountDown | null = null;

  private lag = false;
  private lastT = 0;

  onExitRequested?: () => void;

  private cleanups: (() => void)[] = [];

  private syncLeafCollisionMasks(): void {
    if (!this.player || !this.shamrocks) return;

    const player = this.player;
    const shamrocks = this.shamrocks;

    shamrocks.all.forEach((leaf) => {
      const nl = leaf as NormalLeaf;
      const body = nl.leafBody;
      if (nl.leafDisableLock) return;

      body.collisionFilter.mask = syncLeafPlatformMask({
        currentMask: body.collisionFilter.mask ?? 0,
        playerVelocityY: player.body.velocity.y,
        playerBodyY: player.body.position.y,
        playerHeight: player.size.h,
        leafBodyY: body.position.y,
      });
    });
  }

  constructor(host: HTMLElement) {
    this.banner = host;

    this.domElements = createGameElements(host);
    this.gameContainer = this.domElements.bannerGame;
    this.root = this.domElements.root;
    this.canvas = this.domElements.canvas;

    this.renderer = new WebGLRenderer(this.canvas);
    this.camera = new Camera({
      position: [0, 0, 10],
      direction: [0, 0, -1],
      width: this.canvas.width,
      height: this.canvas.height,
      orthographic: true,
    });

    this.scene = new SceneNode();

    if (physicsConfig.engine) {
      Matter.Engine.clear(physicsConfig.engine);
    }
    physicsConfig.engine = Matter.Engine.create();
    physicsConfig.engine.gravity.y = -1.25;

    this.keyboardInput = new KeyboardInput(this.gameContainer);
  }

  async init(): Promise<void> {
    await AssetManager.load();

    const playerInst = new Player();
    const shamrocksInst = new ShamrocksManager();
    const windsInst = new WindsManager();
    this.player = playerInst;
    this.shamrocks = shamrocksInst;
    this.winds = windsInst;
    this.birds = new BirdsManager();
    this.countDown = new CountDown();

    this.scene.addChild(new Background());
    this.scene.addChild(this.birds);
    this.scene.addChild(shamrocksInst);
    this.scene.addChild(this.countDown);
    this.scene.addChild(playerInst);
    this.scene.addChild(new LeavesEffect());
    this.scene.addChild(windsInst);

    this.domElements.restartEl.onclick = () => {
      this.lastT = performance.now();
      this.start();
    };

    this.domElements.closeEl.onclick = () => {
      this.lastT = performance.now();
      this.onExitRequested?.();
    };

    this.domElements.shareEl.onclick = () => {
      this.lastT = performance.now();
      renderShareCard(GameConfig.score, this.domElements.scoreTextRef);
    };

    this.domElements.viewGuideEl.onclick = () => {
      this.lastT = performance.now();
      this.showGuide(true);
    };

    GameConfig.scoreEl = this.domElements.scoreEl;

    this.cleanups.push(
      this.keyboardInput.onKeyDown((event) => {
        this.lastT = performance.now();
        if (
          this.domElements.endCover.style.display !== "none" &&
          !this.lockInput &&
          event.key === "z"
        ) {
          this.start();
        }
      }),
    );

    this.registerGamingControls();
    this.registerStateMachineHooks();
    this.registerPhysicsCollisions();

    this.renderer.render(this.camera, this.scene);

    if (this.banner.children.length > 2) {
      this.banner.insertBefore(
        this.gameContainer,
        this.banner.lastElementChild,
      );
    } else {
      this.banner.appendChild(this.gameContainer);
    }

    this.listeners.blur = () => this.pause();
    this.listeners.focus = () => this.resume();
    this.listeners.visibilitychange = () => {
      if (document.visibilityState === "hidden") {
        this.pause();
      } else if (document.visibilityState === "visible") {
        this.resume();
      }
    };
    this.listeners.resize = () => {
      const bannerHeight = this.banner.clientWidth / (16 / 3);
      this.gameContainer.style.height = `${bannerHeight}px`;
      this.canvas.style.height = `${bannerHeight}px`;

      const scaleFactor = this.banner.clientWidth / 1920 || 1;
      this.domElements.endContainer.style.transform = `scale(${scaleFactor})`;
      const guideContainer = this.root.querySelector(".guide-container");
      if (guideContainer instanceof HTMLElement) {
        guideContainer.style.transform = `scale(${scaleFactor})`;
      }
    };
    this.listeners.beforeunload = () => {
      this.destroy();
    };

    this.gameContainer.addEventListener("blur", this.listeners.blur);
    this.gameContainer.addEventListener("focus", this.listeners.focus);
    window.addEventListener(
      "visibilitychange",
      this.listeners.visibilitychange,
    );
    window.addEventListener("resize", this.listeners.resize);
    window.addEventListener("beforeunload", this.listeners.beforeunload);
  }

  private registerGamingControls(): void {
    this.cleanups.push(
      this.keyboardInput.onKeyDown((event) => {
        if (TimeManager.time < 3000) return;
        if (!this.player || !this.shamrocks) return;

        const performJump = () => {
          const jumpActions: Record<string, () => void> = {
            Ground: () => {
              if (this.player!.lockGround) {
                const luckyLeaf = this.shamrocks!.luckies.find(
                  (leaf) =>
                    (leaf as LuckyLeaf).leafBody === this.player!.ground,
                ) as LuckyLeaf | undefined;
                luckyLeaf?.triggerEnd();

                this.player!.lockGround = false;
                Matter.Body.translate(this.player!.body, { x: 0, y: 4 });
                Matter.Body.setStatic(this.player!.body, false);
                this.player!.body.collisionFilter.mask = 2;
                Matter.Body.setVelocity(this.player!.body, { x: 0, y: 0 });
              }
              Matter.Body.setVelocity(this.player!.body, {
                x: this.player!.body.velocity.x,
                y: 12,
              });
              this.player!.groundJumpTime = GameConfig.duration;
            },
            Climb: () => {
              if (this.player!.lockStem) {
                const luckyLeaf = this.shamrocks!.luckies.find(
                  (leaf) => (leaf as LuckyLeaf).stemBody === this.player!.stem,
                ) as LuckyLeaf | undefined;
                luckyLeaf?.triggerEnd();

                this.player!.lockStem = false;
                this.player!.body.collisionFilter.mask = 2;
              }
              this.player!.state.changeState("Air");
              Matter.Body.setVelocity(this.player!.body, {
                x: this.player!.body.velocity.x,
                y: 12,
              });
              this.player!.groundJumpTime = GameConfig.duration;
            },
          };

          jumpActions[this.player!.state.currentState]?.();
        };

        const performClimb = () => {
          const climbProcess = () => {
            if (!this.player!.lockGround && !this.player!.lockStem) {
              if (this.player!.stem) {
                if (this.player!.stem.label === "stem_trap") {
                  const trapLeaf = this.shamrocks!.traps.find(
                    (leaf) => (leaf as TrapLeaf).stemBody === this.player!.stem,
                  ) as TrapLeaf | undefined;
                  trapLeaf?.triggerTrap();
                } else if (this.player!.stem.label === "stem_lucky") {
                  const luckyLeaf = this.shamrocks!.luckies.find(
                    (leaf) =>
                      (leaf as LuckyLeaf).stemBody === this.player!.stem,
                  ) as LuckyLeaf | undefined;
                  if (luckyLeaf?.state.currentState === "idle") {
                    luckyLeaf.triggerFly();

                    this.player!.lockStem = true;
                    this.player!.lockStemEndAt =
                      GameConfig.duration + GameConfig.luckyDuration;
                    this.player!.body.collisionFilter.mask = 0;
                  }
                }

                this.player!.state.changeState("Climb");
              } else {
                this.player!.tryClimbTime = GameConfig.duration;
                this.player!.animationState.changeState(
                  this.player!.state.currentState === "Ground"
                    ? "try_climb"
                    : "jump_try_climb",
                );
              }
            }
          };

          const climbAllowedStates: Record<string, () => void> = {
            Ground: climbProcess,
            Air: climbProcess,
          };
          climbAllowedStates[this.player!.state.currentState]?.();
        };

        const performFallThrough = () => {
          if (!this.shamrocks) return;
          const currentLeaf = this.shamrocks.all.find(
            (leaf) => (leaf as NormalLeaf).leafBody === this.player!.ground,
          ) as NormalLeaf | undefined;
          if (currentLeaf) {
            currentLeaf.leafDisableLockTime = GameConfig.duration;
            currentLeaf.leafDisableLock = true;
            const leafMask = currentLeaf.leafBody.collisionFilter.mask ?? 0;
            currentLeaf.leafBody.collisionFilter.mask = ~(5 | ~leafMask);
          }
        };

        const inputActions: Record<string, () => void> = {
          " ": performJump,
          c: performJump,
          ArrowUp: performJump,
          w: performJump,
          j: performJump,
          z: performClimb,
          k: performClimb,
          ArrowDown: performFallThrough,
          s: performFallThrough,
        };

        inputActions[event.key]?.();
      }),
    );

    this.cleanups.push(
      this.keyboardInput.onKeyUp((event) => {
        const keyUpActions: Record<string, () => void> = {
          " ": () => {
            if (this.player?.groundJumpTime) {
              this.player.groundJumpTime = NaN;
            }
          },
        };
        keyUpActions[event.key]?.();
      }),
    );
  }

  private registerStateMachineHooks(): void {
    this.gameState.addHook("EndPage", "enter", () => {
      this.lastT = performance.now();

      this.domElements.scoreEl.style.display = "none";
      this.lockInput = true;

      if (this.player) {
        const playerPos = this.player.position;
        const effect = new EndEffectNode({
          center: [playerPos[0], playerPos[1]],
          duration: 1000,
        });

        this.endEffectNode = new SceneNode(effect);
        this.endEffectNode.position = Vec3.fromValues(0, 0, 1);
        this.scene.addChild(this.endEffectNode);
      }

      setTimeout(() => {
        this.domElements.endCover.style.display = "block";
        this.domElements.updateEndScore(GameConfig.score);

        setTimeout(() => {
          this.domElements.endCover.style.opacity = "1";
        }, 50);

        setTimeout(() => {
          this.scene.children.pop()?.destroy();
          this.endEffectNode = null;
          this.lockInput = false;
        }, 550);
      }, 1000);
    });

    this.gameState.addHook("EndPage", "leave", () => {
      this.domElements.endCover.style.display = "none";
      this.domElements.endCover.style.opacity = "0";
    });

    this.gameState.addHook("InGame", "enter", () => {
      TimeManager.lastT = performance.now();
      cancelAnimationFrame(TimeManager.raf);
      TimeManager.raf = requestAnimationFrame(this.loop.bind(this));
    });

    this.gameState.addHook("InGame", "leave", () => {});

    this.gameState.addHook("InGame", "update", () => {
      if (!this.player || !this.shamrocks) return;

      GameConfig.duration += TimeManager.deltaT;
      if (Math.floor(GameConfig.duration / 1000) > GameConfig.score) {
        GameConfig.score = Math.floor(GameConfig.duration / 1000);
      }

      GameConfig.updateStage();
      GameConfig.translateSpeed = GameConfig.baseSpeed + GameConfig.bonusSpeed;

      if (this.player.position[1] > 130) {
        this.camera.position = Vec3.fromValues(
          0,
          this.player.position[1] - 130,
          this.camera.position[2],
        );
      } else if (this.camera.position[1] > 0) {
        this.camera.position = Vec3.fromValues(0, 0, this.camera.position[2]);
      }

      Matter.Engine.update(physicsConfig.engine!, TimeManager.deltaT);

      const goLeft =
        (this.keyboardInput.keys.ArrowLeft || this.keyboardInput.keys.a) &&
        !(this.keyboardInput.keys.ArrowRight || this.keyboardInput.keys.d);
      const goRight =
        (this.keyboardInput.keys.ArrowRight || this.keyboardInput.keys.d) &&
        !(this.keyboardInput.keys.ArrowLeft || this.keyboardInput.keys.a);

      if (goLeft && this.player.facingState.currentState !== "left") {
        this.player.facingState.changeState("left");
      } else if (goRight && this.player.facingState.currentState !== "right") {
        this.player.facingState.changeState("right");
      }

      const applyWalkForce = () => {
        if (goRight && this.player!.body.velocity.x < 5.5) {
          Matter.Body.setVelocity(this.player!.body, {
            x: Math.min(5.5, this.player!.body.velocity.x + 1),
            y: this.player!.body.velocity.y,
          });
        } else if (goLeft && this.player!.body.velocity.x > -3) {
          Matter.Body.setVelocity(this.player!.body, {
            x: Math.max(-3, this.player!.body.velocity.x - 0.5),
            y: this.player!.body.velocity.y,
          });
        }
      };

      if (
        this.player.lockGround ||
        this.player.state.currentState === "Air" ||
        this.player.state.currentState === "Ground"
      ) {
        if (!this.player.lockGround) {
          applyWalkForce();
        }
      }

      this.syncLeafCollisionMasks();

      Matter.Composite.translate(physicsConfig.engine!.world, {
        x: -0.18 * TimeManager.deltaT,
        y: 0,
      });
    });

    this.gameState.addCondition("InGame", "EndPage", () => {
      if (!this.player) return false;
      const playerPos = this.player.position;
      return playerPos[0] < -980 || playerPos[1] < -220;
    });
  }

  private registerPhysicsCollisions(): void {
    Matter.Events.on(physicsConfig.engine!, "collisionStart", (event) => {
      if (!this.player || !this.shamrocks) return;
      for (const pair of event.pairs) {
        if (
          !this.player.lockGround &&
          pair.bodyA.label === "groundSensor" &&
          pair.bodyB.label.startsWith("leaf")
        ) {
          this.player.ground = pair.bodyB;

          if (pair.bodyB.label === "leaf_trap") {
            const trap = this.shamrocks.traps.find(
              (t) => (t as TrapLeaf).leafBody === pair.bodyB,
            ) as TrapLeaf | undefined;
            trap?.triggerTrap();
          } else if (pair.bodyB.label === "leaf_lucky") {
            const lucky = this.shamrocks.luckies.find(
              (l) => (l as LuckyLeaf).leafBody === pair.bodyB,
            ) as LuckyLeaf | undefined;
            if (lucky?.state.currentState === "idle") {
              lucky.triggerFly();

              this.player.lockGround = true;
              this.player.lockGroundEndAt =
                GameConfig.duration + GameConfig.luckyDuration;
              Matter.Body.setStatic(this.player.body, true);
              this.player.body.collisionFilter.mask = 0;
            }
          }
        }

        if (
          !this.player.lockStem &&
          pair.bodyA.label === "player" &&
          pair.bodyB.label.startsWith("stem") &&
          this.player.state.currentState !== "Climb"
        ) {
          this.player.stem = pair.bodyB;
        }
      }
    });

    Matter.Events.on(physicsConfig.engine!, "collisionEnd", (event) => {
      if (!this.player) return;
      for (const pair of event.pairs) {
        if (
          !this.player.lockGround &&
          pair.bodyA.label === "groundSensor" &&
          pair.bodyB.label.startsWith("leaf") &&
          this.player.ground === pair.bodyB
        ) {
          this.player.ground = null;
        }

        if (
          !this.player.lockStem &&
          pair.bodyA.label === "player" &&
          pair.bodyB.label.startsWith("stem") &&
          this.player.stem === pair.bodyB
        ) {
          this.player.stem = null;
        }
      }
    });
  }

  private gameLoop(): void {
    const gl = this.renderer.gl;
    gl.clearColor(
      0.6235294117647059,
      0.8823529411764706,
      0.8627450980392157,
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (TimeManager.time > 3000) {
      this.gameState.update();
      this.scene.updateRecursive();
    }
    this.renderer.render(this.camera, this.scene);
  }

  private loop(timestamp: number): void {
    TimeManager._deltaT = timestamp - TimeManager._lastT;
    TimeManager.deltaT = 1000 / 60;
    TimeManager.lastT = TimeManager.time;
    TimeManager.time = TimeManager.lastT + TimeManager.deltaT;
    TimeManager.raf = requestAnimationFrame(this.loop.bind(this));

    if (TimeManager._deltaT >= TimeManager._interval) {
      TimeManager._lastT = timestamp;

      if (this.gameState.currentState === "InGame") {
        this.gameLoop();

        if (!this.lag && timestamp - this.lastT > 100) {
          this.lag = true;
        }
      }

      if (this.gameState.currentState === "EndPage" && this.endEffectNode) {
        this.renderer.render(this.camera, this.scene);
      }

      this.lastT = timestamp;
    }
  }

  start(): void {
    if (
      this.gameState.currentState === "MainMenu" ||
      this.gameState.currentState === "EndPage"
    ) {
      this.domElements.scoreEl.style.display = "flex";
      this.reset();
      this.gameState.changeState("InGame");
    }
  }

  pause(): void {
    if (this.gameState.currentState === "InGame") {
      this.gameState.changeState("Paused");
    }
  }

  resume(): void {
    if (this.gameState.currentState === "Paused") {
      this.lastT = performance.now();
      this.gameState.changeState("InGame");
    }
  }

  showGuide(isReviewMode = false): void {
    const scaleFactor = this.banner.clientWidth / 1920 || 1;
    showGuide(
      this.root,
      scaleFactor,
      () => {
        this.start();
      },
      isReviewMode,
    );
  }

  renderFirstFrame(): void {
    this.reset();
    this.gameLoop();
  }

  focus(): void {
    this.gameContainer.focus();
  }

  private reset(): void {
    GameConfig.reset();
    TimeManager.reset();

    this.shamrocks?.reset();
    this.winds?.reset();
    this.birds?.reset();
    this.countDown?.reset();

    this.lastT = performance.now();
    this.lag = false;

    if (this.player && this.shamrocks) {
      const firstLeaf = this.shamrocks.all[0] as NormalLeaf | undefined;
      if (firstLeaf) {
        const leafPos = firstLeaf.position;
        this.player.stem = firstLeaf.stemBody;

        if (!this.player.body.isStatic) {
          Matter.Body.setStatic(this.player.body, true);
        }
        Matter.Body.setVelocity(this.player.body, { x: 0, y: 0 });

        this.player.position = Vec3.fromValues(
          leafPos[0] + firstLeaf.stemOffset[0] - 5,
          leafPos[1] + firstLeaf.stemOffset[1] - 20,
          this.player.zIndex,
        );

        this.player.state.currentState = "Climb";
        this.player.animationState.changeState("climb");

        setTimeout(() => {
          if (this.player?.sprite) {
            this.player.sprite.lastChange = 3000;
          }
        }, 34);
      }

      Matter.Body.setVelocity(this.player.body, { x: 0, y: 0 });
      Matter.Engine.update(physicsConfig.engine!, 0);
    }

    // 手动执行一次矩阵更新。确保前3秒场景静止期间，所有叶子和玩家都拥有计算好的初始 modelMatrix，正确渲染
    this.scene.updateRecursive();
  }

  showEndPage(): void {
    this.gameState.changeState("EndPage");
  }

  destroy(): void {
    try {
      cancelAnimationFrame(TimeManager.raf);

      this.gameContainer.removeEventListener("blur", this.listeners.blur);
      this.gameContainer.removeEventListener("focus", this.listeners.focus);
      window.removeEventListener(
        "visibilitychange",
        this.listeners.visibilitychange,
      );
      window.removeEventListener("beforeunload", this.listeners.beforeunload);
      window.removeEventListener("resize", this.listeners.resize);

      for (const cleanup of this.cleanups) {
        cleanup();
      }
      this.cleanups = [];

      const gameDom = this.banner?.querySelector(".banner-game");
      if (gameDom) {
        this.banner?.removeChild(gameDom);
      }

      this.scene.destroy();
      this.renderer.initSet.clear();
      if (physicsConfig.engine) {
        Matter.Engine.clear(physicsConfig.engine);
      }
    } catch {}
  }
}
