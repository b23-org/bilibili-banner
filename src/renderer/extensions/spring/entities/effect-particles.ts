import { AssetManager, type SpringAssetKey } from "../core/asset-manager";
import { TimeManager } from "../core/game-runtime";
import { Vec3 } from "../render/math";
import { SceneNode } from "../render/scene";
import type { AtlasData } from "../render/webgl-renderer";
import {
  AnimatedSprite,
  ParticleSystem,
  Sprite,
} from "../render/webgl-renderer";

export class Background extends SceneNode {
  sprites: Sprite[] = [];

  constructor() {
    super();

    const backgroundKeys = ["sky", "clouds", "mountain", "near"] as const;

    const spaceTexture = AssetManager.get<HTMLImageElement>("space");
    const spaceSprite = new Sprite({ texture: spaceTexture });
    const spaceNode = new SceneNode(spaceSprite);

    spaceNode.translate([0, 360, -51]);
    spaceNode.scale([240, 45, 1]);
    this.addChild(spaceNode);

    const parallaxLayers = backgroundKeys.map((key, index) => {
      const texture = AssetManager.get<HTMLImageElement>(key);
      const sprite = new Sprite({ texture });
      this.sprites.push(sprite);

      const layerNode = new SceneNode(sprite);
      layerNode.translate([0, 0, index - backgroundKeys.length - 50]);
      layerNode.scale([2, 2, 1]);

      sprite.uvOffset[0] = -0.065;
      return layerNode;
    });

    for (const layer of parallaxLayers) {
      this.addChild(layer);
    }
  }

  override update() {
    const dt = TimeManager.deltaT;
    this.sprites[0].uvOffset[0] =
      (this.sprites[0].uvOffset[0] + 0.000005 * dt) % 1;
    this.sprites[1].uvOffset[0] =
      (this.sprites[1].uvOffset[0] + 0.00001 * dt) % 1;
    this.sprites[2].uvOffset[0] =
      (this.sprites[2].uvOffset[0] + 0.00002 * dt) % 1;
    this.sprites[3].uvOffset[0] =
      (this.sprites[3].uvOffset[0] + 0.00003 * dt) % 1;
  }
}

export class LeavesEffect extends SceneNode {
  constructor() {
    super();

    const leafKeys: string[] = ["leaves1", "leaves2", "leaves3", "leaves4"];

    const leafSystems = leafKeys
      .map((key) => AssetManager.get<HTMLImageElement>(key as SpringAssetKey))
      .map((texture) => {
        return new SceneNode(
          new ParticleSystem({
            texture,
            scale: 1,
            numParticles: 15,
            particleBirthRate: 1,
            originA: new Float32Array([960, 280, 0.5]),
            originB: new Float32Array([-960, 280, 0.5]),
            angle2d: Math.PI * (17 / 16),
            angleRadius: 0.01,
            speedRange: [400, 450],
            gravity: [0, -10, 0],
            ageRange: [10, 11],
          }),
        );
      });

    for (const systemNode of leafSystems) {
      this.addChild(systemNode);
    }
  }
}

const getRand = (range: [number, number]) => {
  return range[0] + Math.random() * (range[1] - range[0]);
};

class Wind extends SceneNode {
  duration: number;

  constructor(options: { texture: HTMLImageElement; atlas: AtlasData }) {
    super();
    const spriteNode = new AnimatedSprite({
      texture: options.texture,
      atlas: options.atlas,
    });

    this.object = spriteNode;
    this.scaling = Vec3.fromValues(2, 2, 1);

    this.duration = spriteNode.animations.idle.duration;
  }
}

export class WindsManager extends SceneNode {
  currentEnd = 0;
  nextStart = 0;
  winds: Wind[] = [];

  constructor() {
    super();

    const windKeys: { t: SpringAssetKey; a: SpringAssetKey }[] = [
      { t: "wind1", a: "wind1Atlas" },
      { t: "wind2", a: "wind2Atlas" },
      { t: "wind3", a: "wind3Atlas" },
      { t: "wind4", a: "wind4Atlas" },
    ];

    const textures = windKeys.map((item) =>
      AssetManager.get<HTMLImageElement>(item.t),
    );
    const atlases = windKeys.map((item) => AssetManager.get<AtlasData>(item.a));

    for (let i = 0; i < textures.length; i++) {
      const wind = new Wind({ texture: textures[i], atlas: atlases[i] });
      wind.position = Vec3.fromValues(0, 0, 0.5 + 0.1 * i);
      this.winds.push(wind);
    }
  }

  override update() {
    if (TimeManager.time > this.nextStart) {
      const randIdx = Math.floor(getRand([0, this.winds.length]));
      const selectedWind = this.winds[randIdx];

      (selectedWind.object as AnimatedSprite).changeAnimation("idle");

      this.currentEnd = TimeManager.time + selectedWind.duration;
      this.nextStart = this.currentEnd + getRand([500, 1000]);

      this.addChild(selectedWind);
    } else if (TimeManager.time > this.currentEnd && this.children.length) {
      this.children.shift();
    }
  }

  reset() {
    this.clear();
    this.currentEnd = 0;
    this.nextStart = 3000 + getRand([500, 1000]);
  }

  override destroy() {
    super.destroy();
    for (const wind of this.winds) {
      wind.destroy();
    }
  }
}
