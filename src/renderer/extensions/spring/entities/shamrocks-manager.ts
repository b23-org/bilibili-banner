import Matter from "matter-js";
import { AssetManager } from "../core/asset-manager";
import { GameConfig, stageConfig } from "../core/game-config";
import { TimeManager } from "../core/game-runtime";
import { SceneNode } from "../render/scene";
import type { AtlasData } from "../render/webgl-renderer";
import {
  LEAF_OFFSETS,
  LEAF_SIZES,
  LuckyLeaf,
  NormalLeaf,
  STEM_OFFSETS,
  TrapLeaf,
} from "./leaves";

const getRandomInRange = (range: [number, number]) => {
  return range[0] + Math.random() * (range[1] - range[0]);
};

export class ShamrocksManager extends SceneNode {
  normal: NormalLeaf[] = [];
  trap: TrapLeaf[] = [];
  normalNode = new SceneNode();
  trapNode = new SceneNode();
  luckyNode = new SceneNode();
  normalGenIndex = 0;
  lastZIndex = -40;
  lastAddType: "normal" | "trap" | "lucky" = "normal";
  normalImgs: HTMLImageElement[] = [];
  normalAtlas: AtlasData[] = [];
  trapTexture: HTMLImageElement[] = [];
  trapAtlas: AtlasData[] = [];
  luckyTexture: HTMLImageElement[] = [];
  luckyAtlas: AtlasData[] = [];
  allowLuckyAfter = 15000;

  constructor() {
    super();

    this.normalImgs = [
      AssetManager.get<HTMLImageElement>("shamrock1"),
      AssetManager.get<HTMLImageElement>("shamrock2"),
      AssetManager.get<HTMLImageElement>("shamrock3"),
      AssetManager.get<HTMLImageElement>("shamrock4"),
    ];
    this.normalAtlas = [
      AssetManager.get<AtlasData>("shamrock1Atlas"),
      AssetManager.get<AtlasData>("shamrock2Atlas"),
      AssetManager.get<AtlasData>("shamrock3Atlas"),
      AssetManager.get<AtlasData>("shamrock4Atlas"),
    ];

    this.trapTexture = [AssetManager.get<HTMLImageElement>("shamrockTrap")];
    this.trapAtlas = [AssetManager.get<AtlasData>("shamrockTrapAtlas")];

    this.luckyTexture = [AssetManager.get<HTMLImageElement>("shamrockLucky")];
    this.luckyAtlas = [AssetManager.get<AtlasData>("shamrockLuckyAtlas")];

    this.addChild(this.normalNode);
    this.addChild(this.trapNode);
    this.addChild(this.luckyNode);
  }

  addInitial() {
    const initialConfig = [
      { type: 0, start: 1, position: [-100, 20] },
      { type: 3, start: 5, position: [88, -60] },
      { type: 2, start: 5, position: [237, 25] },
      { type: 3, start: 5, position: [420, 15] },
      { type: 1, start: 5, position: [613, -130] },
      { type: 0, start: 5, position: [723, -4] },
      { type: 2, start: 5, position: [885, 68] },
    ];

    initialConfig.forEach((item) => {
      const leaf = new NormalLeaf({
        texture: this.normalImgs[item.type],
        atlas: this.normalAtlas[item.type],
        stemOffset: STEM_OFFSETS[item.type],
        leafSize: LEAF_SIZES[item.type],
        leafOffset: LEAF_OFFSETS[item.type],
        startFrame: item.start,
      });
      leaf.setLeafPosition(item.position[0], item.position[1], -40);
      this.normalNode.addChild(leaf);
    });

    this.lastAddType = "normal";
  }

  reset() {
    this.allowLuckyAfter = 15000;
    this.normalNode.clear();
    this.trapNode.clear();
    this.luckyNode.clear();
    this.addInitial();
  }

  genNormal() {
    const index = Math.floor(Math.random() * 4);
    return new NormalLeaf({
      texture: this.normalImgs[index],
      atlas: this.normalAtlas[index],
      stemOffset: STEM_OFFSETS[index],
      leafSize: LEAF_SIZES[index],
      leafOffset: LEAF_OFFSETS[index],
      startFrame: Math.floor(Math.random() * 6),
    });
  }

  genTrap() {
    return new TrapLeaf({
      texture: this.trapTexture[0],
      atlas: this.trapAtlas[0],
    });
  }

