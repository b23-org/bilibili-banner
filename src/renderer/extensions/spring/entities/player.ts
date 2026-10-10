import Matter from "matter-js";
import { AssetManager } from "../core/asset-manager";
import { GameConfig, physicsConfig } from "../core/game-config";
import { StateMachine, TimeManager } from "../core/game-runtime";
import { Vec3 } from "../render/math";
import { SceneNode } from "../render/scene";
import type { AtlasData } from "../render/webgl-renderer";
import { AnimatedSprite } from "../render/webgl-renderer";

const PLAYER_SIZE = { w: 52, h: 78 };
const SENSOR_SIZE = { w: PLAYER_SIZE.w - 2, h: PLAYER_SIZE.h / 2 };
const SENSOR_OFFSET_Y = -PLAYER_SIZE.h / 4 - 5;

const animationStates = [
  "idle",
  "run",
  "jump",
  "fall",
  "into_climb",
  "climb",
  "try_climb",
  "jump_try_climb",
];

const physicsStates = ["Air", "Ground", "Climb", "Transition"];

export class Player extends SceneNode {
  body!: Matter.Body;
  groundSensor!: Matter.Body;
  state = new StateMachine(physicsStates);
  animationState = new StateMachine(animationStates);
  facingState = new StateMachine(["right", "left"]);
  sprite!: AnimatedSprite;
  ground: Matter.Body | null = null;
  stem: Matter.Body | null = null;
  size = PLAYER_SIZE;
  zIndex = 0;
  intoClimbTime = NaN;
  tryClimbTime = NaN;
  groundJumpTime = NaN;
  lockGround = false;
  lockGroundEndAt = NaN;
  lockStem = false;
  lockStemEndAt = NaN;

