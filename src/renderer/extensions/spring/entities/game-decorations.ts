import { AssetManager } from "../core/asset-manager";
import { GameConfig } from "../core/game-config";
import { TimeManager } from "../core/game-runtime";
import { Mat4, Vec3 } from "../render/math";
import { SceneNode } from "../render/scene";
import type { AtlasData, RenderMvpParams } from "../render/webgl-renderer";
import {
  AnimatedSprite,
  Shader,
  Sprite,
  WebGLRenderable,
  type WebGLRenderer,
} from "../render/webgl-renderer";

export class CountDown extends SceneNode {
  sprite!: AnimatedSprite;

  constructor() {
    super();
    const texture = AssetManager.get<HTMLImageElement>("count");
    const atlas = AssetManager.get<AtlasData>("countAtlas");

    this.sprite = new AnimatedSprite({ texture, atlas });
    this.scaling = Vec3.fromValues(2, 2, 1);
    this.reset();
  }

  reset() {
    this.position = Vec3.fromValues(0, 100, -1);
    this.sprite.changeAnimation("idle");
    this.sprite.lastChange = 0;
    this.object = this.sprite;
  }

  override update() {
    if (this.object && TimeManager.time > 4000) {
      this.object = undefined;
    } else if (this.object) {
      const offset =
        (TimeManager.deltaT * (GameConfig.translateSpeed - 0.18)) / 2;
      this.translate([offset, 0, 0]);
    }
  }
}

export class BirdsManager extends SceneNode {
  numberCanvas: HTMLCanvasElement;
  numberCtx: CanvasRenderingContext2D;
  numbersTexture!: HTMLImageElement;
  birdSprite!: AnimatedSprite;
  birdNode = new SceneNode();
  numNode = new SceneNode();
  nextAppear = 30;

  constructor() {
    super();
    this.numberCanvas = document.createElement("canvas");
    this.numberCanvas.width = 60;
    this.numberCanvas.height = 16;
    this.numberCtx = this.numberCanvas.getContext("2d")!;

    const birdTexture = AssetManager.get<HTMLImageElement>("bird");
    const birdAtlas = AssetManager.get<AtlasData>("birdAtlas");
    this.numbersTexture = AssetManager.get<HTMLImageElement>("numbers2");

    this.birdSprite = new AnimatedSprite({
      texture: birdTexture,
      atlas: birdAtlas,
    });
    this.birdSprite.changeAnimation("idle");

    this.birdNode.scaling = Vec3.fromValues(2, 2, 1);
    this.birdNode.translate([-2000, 75, -49]);

    this.numNode.scaling = Vec3.fromValues(1, 1, 1);
    this.numNode.position = Vec3.fromValues(20, -10, 1);

    this.birdNode.addChild(this.numNode);
    this.addChild(this.birdNode);
  }

  override update() {
    const elapsedSeconds = GameConfig.duration / 1000;

    if (elapsedSeconds > this.nextAppear) {
      const curSeconds = this.nextAppear;
      this.nextAppear = curSeconds + 30;

      this.genNumber(curSeconds).then((canvasImage) => {
        this.numNode.object?.destroy();

        this.numNode.object = new Sprite({ texture: canvasImage });

        this.birdNode.position = Vec3.fromValues(1100, 75, -49);
        this.birdNode.object = this.birdSprite;
        this.birdSprite.lastChange = 0;
      });
    }

    if (this.birdNode.position[0] > -1100) {
      this.birdNode.translate([-4, 0, 0]);
    } else if (this.birdNode.object) {
      this.birdNode.object = undefined;
    }
  }

  reset() {
    this.birdNode.object = undefined;
    this.numNode.object?.destroy();
    this.numNode.object = undefined;
    this.birdSprite.lastChange = 0;
    this.nextAppear = 30;
  }

  async genNumber(seconds: number): Promise<HTMLImageElement> {
    this.numberCtx.clearRect(
      0,
      0,
      this.numberCanvas.width,
      this.numberCanvas.height,
    );

    const digits = Math.floor(seconds)
      .toString()
      .split("")
      .map((num) => Number(num));

    const renderWidth = Math.max(digits.length, 5);
    const startX = 30 - 6 * renderWidth;

    for (let i = 0; i < renderWidth; i++) {
      this.numberCtx.drawImage(
        this.numbersTexture,
        12 * Number(digits[i]),
        0,
        12,
        16,
        startX + 12 * i,
        0,
        12,
        16,
      );
    }

    return new Promise((resolve) => {
      const img = document.createElement("img");
      img.onload = () => resolve(img);
      img.src = this.numberCanvas.toDataURL();
    });
  }
}

const VS_SOURCE = `#version 300 es
precision mediump float;
layout(location = 0) in vec2 i_position;
uniform mat4 mvp_matrix;
out vec2 position;
void main() {
  position = i_position;
  gl_Position = mvp_matrix * vec4(position, 0., 1.);
}`;

const FS_SOURCE = `#version 300 es
precision mediump float;
uniform float pct;
uniform vec2 center;
uniform vec2 size;
in vec2 position;
out vec4 fragColor;
void main() {
  vec2 uv = position * size;
  float d = length(uv - center);
  if(d / (size.x - 600.) > 1. - pct) {
    fragColor = vec4(0., 0., 0., 1.);
  } else {
    fragColor = vec4(0., 0., 0., 0.);
  }
}`;

interface EndEffectOptions {
  center?: [number, number];
  duration?: number;
  size?: [number, number];
}

export class EndEffectNode extends WebGLRenderable {
  renderer: WebGLRenderer | null = null;
  buffer: WebGLBuffer | null = null;
  vao: WebGLVertexArrayObject | null = null;
  shader: Shader | null = null;
  mvp = Mat4.create();
  startTime = NaN;
  center: [number, number];
  duration: number;
  size: [number, number];

  constructor(options?: EndEffectOptions) {
    super();
    this.center = options?.center ?? [0, 0];
    this.duration = options?.duration ?? 1000;
    this.size = options?.size ?? [1920, 720];
  }

  override init(renderer: WebGLRenderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.shader = new Shader({ gl, vs: VS_SOURCE, fs: FS_SOURCE });

    this.shader.use();
    this.shader.setUniform("size", "VEC2", this.size);
    this.shader.setUniform("center", "VEC2", this.center);

    const vertices = new Float32Array([
      -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5,
    ]);

    this.vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    this.buffer = vbo;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, true, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.startTime = TimeManager.time;
  }

  override render(mvpParams: RenderMvpParams) {
    if (!this.renderer || !this.shader) return;
    const gl = this.renderer.gl;

    gl.bindVertexArray(this.vao);
    this.shader.use();

    const scaleVec = new Float32Array([this.size[0], this.size[1], 1]);
    Mat4.scale(this.mvp, mvpParams.modelMatrix, scaleVec);
    Mat4.multiply(this.mvp, mvpParams.viewProjection, this.mvp);

    this.shader.setUniform("mvp_matrix", "MAT4", this.mvp);

    const pctVal = (TimeManager.time - this.startTime) / this.duration;
    this.shader.setUniform("pct", "FLOAT", pctVal);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  override destroy() {
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    this.renderer.initSet.delete(this);
    this.shader?.destroy();
  }
}
