import { TimeManager } from "../core/game-runtime";
import { Mat4, type Mat4Like, Vec3, type Vec3Like } from "./math";

export interface RenderMvpParams {
  modelMatrix: Mat4Like;
  viewMatrix: Mat4Like;
  projectionMatrix: Mat4Like;
  viewProjection: Mat4Like;
}

export abstract class WebGLRenderable {
  abstract init(renderer: WebGLRenderer): void;
  abstract render(mvpParams: RenderMvpParams): void;
  abstract destroy(): void;
}

export class WebGLRenderer {
  gl: WebGL2RenderingContext;
  initSet = new Set<WebGLRenderable>();

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      antialias: false,
    });
    if (!context) {
      throw new Error("WebGL2 not available in this browser");
    }
    this.gl = context;
    context.viewport(0, 0, canvas.width, canvas.height);
    context.enable(context.DEPTH_TEST);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE_MINUS_SRC_ALPHA);
    context.clearColor(0, 0, 0, 0);
  }

  render(
    camera: {
      viewMatrix: Mat4Like;
      projectionMatrix: Mat4Like;
      viewProjection: Mat4Like;
    },
    sceneNode: SceneNodeLike,
  ): void {
    if (sceneNode.object) {
      if (!this.initSet.has(sceneNode.object)) {
        sceneNode.object.init(this);
        this.initSet.add(sceneNode.object);
      }
      sceneNode.object.render({
        modelMatrix: sceneNode.tempTransform,
        viewMatrix: camera.viewMatrix,
        projectionMatrix: camera.projectionMatrix,
        viewProjection: camera.viewProjection,
      });
    }
    sceneNode.children?.forEach((child) => {
      this.render(camera, child);
    });
  }
}

interface SceneNodeLike {
  object?: WebGLRenderable;
  tempTransform: Mat4Like;
  children?: SceneNodeLike[];
}

const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create WebGL shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const errorInfo = `Shader compilation failed: ${gl.getShaderInfoLog(shader)}`;
    gl.deleteShader(shader);
    throw new Error(errorInfo);
  }
  return shader;
};

type UniformType =
  | "BOOLEAN"
  | "INT"
  | "FLOAT"
  | "VEC2"
  | "VEC3"
  | "VEC4"
  | "MAT2"
  | "MAT3"
  | "MAT4";

export class Shader {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  locations: Record<string, WebGLUniformLocation | null> = {};
  uniformBuffers: Record<string, WebGLBuffer> = {};
  setUniform: (
    name: string,
    type: UniformType,
    val: number | number[] | Float32Array,
  ) => void;

