import { Mat4, type Mat4Like, Vec3, type Vec3Like } from "./math";
import type { WebGLRenderable } from "./webgl-renderer";

const updateSubtreeTransforms = (node: SceneNode) => {
  Mat4.multiply(node.tempTransform, node.parentTransform, node.modelMatrix);
  node.children.forEach((child) => {
    updateSubtreeTransforms(child);
  });
};

const executeRecursiveUpdate = (node: SceneNode) => {
  node.update();
  node.children.forEach((child) => {
    executeRecursiveUpdate(child);
  });
};

export class SceneNode {
  readonly children: SceneNode[] = [];
  readonly modelMatrix: Mat4Like = Mat4.create();
  readonly tempTransform: Mat4Like = Mat4.create();
  parentTransform: Mat4Like = Mat4.create();
  private _position: Vec3Like = Vec3.create();
  private _scaling: Vec3Like = Vec3.fromValues(1, 1, 1);
  rotation = 0;

  constructor(public object?: WebGLRenderable) {}

  addChild(child: SceneNode): void {
    this.children.push(child);
    child.parentTransform = this.tempTransform;
    updateSubtreeTransforms(child);
  }

  translate(vec: number[]): void {
    const v = Vec3.fromValues(vec[0], vec[1], vec[2]);
    Mat4.translate(this.modelMatrix, this.modelMatrix, v);
    this._position[0] += vec[0];
    this._position[1] += vec[1];
    this._position[2] += vec[2];
    this.updateTransform();
  }

  scale(vec: number[]): void {
    const v = Vec3.fromValues(vec[0], vec[1], vec[2]);
    Mat4.scale(this.modelMatrix, this.modelMatrix, v);
    this._scaling[0] *= vec[0];
    this._scaling[1] *= vec[1];
    this._scaling[2] *= vec[2];
    this.updateTransform();
  }

  rotate(rad: number, axis: number[]): void {
    const v = Vec3.fromValues(axis[0], axis[1], axis[2]);
    Mat4.rotate(this.modelMatrix, this.modelMatrix, rad, v);
    this.rotation += rad;
    this.updateTransform();
  }

  get position(): Vec3Like {
    return this._position;
  }

  set position(value: Vec3Like) {
    this._position = value;
    Mat4.fromRotationTranslationScale(
      this.modelMatrix,
      [
        0,
        0,
        Math.sin(this.rotation / 2),
        Math.cos(this.rotation / 2),
      ] as unknown as Vec3Like,
      value,
      this.scaling,
    );
    updateSubtreeTransforms(this);
  }

  get scaling(): Vec3Like {
    return this._scaling;
  }

  set scaling(value: Vec3Like) {
    this._scaling = value;
    Mat4.fromRotationTranslationScale(
      this.modelMatrix,
      [
        0,
        0,
        Math.sin(this.rotation / 2),
        Math.cos(this.rotation / 2),
      ] as unknown as Vec3Like,
      this.position,
      value,
    );
    updateSubtreeTransforms(this);
  }

  updateTransform(): void {
    updateSubtreeTransforms(this);
  }

  update(): void {}

  updateRecursive(): void {
    executeRecursiveUpdate(this);
  }

  clear(): void {
    this.children.length = 0;
  }

  destroy(): void {
    this.object?.destroy();
    this.children.forEach((child) => {
      child.destroy();
    });
    this.clear();
  }
}

export class Camera {
  private _position: Vec3Like;
  private _direction: Vec3Like;
  private _up: Vec3Like;
  readonly viewMatrix = Mat4.create();
  readonly projectionMatrix = Mat4.create();
  readonly viewProjection = Mat4.create();
  private tempDir = Vec3.create();
  private orthographic: boolean;
  private width: number;
  private height: number;
  private near: number;
  private far: number;

  constructor(options: {
    position: number[];
    direction?: number[];
    up?: number[];
    width: number;
    height: number;
    orthographic?: boolean;
    near?: number;
    far?: number;
  }) {
    this._position = Vec3.fromValues(
      options.position[0],
      options.position[1],
      options.position[2],
    );
    this._direction = Vec3.fromValues(
      options.direction?.[0] ?? 0,
      options.direction?.[1] ?? 0,
      options.direction?.[2] ?? -1,
    );
    this._up = Vec3.fromValues(
      options.up?.[0] ?? 0,
      options.up?.[1] ?? 1,
      options.up?.[2] ?? 0,
    );
    this.orthographic = options.orthographic ?? false;
    this.width = options.width;
    this.height = options.height;
    this.near = options.near ?? -1000;
    this.far = options.far ?? 1000;

    this.getProjectionMatrix();
    this.updateViewProjection();
  }

  updateViewMatrix(): void {
    Vec3.add(this.tempDir, this._position, this._direction);
    Mat4.lookAt(this.viewMatrix, this._position, this.tempDir, this._up);
  }

  updateViewProjection(): void {
    this.updateViewMatrix();
    Mat4.multiply(this.viewProjection, this.projectionMatrix, this.viewMatrix);
  }

  get position(): Vec3Like {
    return this._position;
  }

  set position(value: Vec3Like) {
    this._position = value;
    this.updateViewProjection();
  }

  get direction(): Vec3Like {
    return this._direction;
  }

  set direction(value: Vec3Like) {
    this._direction = value;
    this.updateViewProjection();
  }

  get up(): Vec3Like {
    return this._up;
  }

  set up(value: Vec3Like) {
    this._up = value;
    this.updateViewProjection();
  }

  getProjectionMatrix(): Mat4Like {
    if (this.orthographic) {
      const halfW = this.width / 2;
      const halfH = this.height / 2;
      return Mat4.ortho(
        this.projectionMatrix,
        -halfW,
        halfW,
        -halfH,
        halfH,
        this.near,
        this.far,
      );
    }
    return this.projectionMatrix;
  }
}
