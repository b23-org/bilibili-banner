export type SpringEnvCheckResult = {
  ok: boolean;
  failed: string[];
};

function supportsPixelatedRendering(): boolean {
  if (typeof CSS !== "undefined" && CSS.supports) {
    return CSS.supports("image-rendering", "pixelated");
  }
  const el = document.createElement("div");
  el.style.imageRendering = "pixelated";
  document.body.appendChild(el);
  const ok = getComputedStyle(el).imageRendering === "pixelated";
  el.remove();
  return ok;
}

export function checkSpringEnvironment(): SpringEnvCheckResult {
  const failed: string[] = [];
  if (!document.createElement("canvas").getContext("webgl2")) {
    failed.push("webgl2");
  }
  if (!document.createElement("div").attachShadow) {
    failed.push("shadowDom");
  }
  if (!supportsPixelatedRendering()) {
    failed.push("cssPixelated");
  }
  return { ok: failed.length === 0, failed };
}