  constructor(options: {
    gl: WebGL2RenderingContext;
    vs: string;
    fs: string;
    transformFeedbackVaryings?: string[];
  }) {
    this.gl = options.gl;
    const vertexShader = compileShader(
      options.gl,
      options.gl.VERTEX_SHADER,
      options.vs,
    );
    const fragmentShader = compileShader(
      options.gl,
      options.gl.FRAGMENT_SHADER,
      options.fs,
    );
    const program = options.gl.createProgram();

    if (!program) {
      throw new Error("Unable to create WebGL shader program");
    }

    this.program = program;
    options.gl.attachShader(program, vertexShader);
    options.gl.attachShader(program, fragmentShader);

    if (options.transformFeedbackVaryings) {
      options.gl.transformFeedbackVaryings(
        program,
        options.transformFeedbackVaryings,
        options.gl.INTERLEAVED_ATTRIBS,
      );
    }

    options.gl.linkProgram(program);
    options.gl.deleteShader(vertexShader);
    options.gl.deleteShader(fragmentShader);

    if (!options.gl.getProgramParameter(program, options.gl.LINK_STATUS)) {
      throw new Error(
        `Shader program linking failed: ${options.gl.getProgramInfoLog(program)}`,
      );
    }

    this.locations = {};

    this.setUniform = (
      name: string,
      type: UniformType,
      val: number | number[] | Float32Array,
    ) => {
      let loc = this.locations[name];
      if (!loc) {
        loc = options.gl.getUniformLocation(program, name);
        this.locations[name] = loc;
      }

      const uniformSetters: Record<UniformType, () => void> = {
        BOOLEAN: () => options.gl.uniform1i(loc, Number(val)),
        INT: () => options.gl.uniform1i(loc, Math.round(val as number)),
        FLOAT: () => options.gl.uniform1f(loc, val as number),
        VEC2: () => options.gl.uniform2fv(loc, val as number[]),
        VEC3: () => options.gl.uniform3fv(loc, val as number[]),
        VEC4: () => options.gl.uniform4fv(loc, val as number[]),
        MAT2: () =>
          options.gl.uniformMatrix2fv(loc, false, val as Float32Array),
        MAT3: () =>
          options.gl.uniformMatrix3fv(loc, false, val as Float32Array),
        MAT4: () =>
          options.gl.uniformMatrix4fv(loc, false, val as Float32Array),
      };

      uniformSetters[type]?.();
    };
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  setUniformBuffer(name: string, bufferData: ArrayBufferView): void {
    let ubo = this.uniformBuffers[name];
    const gl = this.gl;
    if (!ubo) {
      ubo = gl.createBuffer()!;
      gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
      gl.uniformBlockBinding(this.program, 0, 0);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
      this.uniformBuffers[name] = ubo;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, bufferData, gl.DYNAMIC_DRAW);
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
  }
}

const defaultVs = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 i_position;

uniform mat4 mvp_matrix;

out vec2 position;

void main() {
  position = i_position;
  gl_Position = mvp_matrix * vec4(position, 0., 1.);
}`;

const defaultFs = `#version 300 es
precision mediump float;

uniform sampler2D spirte_texture;
uniform vec2 repeat;
uniform vec2 uv_offset;
uniform vec2 half_pixel;

in vec2 position;
out vec4 fragColor;

void main() {
  vec2 uv = half_pixel + (position + 0.5) * (1. - half_pixel * 2.);
  uv.y = 1. - uv.y;
  uv = fract(fract(uv * repeat) + uv_offset);
  fragColor = texture(spirte_texture, uv);
}`;

export class Sprite extends WebGLRenderable {
  renderer: WebGLRenderer | null = null;
  buffer: WebGLBuffer | null = null;
  shader: Shader | null = null;
  vao: WebGLVertexArrayObject | null = null;
  texture: WebGLTexture | null = null;
  textureImg: HTMLImageElement;
  size: [number, number];
  repeat: [number, number];
  uvOffset: [number, number];
  scaleArr = new Float32Array(2);
  mvp = Mat4.create();
  tempVec3 = Vec3.create();

  constructor(options: {
    texture: HTMLImageElement;
    repeat?: [number, number];
  }) {
    super();
    this.repeat = options.repeat ?? [1, 1];
    this.uvOffset = [0, 0];
    this.textureImg = options.texture;
    this.size = [options.texture.naturalWidth, options.texture.naturalHeight];
  }

  override init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.shader = new Shader({ gl, vs: defaultVs, fs: defaultFs });

    const vertices = new Float32Array([
      -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5,
    ]);

    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, true, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.textureImg,
    );
  }

  override render(mvpParams: RenderMvpParams): void {
    if (!this.shader || !this.renderer) return;
    const gl = this.renderer.gl;

    gl.bindVertexArray(this.vao);
    this.shader.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    Mat4.getScaling(this.tempVec3, mvpParams.modelMatrix);
    this.scaleArr[0] = this.tempVec3[0];
    this.scaleArr[1] = this.tempVec3[1];

    this.shader.setUniform("half_pixel", "VEC2", [
      0.5 / (this.size[0] * this.scaleArr[0]),
      0.5 / (this.size[1] * this.scaleArr[1]),
    ]);

    Mat4.scale(
      this.mvp,
      mvpParams.modelMatrix,
      Vec3.fromValues(this.size[0], this.size[1], 1),
    );
    Mat4.multiply(this.mvp, mvpParams.viewProjection, this.mvp);

    this.shader.setUniform("mvp_matrix", "MAT4", this.mvp);
    this.shader.setUniform("uv_offset", "VEC2", this.uvOffset);
    this.shader.setUniform("repeat", "VEC2", this.repeat);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  override destroy(): void {
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.texture) gl.deleteTexture(this.texture);
    this.renderer.initSet.delete(this);
    this.shader?.destroy();
  }
}

const animVs = `#version 300 es
precision mediump float;

layout(location = 0) in vec2 i_position;

uniform mat4 mvp_matrix;

out vec2 position;

void main() {
  position = i_position;
  gl_Position = mvp_matrix * vec4(position, 0., 1.);
}`;

const animFs = `#version 300 es
precision mediump float;

uniform sampler2D spirte_texture;

uniform vec4 sprite_position;
uniform vec4 sprite_box;
uniform vec2 half_pixel;

in vec2 position;
out vec4 fragColor;

void main() {
  vec2 uv = half_pixel + (position + 0.5) * (1. - half_pixel * 2.);
  uv.y = 1. - uv.y;
  if(uv.x < sprite_box.x || uv.x > (sprite_box.x + sprite_box.z) || uv.y < sprite_box.y || uv.y > (sprite_box.y + sprite_box.w)) {
    discard;
  } else {
    vec2 luv = (uv - sprite_box.xy) / sprite_box.zw;
    vec2 suv = sprite_position.xy + luv * sprite_position.zw;
    fragColor = texture(spirte_texture, suv);
  }
}`;

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  duration: number;
}

interface AtlasMeta {
  size: { w: number; h: number };
  frameTags: Array<{ name: string; from: number; to: number }>;
}

export interface AtlasData {
  frames: AtlasFrame[];
  meta: AtlasMeta;
}

interface AnimationInfo {
  start: number;
  length: number;
  duration: number;
}

export class AnimatedSprite extends WebGLRenderable {
  renderer: WebGLRenderer | null = null;
  shader: Shader | null = null;
  vao: WebGLVertexArrayObject | null = null;
  texture: WebGLTexture | null = null;
  buffer: WebGLBuffer | null = null;
  textureImg: HTMLImageElement;
  atlas: AtlasData;
  spriteSize: [number, number];
  animations: Record<string, AnimationInfo>;
  scaleArr = new Float32Array(2);
  mvp = Mat4.create();
  tempVec3 = Vec3.create();
  lastChange = TimeManager.time;
  currentFrame = 0;
  currentAnimation: string;
  changingAnimation: string | null = null;
  changingAnimationStartFrame = 0;

  constructor(options: { texture: HTMLImageElement; atlas: AtlasData }) {
    super();
    this.textureImg = options.texture;
    this.atlas = options.atlas;
    this.spriteSize = [options.atlas.meta.size.w, options.atlas.meta.size.h];

    const calculateDuration = (from: number, to: number): number => {
      let dur = 0;
      for (let f = from; f <= to; f++) {
        dur += this.atlas.frames[f].duration;
      }
      return dur;
    };

    this.animations = {};
    for (const tag of this.atlas.meta.frameTags) {
      this.animations[tag.name] = {
        start: tag.from,
        length: tag.to - tag.from + 1,
        duration: calculateDuration(tag.from, tag.to),
      };
    }
    this.currentAnimation = Object.keys(this.animations)[0];
  }

  override init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.shader = new Shader({ gl, vs: animVs, fs: animFs });

    const vertices = new Float32Array([
      -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5,
    ]);

    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, true, 8, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.textureImg,
    );
  }

  override render(mvpParams: RenderMvpParams): void {
    if (!this.shader || !this.renderer) return;
    const gl = this.renderer.gl;

    gl.bindVertexArray(this.vao);
    this.shader.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const startFrameIndex = this.animations[this.currentAnimation].start;
    let frameData = this.atlas.frames[startFrameIndex + this.currentFrame];

    if (
      TimeManager.time > this.lastChange + frameData.duration ||
      this.changingAnimation
    ) {
      if (this.changingAnimation) {
        this.currentAnimation = this.changingAnimation;
        this.currentFrame = this.changingAnimationStartFrame;
        this.changingAnimation = null;

        const animInfo = this.animations[this.currentAnimation];
        frameData = this.atlas.frames[animInfo.start + this.currentFrame];
      } else {
        const animInfo = this.animations[this.currentAnimation];
        this.currentFrame = (this.currentFrame + 1) % animInfo.length;
        frameData = this.atlas.frames[animInfo.start + this.currentFrame];
      }

      const { frame, sourceSize, spriteSourceSize } = frameData;
      this.shader.use();

      this.shader.setUniform("sprite_box", "VEC4", [
        spriteSourceSize.x / sourceSize.w,
        spriteSourceSize.y / sourceSize.h,
        spriteSourceSize.w / sourceSize.w,
        spriteSourceSize.h / sourceSize.h,
      ]);
      this.shader.setUniform("sprite_position", "VEC4", [
        frame.x / this.spriteSize[0],
        frame.y / this.spriteSize[1],
        frame.w / this.spriteSize[0],
        frame.h / this.spriteSize[1],
      ]);

      Mat4.getScaling(this.tempVec3, mvpParams.modelMatrix);
      this.scaleArr[0] = this.tempVec3[0];
      this.scaleArr[1] = this.tempVec3[1];

      this.shader.setUniform("half_pixel", "VEC2", [
        0.5 / (sourceSize.w * this.scaleArr[0]),
        0.5 / (sourceSize.h * this.scaleArr[1]),
      ]);
      this.lastChange = TimeManager.time;
    }

    Mat4.scale(
      this.mvp,
      mvpParams.modelMatrix,
      Vec3.fromValues(frameData.sourceSize.w, frameData.sourceSize.h, 1),
    );
    Mat4.multiply(this.mvp, mvpParams.viewProjection, this.mvp);

    this.shader.setUniform("mvp_matrix", "MAT4", this.mvp);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  changeAnimation(name: string, startFrame = 0): void {
    this.changingAnimation = name;
    this.changingAnimationStartFrame = startFrame;
  }

  override destroy(): void {
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.texture) gl.deleteTexture(this.texture);
    this.shader?.destroy();
    this.renderer.initSet.delete(this);
  }
}

const partVs = `#version 300 es
precision mediump float;

layout(location = 0) in vec3 i_Position;
layout(location = 1) in vec3 i_Velocity;
layout(location = 2) in float i_Life;
layout(location = 3) in float i_Age;
layout(location = 4) in vec2 i_Coord;

out float v_Life;
out float v_Age;
out vec2 v_Uv;

uniform vec2 u_Size;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

void main() {
  vec3 cameraRight = vec3(u_ViewMatrix[0].x, u_ViewMatrix[1].x, u_ViewMatrix[2].x);
  vec3 cameraUp = vec3(u_ViewMatrix[0].y, u_ViewMatrix[1].y, u_ViewMatrix[2].y);
  vec3 position = i_Position + (cameraRight * i_Coord.x * u_Size.x + cameraUp * i_Coord.y * u_Size.y);

  v_Age = i_Age;
  v_Life = i_Life;
  v_Uv = (i_Coord + 1.) / 2.;
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * vec4(position, 1.0);
}`;

const partFs = `#version 300 es
precision mediump float;

uniform sampler2D u_Sprite;

in float v_Life;
in float v_Age;
in vec2 v_Uv;
out vec4 o_FragColor;

void main() {
  o_FragColor = texture(u_Sprite, v_Uv);
}`;

interface ParticleSystemOptions {
  numParticles: number;
  texture: HTMLImageElement;
  ageRange: [number, number];
  speedRange: [number, number];
  angleRadius: number;
  angle2d: number;
  scale: number;
  gravity: [number, number, number];
  originA: Vec3Like;
  originB: Vec3Like;
  particleBirthRate: number;
}

export class ParticleSystem extends WebGLRenderable {
  options: ParticleSystemOptions;
  renderer: WebGLRenderer | null = null;
  particleTexture: WebGLTexture | null = null;
  buffer: WebGLBuffer | null = null;
  vao: WebGLVertexArrayObject | null = null;
  shader: Shader | null = null;
  singleParticleLength = 8;
  particleData: Float32Array;
  updatePass: (() => void) | null = null;
  displayPass:
    | ((params: { viewMatrix: Mat4Like; projectionMatrix: Mat4Like }) => void)
    | null = null;
  bornParticles = 0;
  increaseFloat = 0;
  increaseTemp = 0;

  constructor(options: ParticleSystemOptions) {
    super();
    this.options = options;

    const stride = this.singleParticleLength;
    const data = new Float32Array(stride * options.numParticles);
    for (let i = 0; i < options.numParticles; i++) {
      data[i * stride] = 1e10;
      data[i * stride + 1] = 1e10;
      data[i * stride + 2] = 1e10;
      data[i * stride + 3] = 0;
      data[i * stride + 4] = 0;
      data[i * stride + 5] = 0;

      const life =
        options.ageRange[0] +
        Math.random() * (options.ageRange[1] - options.ageRange[0]);
      data[i * stride + 6] = life;
      data[i * stride + 7] = life + 1;
    }
    this.particleData = data;
  }

  override init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    const gl = renderer.gl;

    const tex = gl.createTexture();
    if (!tex) throw new Error("Unable to create particle texture");
    this.particleTexture = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.options.texture.naturalWidth,
      this.options.texture.naturalHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.options.texture,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const particleVBO = gl.createBuffer();
    if (!particleVBO) throw new Error("Unable to create particle buffer");
    this.buffer = particleVBO;
    gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.particleData, gl.DYNAMIC_DRAW);

    this.updatePass = () => {
      const stride = this.singleParticleLength;
      const data = this.particleData;

      for (let i = 0; i < this.bornParticles; i++) {
        const maxLife = data[i * stride + 6];
        const curAge = data[i * stride + 7];

        if (curAge > maxLife) {
          const tPos = Vec3.create();
          const randVec = Vec3.randomSpherical(Vec3.create());
          Vec3.subtract(tPos, this.options.originB, this.options.originA);
          Vec3.multiply(tPos, tPos, randVec);
          Vec3.add(tPos, this.options.originA, tPos);

          data[i * stride] = tPos[0];
          data[i * stride + 1] = tPos[1];
          data[i * stride + 2] = tPos[2];

          const angle = (2 * Math.random() - 1) * this.options.angleRadius;
          const rotVec = Vec3.create();
          Vec3.set(rotVec, Math.cos(angle), Math.sin(angle), 0);
          Vec3.rotate2D(rotVec, rotVec, Vec3.create(), this.options.angle2d);

          const speed =
            this.options.speedRange[0] +
            Math.random() *
              (this.options.speedRange[1] - this.options.speedRange[0]);
          Vec3.scale(rotVec, rotVec, speed);

          data[i * stride + 3] = rotVec[0];
          data[i * stride + 4] = rotVec[1];
          data[i * stride + 5] = rotVec[2];
          data[i * stride + 7] = 0;
        } else {
          const dt = TimeManager.deltaT / 1000;
          data[i * stride] += data[i * stride + 3] * dt;
          data[i * stride + 1] += data[i * stride + 4] * dt;
          data[i * stride + 2] += data[i * stride + 5] * dt;

          data[i * stride + 3] += this.options.gravity[0] * dt;
          data[i * stride + 4] += this.options.gravity[1] * dt;
          data[i * stride + 5] += this.options.gravity[2] * dt;

          data[i * stride + 7] += dt;
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO);
      gl.bufferData(gl.ARRAY_BUFFER, this.particleData, gl.DYNAMIC_DRAW);
    };

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Unable to create particle VAO");
    this.vao = vao;
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, particleVBO);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(0, 1);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 24);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 32, 28);
    gl.vertexAttribDivisor(3, 1);

    const quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, 1, -1, -1, 1, 1, 1, -1]),
      gl.STATIC_DRAW,
    );

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, true, 8, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindVertexArray(null);

    const shader = new Shader({ gl, vs: partVs, fs: partFs });
    this.shader = shader;

    this.displayPass = (params: {
      viewMatrix: Mat4Like;
      projectionMatrix: Mat4Like;
    }) => {
      gl.bindVertexArray(vao);
      shader.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.particleTexture);

      shader.setUniform("u_Sprite", "INT", 0);
      shader.setUniform("u_Size", "VEC2", [
        this.options.scale * this.options.texture.naturalWidth,
        this.options.scale * this.options.texture.naturalHeight,
      ]);
      shader.setUniform("u_ViewMatrix", "MAT4", params.viewMatrix);
      shader.setUniform("u_ProjectionMatrix", "MAT4", params.projectionMatrix);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.bornParticles);
    };
  }

  override render(mvpParams: RenderMvpParams): void {
    if (TimeManager.time < 3000) return;

    this.increaseFloat += this.options.particleBirthRate / 60;
    const toBirth = Math.floor(this.increaseFloat) - this.increaseTemp;

    if (toBirth > 0) {
      this.increaseFloat -= toBirth;
      this.increaseTemp = 0;
    }

    this.bornParticles = Math.min(
      this.options.numParticles,
      this.bornParticles + toBirth,
    );

    if (this.bornParticles > 0) {
      this.updatePass?.();
      this.displayPass?.({
        viewMatrix: mvpParams.viewMatrix,
        projectionMatrix: mvpParams.projectionMatrix,
      });
    }
  }

  override destroy(): void {
    if (!this.renderer) return;
    const gl = this.renderer.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.particleTexture) gl.deleteTexture(this.particleTexture);
    this.shader?.destroy();
    this.renderer.initSet.delete(this);
  }
}
