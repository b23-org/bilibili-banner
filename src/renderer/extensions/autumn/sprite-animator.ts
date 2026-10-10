import * as THREE from "three";

interface AsepriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  duration: number;
}

interface AsepriteFrameTag {
  name: string;
  from: number;
  to: number;
  direction: string;
}

export interface AsepriteData {
  frames: AsepriteFrame[] | Record<string, AsepriteFrame>;
  meta: {
    size: { w: number; h: number };
    frameTags: AsepriteFrameTag[];
  };
}

export interface SpriteAnimationController {
  name: string;
  /** 每帧更新帧进度，自动循环 */
  update(deltaTime: number): void;
  /** 单次播放（播放到末尾自动停止并回到第 0 帧），返回 Promise 在播放完成时 resolve */
  playOnce(): Promise<void>;
  /** 跳转到指定帧号（从 tag.from 偏移） */
  setFrame(frameIndex: number): void;
  /** 获取当前帧号 */
  getCurrentFrame(): number;
  /** 获取总帧数 */
  getFrameCount(): number;
}

export interface SpriteAnimationInstance {
  instance: THREE.Mesh;
  animations: SpriteAnimationController[];
  dispose(): void;
}

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform sampler2D sprite;
uniform vec4 sprite_box;
uniform vec4 sprite_position;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  uv.y = 1. - uv.y;
  if(uv.x < sprite_box.x || uv.x > (sprite_box.x + sprite_box.z) || uv.y < sprite_box.y || uv.y > (sprite_box.y + sprite_box.w)) {
    discard;
  } else {
    vec2 luv = vec2((uv.x - sprite_box.x)/sprite_box.z, (uv.y - sprite_box.y)/sprite_box.w);
    vec2 suv = vec2(sprite_position.x + luv.x * sprite_position.z, sprite_position.y + luv.y * sprite_position.w);
    gl_FragColor = texture(sprite, suv);
  }
}`;

/**
 * 从 Aseprite 格式的精灵图和 JSON 帧数据创建动画实例。
 *
 * 与官方 _c 函数逻辑完全一致：
 * - texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace
 * - 使用 ShaderMaterial（lights: false, transparent: true）
 * - uniforms: sprite (sampler2D), sprite_box (vec4), sprite_position (vec4)
 * - sprite_box 基于 spriteSourceSize 做子区域裁剪
 * - sprite_position 基于 frame 坐标做纹理采样映射
 * - 每个 frameTag 生成一个 SpriteAnimationController
 * - playOnce() 在动画循环到最后一帧时 resolve
 */
export function createSpriteAnimator(
  texture: THREE.Texture,
  jsonData: AsepriteData,
): SpriteAnimationInstance {
  // 官方实现: e.flipY = !1, e.encoding = D (sRGBEncoding)
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const frames: AsepriteFrame[] = Array.isArray(jsonData.frames)
    ? jsonData.frames
    : Object.values(jsonData.frames);

  const sheetSize = [jsonData.meta.size.w, jsonData.meta.size.h];

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    lights: false,
    transparent: true,
    uniforms: {
      sprite: { value: texture },
      sprite_box: { value: [0, 0, 1, 1] },
      sprite_position: { value: [0, 0, 1, 1] },
    },
    vertexShader,
    fragmentShader,
  });

  const mesh = new THREE.Mesh(geometry, material);

  /**
   * 更新 sprite_box 和 sprite_position uniform，对应官方函数 o(t, e)
   * @param tag - frameTag 对象
   * @param frameIndex - 在 tag 内的帧偏移
   */
  const applyFrame = (tag: AsepriteFrameTag, frameIndex: number): void => {
    const frameData = frames[tag.from + frameIndex];
    const { frame, spriteSourceSize, sourceSize } = frameData;

    // sprite_box: 基于 spriteSourceSize 在 PlaneGeometry UV 空间中的裁剪区域
    material.uniforms.sprite_box.value = [
      spriteSourceSize.x / sourceSize.w,
      spriteSourceSize.y / sourceSize.h,
      spriteSourceSize.w / sourceSize.w,
      spriteSourceSize.h / sourceSize.h,
    ];

    // sprite_position: 基于 frame 在纹理 sheet 中的采样坐标
    material.uniforms.sprite_position.value = [
      frame.x / sheetSize[0],
      frame.y / sheetSize[1],
      frame.w / sheetSize[0],
      frame.h / sheetSize[1],
    ];
  };

  // 基于 frameTags 创建多个 animation controller
  const animations: SpriteAnimationController[] = jsonData.meta.frameTags.map(
    (tag) => {
      const frameCount = tag.to - tag.from + 1;

      // 构建累积时间阈值数组（单位：秒）
      const cumulativeTimes = new Array<number>(frameCount);
      for (let i = 0; i < frameCount; i++) {
        cumulativeTimes[i] =
          (cumulativeTimes[i - 1] || 0) + frames[tag.from + i].duration / 1000;
      }

      const state = { t: 0, currentFrame: 0 };
      let playOnceResolve: (() => void) | null = null;

      return {
        name: tag.name,

        update(deltaTime: number): void {
          // 官方逻辑：先检查是否超过当前帧的累积时间阈值
          if (state.t > cumulativeTimes[state.currentFrame]) {
            state.currentFrame += 1;
            if (state.currentFrame >= frameCount) {
              // 循环回到第 0 帧
              if (playOnceResolve) {
                playOnceResolve();
                playOnceResolve = null;
              }
              state.currentFrame = 0;
              state.t = 0;
            }
            applyFrame(tag, state.currentFrame);
          }
          // 累积时间
          state.t += deltaTime;
        },

        playOnce(): Promise<void> {
          return new Promise<void>((resolve) => {
            playOnceResolve = resolve;
          });
        },

        setFrame(frameIndex: number): void {
          state.currentFrame = frameIndex;
          state.t = 0;
          applyFrame(tag, frameIndex);
        },

        getCurrentFrame(): number {
          return state.currentFrame;
        },

        getFrameCount(): number {
          return frameCount;
        },
      };
    },
  );

  // 初始化第一帧
  if (animations.length > 0 && jsonData.meta.frameTags.length > 0) {
    applyFrame(jsonData.meta.frameTags[0], 0);
  }

  return {
    instance: mesh,
    animations,
    dispose(): void {
      material.dispose();
      texture.dispose();
      geometry.dispose();
    },
  };
}
