import { waitForMedia } from "../helper";
import type { BannerExtension, BannerExtensionContext } from "./core";

const PETAL_TEXTURES = [
  "assets/extensions/petals/7d2825f4034bb8106d1ee1d9adcb04d1343ad404.png",
  "assets/extensions/petals/09ebd16b92ed9f96ae052300c4b3cbe450e4a274.png",
] as const;

// ── vec3 工具 ──
function vec3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

function vec3Dot(
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Cross(
  out: Float32Array | number[],
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): Float32Array | number[] {
  const ax = a[0],
    ay = a[1],
    az = a[2];
  const bx = b[0],
    by = b[1],
    bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

function vec3Normalize(
  out: Float32Array | number[],
  a: number[] | Float32Array,
): Float32Array | number[] {
  const len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  if (len > 0) {
    out[0] = a[0] / len;
    out[1] = a[1] / len;
    out[2] = a[2] / len;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}

function vec3Sub(
  out: Float32Array | number[],
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): Float32Array | number[] {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

function vec3Add(
  out: Float32Array | number[],
  a: number[] | Float32Array,
  b: number[] | Float32Array,
): Float32Array | number[] {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

// ── mat4 工具 ──
function mat4Perspective(
  out: Float32Array,
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

const _f = new Float32Array(3);
const _s = new Float32Array(3);
const _u = new Float32Array(3);

function mat4LookAt(
  out: Float32Array,
  eye: number[] | Float32Array,
  center: number[] | Float32Array,
  up: number[] | Float32Array,
): Float32Array {
  vec3Sub(_f, center, eye);
  vec3Normalize(_f, _f);
  vec3Cross(_s, _f, up);
  vec3Normalize(_s, _s);
  vec3Cross(_u, _s, _f);

  out[0] = _s[0];
  out[1] = _u[0];
  out[2] = -_f[0];
  out[3] = 0;
  out[4] = _s[1];
  out[5] = _u[1];
  out[6] = -_f[1];
  out[7] = 0;
  out[8] = _s[2];
  out[9] = _u[2];
  out[10] = -_f[2];
  out[11] = 0;
  out[12] = -vec3Dot(_s, eye);
  out[13] = -vec3Dot(_u, eye);
  out[14] = vec3Dot(_f, eye);
  out[15] = 1;
  return out;
}

// ── Camera ──
class Camera {
  position: Float32Array;
  private dir: Float32Array;
  private up: Float32Array;
  private fovy: number;
  private aspect = 1;

  private _viewMatrix = new Float32Array(16);
  private _projMatrix = new Float32Array(16);
  private _center = new Float32Array(3);

  constructor(
    position: [number, number, number],
    direction: [number, number, number],
    up: [number, number, number],
    fovy: number,
  ) {
    this.position = new Float32Array(position);
    this.dir = new Float32Array(direction);
    this.up = new Float32Array(up);
    this.fovy = fovy;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
  }

  getViewMatrix(): Float32Array {
    vec3Add(this._center, this.position, this.dir);
    return mat4LookAt(this._viewMatrix, this.position, this._center, this.up);
  }

  getProjectionMatrix(): Float32Array {
    return mat4Perspective(
      this._projMatrix,
      this.fovy,
      this.aspect,
      0.01,
      1000,
    );
  }
}

// ── 着色器工具 ──
function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`着色器编译失败: ${info}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
  varyings?: string[],
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  if (varyings && varyings.length > 0) {
    gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`着色器链接失败: ${info}`);
  }
  return program;
}

// ── 物理更新着色器 ──
const PHYSICS_VS = `#version 300 es
precision mediump float;

layout(location = 0) in vec3 i_Position;
layout(location = 1) in vec3 i_Velocity;
layout(location = 2) in float i_Life;
layout(location = 3) in float i_Age;

out vec3 o_Position;
out vec3 o_Velocity;
out float o_Life;
out float o_Age;

uniform vec3 u_OriginA;
uniform vec3 u_OriginB;
uniform vec3 u_Angle;
uniform float u_AngleRadius;
uniform vec2 u_SpeedRange;
uniform vec3 u_Gravity;
uniform uint u_Seed;

const float PI = 3.1415926;
const float DT = 16.0 / 1000.0;

uint wangHash(uint seed) {
  seed = (seed ^ 61u) ^ (seed >> 16u);
  seed *= 9u;
  seed = seed ^ (seed >> 4u);
  seed *= 0x27d4eb2du;
  seed = seed ^ (seed >> 15u);
  return seed;
}

float randFloat(uint seed) {
  return float(seed) * (1.0 / 4294967296.0);
}

vec3 randVec3U(uint seed) {
  return vec3(
    randFloat(seed),
    randFloat(wangHash(seed + 1u)),
    randFloat(wangHash(seed + 2u))
  );
}

vec3 rotateAroundAxis(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main() {
  uint seed = wangHash(uint(gl_VertexID) + u_Seed);

  if (i_Age >= i_Life) {
    o_Position = u_OriginA + (u_OriginB - u_OriginA) * randVec3U(seed);
    seed = wangHash(seed);

    float spd = u_SpeedRange.x + randFloat(seed) * (u_SpeedRange.y - u_SpeedRange.x);
    seed = wangHash(seed);

    // 在 Y 轴对齐的圆锥体内生成方向（官方均匀采样算法）
    float y = cos(u_AngleRadius) + (1.0 - cos(u_AngleRadius)) * randFloat(seed);
    seed = wangHash(seed);
    float phi = randFloat(seed) * 2.0 * PI;
    seed = wangHash(seed);

    vec3 dir = vec3(
      sqrt(1.0 - y*y) * cos(phi),
      y,
      sqrt(1.0 - y*y) * sin(phi)
    );

    // 从 Y 轴旋转到 u_Angle 方向
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 angleDir = normalize(u_Angle);
    float dotVal = dot(angleDir, up);
    if (dotVal < -0.999) {
      dir.y = -dir.y;
    } else if (dotVal < 0.999) {
      vec3 rotAxis = normalize(cross(angleDir, up));
      float rotAngle = acos(dotVal);
      dir = rotateAroundAxis(dir, rotAxis, rotAngle);
    }
    o_Velocity = normalize(dir) * spd;

    o_Life = i_Life;
    o_Age = 0.0;
  } else {
    o_Position = i_Position + i_Velocity * DT;
    o_Velocity = i_Velocity + u_Gravity * DT;
    o_Life = i_Life;
    o_Age = i_Age + DT;
  }
}`;

// ── 渲染顶点着色器 (Billboard) ──
const RENDER_VS = `#version 300 es
layout(location = 0) in vec3 i_Position;
layout(location = 1) in vec3 i_Velocity;
layout(location = 2) in float i_Life;
layout(location = 3) in float i_Age;
layout(location = 4) in vec2 i_Coord;

uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform vec2 u_Size;

out float v_Age;
out float v_Life;
out vec2 v_Uv;

void main() {
  vec3 right = vec3(u_ViewMatrix[0].x, u_ViewMatrix[1].x, u_ViewMatrix[2].x);
  vec3 up = vec3(u_ViewMatrix[0].y, u_ViewMatrix[1].y, u_ViewMatrix[2].y);

  vec3 pos = i_Position + right * i_Coord.x * u_Size.x + up * i_Coord.y * u_Size.y;

  v_Age = i_Age;
  v_Life = i_Life;
  v_Uv = (i_Coord + 1.0) / 2.0;
  gl_Position = u_ProjectionMatrix * u_ViewMatrix * vec4(pos, 1.0);
}`;

// ── 片段着色器 ──
const RENDER_FS = `#version 300 es
precision highp float;
in float v_Age;
in float v_Life;
in vec2 v_Uv;

uniform sampler2D u_Sprite;

out vec4 o_FragColor;

void main() {
  vec4 color = texture(u_Sprite, v_Uv);
  color.a *= 1.0 - pow(v_Age / v_Life, 6.0);
  o_FragColor = color;
}`;

// ── 空片段着色器 (TF pass) ──
const DUMMY_FS = `#version 300 es
precision highp float;
out vec4 unused;
void main() { unused = vec4(0.0); }`;

// ── 常量 ──
const PARTICLE_STRIDE = 8;
const PARTICLE_BYTES = PARTICLE_STRIDE * 4;

interface EmitterConfig {
  texture: HTMLImageElement;
  scale: number;
  numParticles: number;
  particleBirthRate: number;
  originA: [number, number, number];
  originB: [number, number, number];
  angle: [number, number, number];
  angleRadius: number;
  speedRange: [number, number];
  gravity: [number, number, number];
  ageRange: [number, number];
}

// ── ParticleEmitter ──
class ParticleEmitter {
  private gl: WebGL2RenderingContext;
  private config: EmitterConfig;
  private physicsProgram: WebGLProgram;
  private renderProgram: WebGLProgram;
  private buffers: [WebGLBuffer, WebGLBuffer];
  private vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readIndex = 0;
  private writeIndex = 1;
  private renderVao: WebGLVertexArrayObject;
  private quadBuffer: WebGLBuffer;
  private texture: WebGLTexture;
  private birthAccum = 0;
  private activeParticles = 0;
  private seed = 0;

  private physicsUniforms: Record<string, WebGLUniformLocation | null>;
  private renderUniforms: Record<string, WebGLUniformLocation | null>;

  constructor(
    gl: WebGL2RenderingContext,
    physicsProgram: WebGLProgram,
    renderProgram: WebGLProgram,
    config: EmitterConfig,
  ) {
    this.gl = gl;
    this.config = config;
    this.physicsProgram = physicsProgram;
    this.renderProgram = renderProgram;
    this.activeParticles = 0;

    // 创建粒子数据缓冲区
    this.buffers = [gl.createBuffer()!, gl.createBuffer()!];
    const data = new Float32Array(config.numParticles * PARTICLE_STRIDE);
    for (let i = 0; i < config.numParticles; i++) {
      const life =
        config.ageRange[0] +
        Math.random() * (config.ageRange[1] - config.ageRange[0]);
      data[i * PARTICLE_STRIDE + 6] = life; // life (随机一次，持久化)
      data[i * PARTICLE_STRIDE + 7] = life + 1; // age (立即死亡，触发重生)
    }

    for (const buf of this.buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_COPY);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }

    // 创建物理 VAO（双缓冲）
    this.vaos = [
      this.createPhysicsVAO(this.buffers[0]),
      this.createPhysicsVAO(this.buffers[1]),
    ];

    // 创建 Render VAO 和 Quad 缓冲区
    this.renderVao = this.createRenderVAO();
    this.quadBuffer = this.createQuadBuffer();

    // 创建纹理
    this.texture = this.createTexture(config.texture);

    this.physicsUniforms = {
      u_OriginA: gl.getUniformLocation(physicsProgram, "u_OriginA"),
      u_OriginB: gl.getUniformLocation(physicsProgram, "u_OriginB"),
      u_Angle: gl.getUniformLocation(physicsProgram, "u_Angle"),
      u_AngleRadius: gl.getUniformLocation(physicsProgram, "u_AngleRadius"),
      u_SpeedRange: gl.getUniformLocation(physicsProgram, "u_SpeedRange"),
      u_Gravity: gl.getUniformLocation(physicsProgram, "u_Gravity"),
      u_Seed: gl.getUniformLocation(physicsProgram, "u_Seed"),
    };

    this.renderUniforms = {
      u_ViewMatrix: gl.getUniformLocation(renderProgram, "u_ViewMatrix"),
      u_ProjectionMatrix: gl.getUniformLocation(
        renderProgram,
        "u_ProjectionMatrix",
      ),
      u_Size: gl.getUniformLocation(renderProgram, "u_Size"),
      u_Sprite: gl.getUniformLocation(renderProgram, "u_Sprite"),
    };
  }

  private createPhysicsVAO(buffer: WebGLBuffer): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    const stride = 32;
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      const size = i < 2 ? 3 : 1;
      const offset = i < 2 ? i * 12 : 24 + (i - 2) * 4;
      gl.vertexAttribPointer(i, size, gl.FLOAT, false, stride, offset);
    }

    return vao;
  }

  private createRenderVAO(): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(4);
    return vao;
  }

  private createQuadBuffer(): WebGLBuffer {
    const gl = this.gl;
    const quadVerts = new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1, // triangle 1
      -1,
      1,
      1,
      -1,
      1,
      1, // triangle 2
    ]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    return buf;
  }

  private createTexture(image: HTMLImageElement): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  updatePhysics(): void {
    const gl = this.gl;
    const cfg = this.config;

    this.birthAccum += cfg.particleBirthRate / 60;
    const newParticles = Math.floor(this.birthAccum);
    this.birthAccum -= newParticles;
    this.activeParticles = Math.min(
      cfg.numParticles,
      this.activeParticles + newParticles,
    );

    if (this.activeParticles > 0) {
      gl.useProgram(this.physicsProgram);
      gl.uniform3fv(this.physicsUniforms.u_OriginA, cfg.originA);
      gl.uniform3fv(this.physicsUniforms.u_OriginB, cfg.originB);
      gl.uniform3fv(this.physicsUniforms.u_Angle, cfg.angle);
      gl.uniform1f(this.physicsUniforms.u_AngleRadius, cfg.angleRadius);
      gl.uniform2fv(this.physicsUniforms.u_SpeedRange, cfg.speedRange);
      gl.uniform3fv(this.physicsUniforms.u_Gravity, cfg.gravity);
      gl.uniform1ui(this.physicsUniforms.u_Seed, this.seed++);

      gl.bindVertexArray(this.vaos[this.readIndex]);
      gl.bindBufferBase(
        gl.TRANSFORM_FEEDBACK_BUFFER,
        0,
        this.buffers[this.writeIndex],
      );
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.activeParticles);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    }

    [this.readIndex, this.writeIndex] = [this.writeIndex, this.readIndex];
  }

  render(viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    const gl = this.gl;
    const cfg = this.config;

    gl.useProgram(this.renderProgram);
    gl.uniformMatrix4fv(this.renderUniforms.u_ViewMatrix, false, viewMatrix);
    gl.uniformMatrix4fv(
      this.renderUniforms.u_ProjectionMatrix,
      false,
      projectionMatrix,
    );
    gl.uniform2f(
      this.renderUniforms.u_Size,
      (cfg.scale * cfg.texture.naturalWidth) / 1000,
      (cfg.scale * cfg.texture.naturalHeight) / 1000,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.renderUniforms.u_Sprite, 0);

    gl.bindVertexArray(this.renderVao);

    // 属性 4：Quad 顶点 (per-vertex, divisor=0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 0);

    // 属性 0-3：粒子数据 (per-instance, divisor=1)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.readIndex]);
    const stride = PARTICLE_BYTES;
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(i);
      if (i < 2) {
        gl.vertexAttribPointer(i, 3, gl.FLOAT, false, stride, i * 12);
      } else {
        gl.vertexAttribPointer(i, 1, gl.FLOAT, false, stride, 24 + (i - 2) * 4);
      }
      gl.vertexAttribDivisor(i, 1);
    }

    if (this.activeParticles > 0) {
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.activeParticles);
    }

    for (let i = 0; i < 4; i++) {
      gl.vertexAttribDivisor(i, 0);
    }
  }

  dispose(): void {
    // 资源由 PetalsParticleSystem.destroy() 统一释放
  }
}

// ── PetalsParticleSystem ──
export class PetalsParticleSystem {
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private camera: Camera | null = null;
  private emitters: ParticleEmitter[] = [];
  private textures: HTMLImageElement[] = [];
  private rafId = 0;
  private recoveryRafId = 0;
  private dpr = 1;

  private currentDisplacement = 0;
  private isHovering = false;
  private destroyed = false;
  private started = false;

  private physicsProgram: WebGLProgram | null = null;
  private renderProgram: WebGLProgram | null = null;

  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseEnter: () => void;
  private readonly boundMouseLeave: () => void;
  private readonly boundResize: () => void;
  private readonly boundBlur: () => void;
  private readonly boundFocus: () => void;

  constructor() {
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseEnter = this.handleMouseEnter.bind(this);
    this.boundMouseLeave = this.handleMouseLeave.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.boundFocus = this.handleFocus.bind(this);
  }

  async start(
    container: HTMLElement,
    srcs: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const textures = await this.loadTextures(srcs, signal);
    await this.startWithTextures(container, textures, signal);
  }

  async startWithTextures(
    container: HTMLElement,
    textures: HTMLImageElement[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (!container || this.destroyed || signal?.aborted) return;
    this.container = container;
    this.dpr = window.devicePixelRatio || 1;

    try {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "particle-canvas";
      container.appendChild(this.canvas);

      const gl = this.canvas.getContext("webgl2", {
        premultipliedAlpha: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) {
        console.warn("[PetalsParticleSystem] WebGL2 不可用，跳过花瓣效果");
        this.destroy();
        return;
      }
      this.gl = gl;

      this.textures = textures;
      if (this.destroyed || signal?.aborted) return;

      this.resizeCanvas();
      this.initGL();
      this.createEmitters();
      this.bindEvents();
      this.startLoop();
      this.started = true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      console.warn("[PetalsParticleSystem] 初始化失败 (非致命):", e);
      this.destroy();
    }
  }

  private async loadTextures(
    srcs: string[],
    signal?: AbortSignal,
  ): Promise<HTMLImageElement[]> {
    return Promise.all(
      srcs.map(async (src) => {
        const img = new Image();
        img.crossOrigin = "";
        img.src = src;
        await waitForMedia(img, signal);
        return img;
      }),
    );
  }

  private initGL(): void {
    const gl = this.gl!;
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const vsPhysics = compileShader(gl, gl.VERTEX_SHADER, PHYSICS_VS);
    const vsRender = compileShader(gl, gl.VERTEX_SHADER, RENDER_VS);
    const fsRender = compileShader(gl, gl.FRAGMENT_SHADER, RENDER_FS);
    const fsDummy = compileShader(gl, gl.FRAGMENT_SHADER, DUMMY_FS);

    this.physicsProgram = createProgram(gl, vsPhysics, fsDummy, [
      "o_Position",
      "o_Velocity",
      "o_Life",
      "o_Age",
    ]);
    this.renderProgram = createProgram(gl, vsRender, fsRender);

    const w = this.canvas!.width / this.dpr;
    const h = this.canvas!.height / this.dpr;
    this.camera = new Camera(
      vec3(0, 0, 5),
      vec3(0, 0, -1),
      vec3(0, 1, 0),
      Math.PI / 4,
    );
    this.camera.setAspect(w / (h || 1));

    gl.deleteShader(vsPhysics);
    gl.deleteShader(vsRender);
    gl.deleteShader(fsRender);
    gl.deleteShader(fsDummy);
  }

  private createEmitters(): void {
    const gl = this.gl!;
    const tex0 = this.textures[0];
    const tex1 = this.textures[1] || tex0;

    if (!tex0) return;

    const baseConfig = {
      numParticles: 100,
      particleBirthRate: 10,
      originA: vec3(50, 6, -6) as [number, number, number],
      originB: vec3(-50, 6, 2) as [number, number, number],
      angle: vec3(0, -1, 0) as [number, number, number],
      angleRadius: Math.PI / 8,
      ageRange: [8, 10] as [number, number],
    };

    this.emitters = [
      new ParticleEmitter(gl, this.physicsProgram!, this.renderProgram!, {
        ...baseConfig,
        texture: tex0,
        scale: 1.18,
        speedRange: [2, 2.5],
        gravity: vec3(1.4, -0.1, 0) as [number, number, number],
      }),
      new ParticleEmitter(gl, this.physicsProgram!, this.renderProgram!, {
        ...baseConfig,
        texture: tex1,
        scale: 1.18,
        speedRange: [2, 3],
        gravity: vec3(1.2, -0.1, 0) as [number, number, number],
      }),
    ];
  }

  private startLoop(): void {
    const loop = () => {
      if (this.destroyed) return;
      this.renderFrame();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private renderFrame(): void {
    const gl = this.gl;
    const camera = this.camera;
    if (!gl || !camera) return;

    camera.position[0] = 50 * this.currentDisplacement;
    const viewMatrix = camera.getViewMatrix();
    const projectionMatrix = camera.getProjectionMatrix();

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    for (const emitter of this.emitters) {
      emitter.updatePhysics();
      emitter.render(viewMatrix, projectionMatrix);
    }
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.container) return;
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    if (this.camera && w > 0 && h > 0) {
      this.camera.setAspect(w / h);
    }

    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private bindEvents(): void {
    if (!this.container) return;
    this.container.addEventListener("mousemove", this.boundMouseMove);
    this.container.addEventListener("mouseenter", this.boundMouseEnter);
    this.container.addEventListener("mouseleave", this.boundMouseLeave);
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("blur", this.boundBlur);
    window.addEventListener("focus", this.boundFocus);
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.container || !this.isHovering) return;
    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    this.currentDisplacement = x * 2 - 1;
  }

  private handleMouseEnter(): void {
    this.isHovering = true;
    cancelAnimationFrame(this.recoveryRafId);
  }

  private handleMouseLeave(): void {
    this.isHovering = false;
    const startTime = performance.now();
    const startDisplacement = this.currentDisplacement;

    const smooth = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < 200) {
        this.currentDisplacement = startDisplacement * (1 - elapsed / 200);
        this.recoveryRafId = requestAnimationFrame(smooth);
      } else {
        this.currentDisplacement = 0;
      }
    };
    this.recoveryRafId = requestAnimationFrame(smooth);
  }

  private handleResize(): void {
    this.resizeCanvas();
  }

  private handleBlur(): void {
    cancelAnimationFrame(this.rafId);
    this.started = false;
  }

  private handleFocus(): void {
    if (!this.started) {
      this.started = true;
      this.startLoop();
    }
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    cancelAnimationFrame(this.recoveryRafId);

    if (this.container) {
      this.container.removeEventListener("mousemove", this.boundMouseMove);
      this.container.removeEventListener("mouseenter", this.boundMouseEnter);
      this.container.removeEventListener("mouseleave", this.boundMouseLeave);
    }
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("blur", this.boundBlur);
    window.removeEventListener("focus", this.boundFocus);

    if (this.gl) {
      const ext = this.gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    }
    this.canvas?.remove();
    this.canvas = null;
    this.gl = null;
    this.container = null;
    this.emitters = [];
    this.physicsProgram = null;
    this.renderProgram = null;

    for (const img of this.textures) {
      img.removeAttribute("src");
    }
    this.textures = [];
  }
}

function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2"));
  } catch (_e) {
    return false;
  }
}

export default class PetalsExtension implements BannerExtension {
  private textures: HTMLImageElement[] = [];
  private system: PetalsParticleSystem | null = null;

  private disposeSystem(): void {
    this.system?.destroy();
    this.system = null;
  }

  async prepare(_context: BannerExtensionContext): Promise<boolean> {
    if (!isWebGL2Supported()) {
      console.warn("[PetalsExtension] WebGL2 not available, skipping petals.");
      return false;
    }

    this.textures = await Promise.all(
      PETAL_TEXTURES.map(async (src) => {
        const img = new Image();
        img.crossOrigin = "";
        img.src = src;
        await waitForMedia(img, _context.signal);
        return img;
      }),
    );
    return true;
  }

  async mount(context: BannerExtensionContext): Promise<void> {
    this.disposeSystem();

    const system = new PetalsParticleSystem();
    this.system = system;
    await system.startWithTextures(
      context.bannerEl,
      this.textures,
      context.signal,
    );
  }

  dispose(): void {
    this.disposeSystem();
    for (const texture of this.textures) {
      texture.removeAttribute("src");
    }
    this.textures = [];
  }
}
