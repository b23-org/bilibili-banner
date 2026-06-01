export const GlMatrixCommon = {
  EPSILON: 1e-6,
  ARRAY_TYPE: Float32Array as typeof Float32Array,
};

export type Vec3Like = Float32Array;
export type Mat4Like = Float32Array;

export const Vec3 = {
  create(): Vec3Like {
    const out = new GlMatrixCommon.ARRAY_TYPE(3);
    if (GlMatrixCommon.ARRAY_TYPE !== Float32Array) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    }
    return out;
  },

  fromValues(x: number, y: number, z: number): Vec3Like {
    const out = new GlMatrixCommon.ARRAY_TYPE(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },

  set(out: Vec3Like, x: number, y: number, z: number): Vec3Like {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  },

  add(out: Vec3Like, a: Vec3Like, b: Vec3Like): Vec3Like {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
  },

  subtract(out: Vec3Like, a: Vec3Like, b: Vec3Like): Vec3Like {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
  },

  multiply(out: Vec3Like, a: Vec3Like, b: Vec3Like): Vec3Like {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
  },

  scale(out: Vec3Like, a: Vec3Like, n: number): Vec3Like {
    out[0] = a[0] * n;
    out[1] = a[1] * n;
    out[2] = a[2] * n;
    return out;
  },

  normalize(out: Vec3Like, a: Vec3Like): Vec3Like {
    const x = a[0];
    const y = a[1];
    const z = a[2];
    let len = x * x + y * y + z * z;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
    }
    out[0] = x * len;
    out[1] = y * len;
    out[2] = z * len;
    return out;
  },

  dot(a: Vec3Like, b: Vec3Like): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  },

  cross(out: Vec3Like, a: Vec3Like, b: Vec3Like): Vec3Like {
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
  },

  length(a: Vec3Like): number {
    return Math.hypot(a[0], a[1], a[2]);
  },

  rotate2D(
    out: Vec3Like,
    point: Vec3Like,
    center: Vec3Like,
    rad: number,
  ): Vec3Like {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const dz = point[2] - center[2];
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    out[0] = rx + center[0];
    out[1] = ry + center[1];
    out[2] = dz + center[2];
    return out;
  },

  randomSpherical(out: Vec3Like, scale = 1): Vec3Like {
    const u = Math.random() * 2 * Math.PI;
    const v = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - v * v) * scale;
    out[0] = Math.cos(u) * r;
    out[1] = Math.sin(u) * r;
    out[2] = v * scale;
    return out;
  },
};

