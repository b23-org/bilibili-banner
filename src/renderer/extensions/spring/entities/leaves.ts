import Matter from "matter-js";
import { AssetManager } from "../core/asset-manager";
import { GameConfig, physicsConfig } from "../core/game-config";
import { StateMachine, TimeManager } from "../core/game-runtime";
import { Vec3 } from "../render/math";
import { SceneNode } from "../render/scene";
import type { AtlasData } from "../render/webgl-renderer";
import { AnimatedSprite } from "../render/webgl-renderer";

const LEAF_SIZES: [number, number][] = [
  [92, 20],
  [102, 20],
  [122, 20],
  [94, 20],
];

const LEAF_OFFSETS: [number, number][] = [
  [0, 26],
  [0, 34],
  [0, 32],
  [0, 30],
];

const STEM_OFFSETS: [number, number][] = [
  [-5, -46],
  [-8, -48],
  [-16, -50],
  [-14, -46],
];

interface NormalLeafOptions {
  texture: HTMLImageElement;
  atlas: AtlasData;
  stemOffset: [number, number];
  leafSize: [number, number];
  leafOffset: [number, number];
  startFrame?: number;
}

export class NormalLeaf extends SceneNode {
  leafBody!: Matter.Body;
  stemBody!: Matter.Body;
  leafDisableLock = false;
  leafDisableLockTime = NaN;
  stemOffset: [number, number];
  leafSize: [number, number];
  leafOffset: [number, number];

  constructor(options: NormalLeafOptions) {
    super();
    this.stemOffset = options.stemOffset;
    this.leafSize = options.leafSize;
    this.leafOffset = options.leafOffset;

    const spriteNode = new AnimatedSprite({
      texture: options.texture,
      atlas: options.atlas,
    });
    spriteNode.changeAnimation("idle", options.startFrame ?? 0);

    setTimeout(() => {
      spriteNode.lastChange = 3000;
    }, 34);

    this.object = spriteNode;
    this.scaling = Vec3.fromValues(2, 2, 1);

    this.leafBody = Matter.Bodies.rectangle(
      0,
      0,
      this.leafSize[0],
      this.leafSize[1],
      {
        isStatic: true,
        friction: 0.5,
        frictionAir: 0.6,
        label: "leaf",
        collisionFilter: { category: 0x0002, mask: 15 },
      },
    );

    this.stemBody = Matter.Bodies.circle(0, 0, 30, {
      isSensor: true,
      inertia: Infinity,
      label: "stem",
      collisionFilter: { category: 0x0002, mask: 1 },
    });

    Matter.Composite.add(physicsConfig.engine!.world, [
      this.leafBody,
      this.stemBody,
    ]);
  }

  override get position() {
    return super.position;
  }

  override set position(value) {
    super.position = value;
    Matter.Body.setPosition(this.leafBody, {
      x: value[0] + this.leafOffset[0],
      y: value[1] + this.leafOffset[1],
    });
  }

  setLeafPosition(x: number, y: number, z: number) {
    this.position = Vec3.fromValues(x, y, z);
  }

  syncFromPhysics() {
    const bodyPos = this.leafBody.position;
    const renderPos = Vec3.fromValues(
      Math.round(bodyPos.x - this.leafOffset[0]),
      Math.round(bodyPos.y - this.leafOffset[1]),
      this.position[2],
    );
    super.position = renderPos;

    Matter.Body.setPosition(this.stemBody, {
      x: renderPos[0] + this.stemOffset[0],
      y: renderPos[1] + this.stemOffset[1],
    });
    Matter.Body.setVelocity(this.stemBody, { x: 0, y: 0 });
  }

  override update() {
    if (GameConfig.duration - this.leafDisableLockTime > 500) {
      this.leafDisableLock = false;
    }
    this.syncFromPhysics();
  }

  override destroy() {
    super.destroy();
    if (physicsConfig.engine) {
      Matter.Composite.remove(physicsConfig.engine.world, this.leafBody);
      Matter.Composite.remove(physicsConfig.engine.world, this.stemBody);
    }
  }
}

const TRAP_LEAF_SIZE: [number, number] = [92, 20];
const TRAP_LEAF_OFFSET: [number, number] = [0, 26];
const TRAP_STEM_OFFSET: [number, number] = [-5, -46];

interface TrapLeafOptions {
  texture: HTMLImageElement;
  atlas: AtlasData;
}

export class TrapLeaf extends SceneNode {
  leafBody!: Matter.Body;
  stemBody!: Matter.Body;
  disabled = false;
  disableLeafAt = NaN;
  disableStemAt = NaN;
  disappearAt = NaN;
  leafDisableLock = false;
  leafDisableLockTime = NaN;