  constructor() {
    super();

    const imgTexture = AssetManager.get<HTMLImageElement>("sprite22");
    const jsonAtlas = AssetManager.get<AtlasData>("sprite22Atlas");

    this.sprite = new AnimatedSprite({
      texture: imgTexture,
      atlas: jsonAtlas,
    });
    this.object = this.sprite;

    this.translate([100, 50, 0]);
    this.scale([2, 2, 1]);

    this.body = Matter.Bodies.rectangle(0, 230, PLAYER_SIZE.w, PLAYER_SIZE.h, {
      inertia: Infinity,
      label: "player",
      collisionFilter: { category: 1, mask: 2 },
    });
    Matter.Body.setMass(this.body, 10);

    this.groundSensor = Matter.Bodies.rectangle(
      0,
      230 + SENSOR_OFFSET_Y,
      SENSOR_SIZE.w,
      SENSOR_SIZE.h,
      {
        isSensor: true,
        inertia: Infinity,
        label: "groundSensor",
        collisionFilter: { category: 4, mask: 2 },
      },
    );

    Matter.Composite.add(physicsConfig.engine!.world, [
      this.body,
      this.groundSensor,
    ]);

    animationStates.forEach((stateName) => {
      this.animationState.addHook(stateName, "enter", () => {
        if (
          this.sprite.animations[`${stateName}_left`] &&
          this.facingState.currentState === "left"
        ) {
          this.sprite.changeAnimation(`${stateName}_left`);
        } else {
          this.sprite.changeAnimation(stateName);
        }
      });
    });

    this.animationState.addCondition("jump", "fall", () => {
      return this.body.velocity.y < 0;
    });
    this.animationState.addCondition("fall", "idle", () => {
      return this.ground !== null;
    });
    this.animationState.addCondition("idle", "jump", () => {
      return this.ground === null && this.body.velocity.y > 0.2;
    });
    this.animationState.addCondition("idle", "fall", () => {
      return this.ground === null && this.body.velocity.y < 0.2;
    });
    this.animationState.addCondition("idle", "run", () => {
      return !this.lockGround && this.body.velocity.x > 0.3;
    });
    this.animationState.addCondition("idle", "run", () => {
      return !this.lockGround && this.body.velocity.x < -0.3;
    });
    this.animationState.addCondition("run", "idle", () => {
      return Math.abs(this.body.velocity.x) < 0.3;
    });
    this.animationState.addCondition("run", "jump", () => {
      return this.ground === null && this.body.velocity.y > 0.2;
    });
    this.animationState.addCondition("run", "fall", () => {
      return this.ground === null && this.body.velocity.y < 0.2;
    });
    this.animationState.addCondition("into_climb", "climb", () => {
      return GameConfig.duration - this.intoClimbTime > 450;
    });
    this.animationState.addCondition("try_climb", "idle", () => {
      return GameConfig.duration - this.tryClimbTime > 300;
    });
    this.animationState.addCondition("jump_try_climb", "jump", () => {
      return GameConfig.duration - this.tryClimbTime > 200;
    });

    this.state.addCondition("Air", "Ground", () => {
      return this.ground !== null;
    });
    this.state.addCondition("Ground", "Air", () => {
      return !this.lockGround && this.ground === null;
    });

    this.state.addHook("Climb", "enter", () => {
      if (!this.body.isStatic) {
        Matter.Body.setStatic(this.body, true);
        Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
      }

      if (this.stem) {
        Matter.Body.setPosition(this.body, {
          x: this.stem.position.x - 5,
          y: this.stem.position.y - 20,
        });
      }

      if (this.body.velocity.x > -0.2) {
        this.animationState.changeState("into_climb");
        this.intoClimbTime = GameConfig.duration;
      } else {
        this.animationState.changeState("climb");
      }
    });

    this.state.addHook("Climb", "leave", () => {
      if (this.body.isStatic) {
        Matter.Body.setStatic(this.body, false);
      }
      this.animationState.changeState("jump");
    });

    this.state.addHook("Air", "update", () => {
      Matter.Body.translate(this.body, {
        x: TimeManager.deltaT * GameConfig.translateSpeed,
        y: 0,
      });
    });
    this.state.addHook("Ground", "update", () => {
      Matter.Body.translate(this.body, {
        x: TimeManager.deltaT * GameConfig.translateSpeed,
        y: 0,
      });
    });

    this.state.addHook("Climb", "update", () => {
      if (this.stem) {
        Matter.Body.setPosition(this.body, {
          x: this.stem.position.x - 5,
          y: this.stem.position.y - 20,
        });
      } else {
        this.state.changeState("Air");
      }
    });

    this.facingState.addHook("right", "enter", () => {
      if (this.animationState.currentState !== "into_climb") {
        this.animationState.changeState(this.animationState.currentState);
      }
    });

    this.facingState.addHook("left", "enter", () => {
      if (this.animationState.currentState !== "into_climb") {
        this.animationState.changeState(this.animationState.currentState);
      }
    });
  }

  override get position() {
    return super.position;
  }

  override set position(value) {
    super.position = value;
    Matter.Body.setPosition(this.body, { x: value[0], y: value[1] });
  }

  override update() {
    if (this.lockGround) {
      if (this.animationState.currentState !== "idle") {
        this.animationState.changeState("idle");
      }

      if (this.lockGroundEndAt && GameConfig.duration < this.lockGroundEndAt) {
        if (this.ground) {
          Matter.Body.setPosition(this.body, {
            x: this.ground.position.x,
            y: this.ground.position.y + 50,
          });
        }
      } else {
        this.lockGround = false;
        Matter.Body.translate(this.body, { x: 0, y: 4 });
        Matter.Body.setStatic(this.body, false);
        this.body.collisionFilter.mask = 2;
        Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
      }
    }

    if (this.lockStem) {
      if (this.lockStemEndAt && GameConfig.duration < this.lockStemEndAt) {
        if (this.stem) {
          Matter.Body.setPosition(this.body, {
            x: this.stem.position.x,
            y: this.stem.position.y - 50,
          });
        }
      } else {
        this.lockStem = false;
        this.body.collisionFilter.mask = 2;
      }
    }

    this.state.update();
    this.animationState.update();

    const physicsPos = this.body.position;
    super.position = Vec3.fromValues(
      Math.round(physicsPos.x),
      Math.round(physicsPos.y),
      0,
    );

    Matter.Body.setPosition(this.groundSensor, {
      x: physicsPos.x,
      y: physicsPos.y + SENSOR_OFFSET_Y,
    });
    Matter.Body.setVelocity(this.groundSensor, { x: 0, y: 0 });
  }
}