export const Mat4 = {
  create(): Mat4Like {
    const out = new GlMatrixCommon.ARRAY_TYPE(16);
    if (GlMatrixCommon.ARRAY_TYPE !== Float32Array) {
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
    }
    out[0] = 1;
    out[5] = 1;
    out[10] = 1;
    out[15] = 1;
    return out;
  },

  multiply(out: Mat4Like, a: Mat4Like, b: Mat4Like): Mat4Like {
    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];
    const a30 = a[12],
      a31 = a[13],
      a32 = a[14],
      a33 = a[15];

    let b0 = b[0],
      b1 = b[1],
      b2 = b[2],
      b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4];
    b1 = b[5];
    b2 = b[6];
    b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8];
    b1 = b[9];
    b2 = b[10];
    b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12];
    b1 = b[13];
    b2 = b[14];
    b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },

  translate(out: Mat4Like, a: Mat4Like, v: Vec3Like): Mat4Like {
    const x = v[0],
      y = v[1],
      z = v[2];
    if (a === out) {
      out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
      out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
      out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
      const a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3];
      const a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];
      const a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];
      out[0] = a00;
      out[1] = a01;
      out[2] = a02;
      out[3] = a03;
      out[4] = a10;
      out[5] = a11;
      out[6] = a12;
      out[7] = a13;
      out[8] = a20;
      out[9] = a21;
      out[10] = a22;
      out[11] = a23;
      out[12] = a00 * x + a10 * y + a20 * z + a[12];
      out[13] = a01 * x + a11 * y + a21 * z + a[13];
      out[14] = a02 * x + a12 * y + a22 * z + a[14];
      out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }
    return out;
  },

  scale(out: Mat4Like, a: Mat4Like, v: Vec3Like): Mat4Like {
    const x = v[0],
      y = v[1],
      z = v[2];
    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
  },

  rotate(
    out: Mat4Like,
    a: Mat4Like,
    rad: number,
    axis: Vec3Like,
  ): Mat4Like | null {
    let x = axis[0],
      y = axis[1],
      z = axis[2];
    let len = Math.hypot(x, y, z);
    if (len < GlMatrixCommon.EPSILON) {
      return null;
    }
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    const s = Math.sin(rad);
    const c = Math.cos(rad);
    const t = 1 - c;

    const a00 = a[0],
      a01 = a[1],
      a02 = a[2],
      a03 = a[3];
    const a10 = a[4],
      a11 = a[5],
      a12 = a[6],
      a13 = a[7];
    const a20 = a[8],
      a21 = a[9],
      a22 = a[10],
      a23 = a[11];

    const b00 = x * x * t + c;
    const b01 = y * x * t + z * s;
    const b02 = z * x * t - y * s;
    const b10 = x * y * t - z * s;
    const b11 = y * y * t + c;
    const b12 = z * y * t + x * s;
    const b20 = x * z * t + y * s;
    const b21 = y * z * t - x * s;
    const b22 = z * z * t + c;

    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;
    if (a !== out) {
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
    }
    return out;
  },

  ortho(
    out: Mat4Like,
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ): Mat4Like {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },

  perspective(
    out: Mat4Like,
    fovy: number,
    aspect: number,
    near: number,
    far: number,
  ): Mat4Like {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[15] = 0;
    if (far !== null && far !== Infinity) {
      out[10] = -(far + near) / (far - near);
      out[14] = -(2 * far * near) / (far - near);
    } else {
      out[10] = -1;
      out[14] = -2 * near;
    }
    return out;
  },

  lookAt(
    out: Mat4Like,
    eye: Vec3Like,
    center: Vec3Like,
    up: Vec3Like,
  ): Mat4Like {
    let x0: number,
      x1: number,
      x2: number,
      y0: number,
      y1: number,
      y2: number,
      z0: number,
      z1: number,
      z2: number,
      len: number;
    const eyex = eye[0],
      eyey = eye[1],
      eyez = eye[2];
    const upx = up[0],
      upy = up[1],
      upz = up[2];
    const centerx = center[0],
      centery = center[1],
      centerz = center[2];

    if (
      Math.abs(eyex - centerx) < GlMatrixCommon.EPSILON &&
      Math.abs(eyey - centery) < GlMatrixCommon.EPSILON &&
      Math.abs(eyez - centerz) < GlMatrixCommon.EPSILON
    ) {
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = 1;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 1;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;
    len = Math.hypot(z0, z1, z2);
    if (len > 0) {
      len = 1 / len;
      z0 *= len;
      z1 *= len;
      z2 *= len;
    }

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.hypot(x0, x1, x2);
    if (len > 0) {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;
    len = Math.hypot(y0, y1, y2);
    if (len > 0) {
      len = 1 / len;
      y0 *= len;
      y1 *= len;
      y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;
    return out;
  },

  fromRotationTranslationScale(
    out: Mat4Like,
    q: Vec3Like,
    v: Vec3Like,
    s: Vec3Like,
  ): Mat4Like {
    const x = q[0],
      y = q[1],
      z = q[2],
      w = q[3];
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    const sx = s[0],
      sy = s[1],
      sz = s[2];

    out[0] = (1 - (yy + zz)) * sx;
    out[1] = (xy + wz) * sx;
    out[2] = (xz - wy) * sx;
    out[3] = 0;
    out[4] = (xy - wz) * sy;
    out[5] = (1 - (xx + zz)) * sy;
    out[6] = (yz + wx) * sy;
    out[7] = 0;
    out[8] = (xz + wy) * sz;
    out[9] = (yz - wx) * sz;
    out[10] = (1 - (xx + yy)) * sz;
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    return out;
  },

  getTranslation(out: Vec3Like, mat: Mat4Like): Vec3Like {
    out[0] = mat[12];
    out[1] = mat[13];
    out[2] = mat[14];
    return out;
  },

  getScaling(out: Vec3Like, mat: Mat4Like): Vec3Like {
    const m00 = mat[0],
      m01 = mat[1],
      m02 = mat[2];
    const m10 = mat[4],
      m11 = mat[5],
      m12 = mat[6];
    const m20 = mat[8],
      m21 = mat[9],
      m22 = mat[10];
    out[0] = Math.hypot(m00, m01, m02);
    out[1] = Math.hypot(m10, m11, m12);
    out[2] = Math.hypot(m20, m21, m22);
    return out;
  },
};
