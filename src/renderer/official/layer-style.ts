import type { LayersOfficial2021, WrappableProperty } from "../../types";
import type { EasingFunction } from "./bezier-easing";
import { IDENTITY_EASING, makeSymmetricCurve } from "./bezier-easing";

type CurveConfigurable = { offsetCurve?: [number, number, number, number] };

export function resolveCurve(
  prop: CurveConfigurable | undefined,
): EasingFunction {
  return prop?.offsetCurve
    ? makeSymmetricCurve(prop.offsetCurve)
    : IDENTITY_EASING;
}

export function resolveBlurValue(
  initial: number,
  offset: number,
  curve: EasingFunction,
  normalizedDisplacementX: number,
  prop?: WrappableProperty,
): number {
  const value = initial + offset * curve(normalizedDisplacementX);
  if (!prop?.wrap || prop.wrap === "clamp") {
    return Math.max(0, value);
  }
  return Math.abs(value);
}

export function resolveOpacityValue(
  initial: number,
  offset: number,
  curve: EasingFunction,
  normalizedDisplacementX: number,
  prop?: WrappableProperty,
): number {
  const value = initial + offset * curve(normalizedDisplacementX);
  if (!prop?.wrap || prop.wrap === "clamp") {
    return Math.max(0, Math.min(1, value));
  }
  let foldedOpacity = Math.abs(value % 1);
  if (Math.abs(value % 2) >= 1) foldedOpacity = 1 - foldedOpacity;
  return foldedOpacity;
}

export interface LayerCurves {
  scale: EasingFunction;
  rotate: EasingFunction;
  translate: EasingFunction;
  blur: EasingFunction;
  opacity: EasingFunction;
}

export function createLayerCurves(layer: LayersOfficial2021): LayerCurves {
  return {
    scale: resolveCurve(layer.scale),
    rotate: resolveCurve(layer.rotate),
    translate: resolveCurve(layer.translate),
    blur: resolveCurve(layer.blur),
    opacity: resolveCurve(layer.opacity),
  };
}

export function computeLayerStyle(
  layer: LayersOfficial2021,
  curves: LayerCurves,
  dx: number,
  heightScale: number,
): { transform: string; filter: string; opacity: string } {
  const initialScale = layer.scale?.initial ?? 1;
  const initialRotate = layer.rotate?.initial ?? 0;
  const initialTranslateX = layer.translate?.initial?.[0] ?? 0;
  const initialTranslateY = layer.translate?.initial?.[1] ?? 0;

  // scale
  const scale = 1 + (layer.scale?.offset ?? 0) * curves.scale(dx);

  // rotate
  const rotate =
    initialRotate + (layer.rotate?.offset ?? 0) * curves.rotate(dx);

  // translate
  const translateOffsetX = layer.translate?.offset?.[0] ?? 0;
  const translateOffsetY = layer.translate?.offset?.[1] ?? 0;
  const tx =
    (initialTranslateX + translateOffsetX * curves.translate(dx)) *
    heightScale *
    initialScale;
  const ty =
    (initialTranslateY + translateOffsetY * curves.translate(dx)) *
    heightScale *
    initialScale;

  const transform = `translate(${tx}px, ${ty}px) rotate(${rotate}deg) scale(${scale})`;

  // blur
  let filter = "";
  if (layer.blur) {
    const blur = resolveBlurValue(
      layer.blur.initial ?? 0,
      layer.blur.offset ?? 0,
      curves.blur,
      dx,
      layer.blur,
    );
    filter = blur < 0.0001 ? "" : `blur(${blur}px)`;
  }

  // opacity
  let opacity = "";
  if (layer.opacity) {
    const op = resolveOpacityValue(
      layer.opacity.initial ?? 1,
      layer.opacity.offset ?? 0,
      curves.opacity,
      dx,
      layer.opacity,
    );
    opacity = String(op);
  }

  return { transform, filter, opacity };
}