  genLucky() {
    return new LuckyLeaf({
      texture: this.luckyTexture[0],
      atlas: this.luckyAtlas[0],
    });
  }

  get lastNodePosition() {
    const containers: Record<string, SceneNode> = {
      normal: this.normalNode,
      trap: this.trapNode,
      lucky: this.luckyNode,
    };
    const container = containers[this.lastAddType];
    const node = container.children[container.children.length - 1];
    return node?.position ?? new Float32Array(3);
  }

  addNext() {
    const horizontalDistanceRange: [number, number] = [50, 200];
    const verticalHeightRange: [number, number] = [-100, 100];

    const lastPos = this.lastNodePosition;
    if (!lastPos) return;

    let nextX = getRandomInRange(horizontalDistanceRange);
    const nextY = getRandomInRange(verticalHeightRange);
    const prob = Math.random();

    this.lastZIndex += 1;
    if (this.lastZIndex > -30) {
      this.lastZIndex = -40;
      nextX = Math.max(150, nextX);
    }

    let stageIndex = 0;
    for (
      let i = 0;
      i < stageConfig.length && !(stageConfig[i].time > GameConfig.duration);
      i++
    ) {
      stageIndex = i;
    }
    const currentDifficulty = stageConfig[stageIndex];

    if (prob < currentDifficulty.trap) {
      if (this.lastAddType === "lucky") {
        nextX = Math.max(150, nextX);
      }
      const trap = this.genTrap();
      nextX += lastPos[0];
      trap.setLeafPosition(nextX, nextY, this.lastZIndex);
      this.trapNode.addChild(trap);
      this.lastAddType = "trap";
    } else if (
      prob < currentDifficulty.trap + currentDifficulty.lucky &&
      GameConfig.duration > this.allowLuckyAfter
    ) {
      const lucky = this.genLucky();
      nextX += lastPos[0];
      lucky.setLeafPosition(nextX, nextY, this.lastZIndex);
      this.luckyNode.addChild(lucky);
      this.lastAddType = "lucky";
      this.allowLuckyAfter = GameConfig.duration + 30000;
    } else {
      if (this.lastAddType === "trap" || this.lastAddType === "lucky") {
        nextX = Math.max(150, nextX);
      }
      nextX += lastPos[0];
      const normal = this.genNormal();
      normal.setLeafPosition(nextX, nextY, this.lastZIndex);
      this.normalNode.addChild(normal);
      this.lastAddType = "normal";
    }

    if (nextY > 80 || nextY < -60) {
      this.lastZIndex += 0.1;
      let bufferDistance = getRandomInRange(horizontalDistanceRange);
      if (this.lastAddType === "trap" || this.lastAddType === "lucky") {
        bufferDistance = Math.max(150, bufferDistance);
      }
      bufferDistance += nextX;

      const bufferY = getRandomInRange(verticalHeightRange);
      const bufferLeaf = this.genNormal();
      bufferLeaf.setLeafPosition(bufferDistance, bufferY, this.lastZIndex);
      this.normalNode.addChild(bufferLeaf);
      this.lastAddType = "normal";
    }
  }

  override update() {
    while (this.normalNode.children[0]?.position[0] < -1000) {
      this.normalNode.children.shift()?.destroy();
    }
    while (this.trapNode.children[0]?.position[0] < -1000) {
      this.trapNode.children.shift()?.destroy();
    }
    while (this.luckyNode.children[0]?.position[0] < -1000) {
      this.luckyNode.children.shift()?.destroy();
    }

    if (this.lastNodePosition[0] < 1100) {
      this.addNext();
    }

    const swayTargets = this.normalNode.children.concat(this.trapNode.children);
    swayTargets.forEach((leaf, index) => {
      const nl = leaf as NormalLeaf;
      Matter.Body.translate(nl.leafBody, {
        x: 0,
        y: 0.5 * Math.sin(TimeManager.time / 400 + 1.23 * index),
      });
    });

    this.all.forEach((leaf) => {
      const nl = leaf as NormalLeaf;
      Matter.Body.translate(nl.leafBody, {
        x: TimeManager.deltaT * GameConfig.translateSpeed,
        y: 0,
      });
    });
  }

  get all() {
    return this.normalNode.children
      .concat(this.trapNode.children)
      .concat(this.luckyNode.children);
  }

  get traps() {
    return this.trapNode.children;
  }

  get luckies() {
    return this.luckyNode.children;
  }

  override destroy() {
    super.destroy();
  }
}