  constructor(options: TrapLeafOptions) {
    super();

    const spriteNode = new AnimatedSprite({
      texture: options.texture,
      atlas: options.atlas,
    });
    this.object = spriteNode;
    this.scaling = Vec3.fromValues(2, 2, 1);
    spriteNode.changeAnimation("idle");

    this.leafBody = Matter.Bodies.rectangle(
      0,
      0,
      TRAP_LEAF_SIZE[0],
      TRAP_LEAF_SIZE[1],
      {
        isStatic: true,
        friction: 0.5,
        frictionAir: 0.6,
        label: "leaf_trap",
        collisionFilter: { category: 0x0002, mask: 15 },
      },
    );

    this.stemBody = Matter.Bodies.circle(0, 0, 30, {
      isSensor: true,
      inertia: Infinity,
      label: "stem_trap",
      collisionFilter: { category: 0x0002, mask: 1 },
    });

    Matter.Composite.add(physicsConfig.engine!.world, [
      this.leafBody,
      this.stemBody,
    ]);
  }

  override get position() {
    return super.position;
  }

  override set position(value) {
    super.position = value;
    if (this.leafBody) {
      Matter.Body.setPosition(this.leafBody, {
        x: value[0] + TRAP_LEAF_OFFSET[0],
        y: value[1] + TRAP_LEAF_OFFSET[1],
      });
    }
  }

  setLeafPosition(x: number, y: number, z: number) {
    this.position = Vec3.fromValues(x, y, z);
  }

  override update() {
    if (!this.leafBody || !this.stemBody) return;

    const bodyPos = this.leafBody.position;
    const renderPos = Vec3.fromValues(
      Math.round(bodyPos.x - TRAP_LEAF_OFFSET[0]),
      Math.round(bodyPos.y - TRAP_LEAF_OFFSET[1]),
      this.position[2],
    );
    super.position = renderPos;

    if (this.disabled) {
      if (this.object) {
        Matter.Body.setPosition(this.stemBody, {
          x: this.leafBody.position.x,
          y: this.stemBody.position.y - 1,
        });
        Matter.Body.setVelocity(this.stemBody, { x: 0, y: 0 });
      }

      if (this.disableLeafAt < GameConfig.duration) {
        this.leafBody.collisionFilter.mask = 0;
      }
      if (this.disableStemAt < GameConfig.duration) {
        this.stemBody.collisionFilter.mask = 0;
      }
      if (this.disappearAt < GameConfig.duration && this.object) {
        this.destroy();
        this.object = undefined;
      }
    } else {
      Matter.Body.setPosition(this.stemBody, {
        x: renderPos[0] + TRAP_STEM_OFFSET[0],
        y: renderPos[1] + TRAP_STEM_OFFSET[1],
      });
      Matter.Body.setVelocity(this.stemBody, { x: 0, y: 0 });
    }
  }

  triggerTrap() {
    const sprite = this.object as AnimatedSprite | undefined;
    this.disableLeafAt = GameConfig.duration + 200;
    this.disableStemAt = GameConfig.duration + 300;
    this.disappearAt =
      GameConfig.duration + (sprite?.animations.vanish?.duration ?? 0) - 20;
    sprite?.changeAnimation("vanish");
    this.leafDisableLock = true;
    this.disabled = true;
  }

  override destroy() {
    super.destroy();
    if (physicsConfig.engine) {
      Matter.Composite.remove(physicsConfig.engine.world, this.leafBody);
      Matter.Composite.remove(physicsConfig.engine.world, this.stemBody);
    }
  }
}

const LUCKY_LEAF_SIZE: [number, number] = [92, 20];
const LUCKY_LEAF_OFFSET: [number, number] = [0, 26];
const LUCKY_STEM_OFFSET: [number, number] = [-8, -46];

interface LuckyLeafOptions {
  texture: HTMLImageElement;
  atlas: AtlasData;
}

export class LuckyLeaf extends SceneNode {
  leafBody!: Matter.Body;
  stemBody!: Matter.Body;
  leafDisableLock = false;
  leafDisableLockTime = NaN;
  state = new StateMachine(["idle", "entering", "blowing", "leaving"]);
  bird = new SceneNode();
  birdSprite!: AnimatedSprite;
  endFlyAt = NaN;
  intoDizzyAt = NaN;
  adjectiveLeaving = false;

  constructor(options: LuckyLeafOptions) {
    super();

    const spriteNode = new AnimatedSprite({
      texture: options.texture,
      atlas: options.atlas,
    });
    this.object = spriteNode;
    this.scaling = Vec3.fromValues(2, 2, 1);
    spriteNode.changeAnimation("idle");

    this.leafBody = Matter.Bodies.rectangle(
      0,
      0,
      LUCKY_LEAF_SIZE[0],
      LUCKY_LEAF_SIZE[1],
      {
        isStatic: true,
        friction: 0.5,
        frictionAir: 0.6,
        label: "leaf_lucky",
        collisionFilter: { category: 0x0002, mask: 15 },
      },
    );

    this.stemBody = Matter.Bodies.circle(0, 0, 30, {
      isSensor: true,
      inertia: Infinity,
      label: "stem_lucky",
      collisionFilter: { category: 0x0002, mask: 1 },
    });

    Matter.Composite.add(physicsConfig.engine!.world, [
      this.leafBody,
      this.stemBody,
    ]);

    const birdTexture = AssetManager.get<HTMLImageElement>("sprite33");
    const birdAtlas = AssetManager.get<AtlasData>("sprite33Atlas");
    this.birdSprite = new AnimatedSprite({
      texture: birdTexture,
      atlas: birdAtlas,
    });
    this.birdSprite.changeAnimation("fly");

    this.bird.position = Vec3.fromValues(
      this.position[1] - 200 - 80,
      this.position[1] + 200,
      0,
    );
    this.bird.object = this.birdSprite;

    let relativeSpeed = 0;

    this.state.addHook("entering", "enter", () => {
      this.addChild(this.bird);
      this.position = Vec3.fromValues(this.position[0], this.position[1], -20);
      relativeSpeed = 0.18 - GameConfig.translateSpeed;
    });

    this.state.addHook("entering", "update", () => {
      this.bird.translate([4, -4, 0]);
      Matter.Body.translate(this.leafBody, {
        x: relativeSpeed * TimeManager.deltaT,
        y: 0,
      });
    });

    this.state.addHook("blowing", "enter", () => {
      GameConfig.bonusSpeed = -0.12;
      relativeSpeed = 0.18 - (GameConfig.baseSpeed + GameConfig.bonusSpeed);

      if (this.position[0] < 300) {
        relativeSpeed += (300 - this.position[0]) / GameConfig.luckyDuration;
      }
      this.birdSprite.changeAnimation("blow");
    });

    this.state.addHook("blowing", "update", () => {
      Matter.Body.translate(this.leafBody, {
        x: relativeSpeed * TimeManager.deltaT,
        y: 0,
      });
    });

    this.state.addHook("leaving", "enter", () => {
      GameConfig.bonusSpeed = 0;
      if (this.adjectiveLeaving) {
        this.birdSprite.changeAnimation("fly");
      } else {
        this.birdSprite.changeAnimation("into_dizzy");
        this.intoDizzyAt =
          GameConfig.duration + this.birdSprite.animations.into_dizzy.duration;
      }
    });

    this.state.addHook("leaving", "update", () => {
      if (
        this.birdSprite.currentAnimation === "dizzy" ||
        this.adjectiveLeaving
      ) {
        this.bird.translate([-3, 3, 0]);
      } else if (GameConfig.duration > this.intoDizzyAt) {
        this.birdSprite.changeAnimation("dizzy");
      }
    });

    this.state.addCondition("entering", "blowing", () => {
      return this.bird.position[1] < 1;
    });
    this.state.addCondition("blowing", "leaving", () => {
      return GameConfig.duration > this.endFlyAt;
    });
  }

  override get position() {
    return super.position;
  }

  override set position(value) {
    super.position = value;
    if (this.leafBody) {
      Matter.Body.setPosition(this.leafBody, {
        x: value[0] + LUCKY_LEAF_OFFSET[0],
        y: value[1] + LUCKY_LEAF_OFFSET[1],
      });
    }
  }

  setLeafPosition(x: number, y: number, z: number) {
    this.position = Vec3.fromValues(x, y, z);
  }

  override update() {
    if (GameConfig.duration - this.leafDisableLockTime > 500) {
      this.leafDisableLock = false;
    }

    this.state.update();

    const bodyPos = this.leafBody.position;
    const renderPos = Vec3.fromValues(
      Math.round(bodyPos.x - LUCKY_LEAF_OFFSET[0]),
      Math.round(bodyPos.y - LUCKY_LEAF_OFFSET[1]),
      this.position[2],
    );
    super.position = renderPos;

    Matter.Body.setPosition(this.stemBody, {
      x: renderPos[0] + LUCKY_STEM_OFFSET[0],
      y: renderPos[1] + LUCKY_STEM_OFFSET[1],
    });
    Matter.Body.setVelocity(this.stemBody, { x: 0, y: 0 });
  }

  triggerFly() {
    this.endFlyAt = GameConfig.duration + GameConfig.luckyDuration;
    this.state.changeState("entering");
  }

  triggerEnd() {
    this.endFlyAt = NaN;
    this.adjectiveLeaving = true;
    this.state.changeState("leaving");
  }

  override destroy() {
    super.destroy();
    if (physicsConfig.engine) {
      Matter.Composite.remove(physicsConfig.engine.world, this.leafBody);
      Matter.Composite.remove(physicsConfig.engine.world, this.stemBody);
    }
  }
}

export { LEAF_OFFSETS, LEAF_SIZES, STEM_OFFSETS };
