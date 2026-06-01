const BASE = "/assets/extensions/spring/";

type AssetType = "image" | "atlas" | "font";
type AssetItem = { type: AssetType; src: string; fontName?: string };
type AssetValue = HTMLImageElement | unknown | FontFace;

const ASSETS = {
  fontVonwaon: {
    type: "font",
    src: `${BASE}font/VonwaonBitmap-12px.woff2`,
    fontName: "Vonwaon",
  },
  fontShareText: {
    type: "font",
    src: `${BASE}font/eg3s0Wl9p3.ttf`,
    fontName: "FZLanTYJW",
  },
  fontShareScore: {
    type: "font",
    src: `${BASE}font/cKILLYSZ6K.ttf`,
    fontName: "HighPixel7",
  },
  sprite22: { type: "image", src: `${BASE}sprite/22.png` },
  sprite22Atlas: { type: "atlas", src: `${BASE}sprite/22.json` },
  sprite33: { type: "image", src: `${BASE}sprite/33.png` },
  sprite33Atlas: { type: "atlas", src: `${BASE}sprite/33.json` },
  count: { type: "image", src: `${BASE}sprite/count.png` },
  countAtlas: { type: "atlas", src: `${BASE}sprite/count.json` },
  sky: { type: "image", src: `${BASE}sprite/background/sky.png` },
  mountain: { type: "image", src: `${BASE}sprite/background/mountain.png` },
  clouds: { type: "image", src: `${BASE}sprite/background/clouds.png` },
  near: { type: "image", src: `${BASE}sprite/background/near.png` },
  space: { type: "image", src: `${BASE}sprite/background/space.png` },
  shamrock1: { type: "image", src: `${BASE}sprite/shamrocks/shamrock1.png` },
  shamrock1Atlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock1.json`,
  },
  shamrock2: { type: "image", src: `${BASE}sprite/shamrocks/shamrock2.png` },
  shamrock2Atlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock2.json`,
  },
  shamrock3: { type: "image", src: `${BASE}sprite/shamrocks/shamrock3.png` },
  shamrock3Atlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock3.json`,
  },
  shamrock4: { type: "image", src: `${BASE}sprite/shamrocks/shamrock4.png` },
  shamrock4Atlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock4.json`,
  },
  shamrockTrap: {
    type: "image",
    src: `${BASE}sprite/shamrocks/shamrock_trap.png`,
  },
  shamrockTrapAtlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock_trap.json`,
  },
  shamrockLucky: {
    type: "image",
    src: `${BASE}sprite/shamrocks/shamrock_lucky.png`,
  },
  shamrockLuckyAtlas: {
    type: "atlas",
    src: `${BASE}sprite/shamrocks/shamrock_lucky.json`,
  },
  leaves1: { type: "image", src: `${BASE}sprite/leaves/leaves1.png` },
  leaves2: { type: "image", src: `${BASE}sprite/leaves/leaves2.png` },
  leaves3: { type: "image", src: `${BASE}sprite/leaves/leaves3.png` },
  leaves4: { type: "image", src: `${BASE}sprite/leaves/leaves4.png` },
  wind1: { type: "image", src: `${BASE}sprite/wind/wind1.png` },
  wind1Atlas: { type: "atlas", src: `${BASE}sprite/wind/wind1.json` },
  wind2: { type: "image", src: `${BASE}sprite/wind/wind2.png` },
  wind2Atlas: { type: "atlas", src: `${BASE}sprite/wind/wind2.json` },
  wind3: { type: "image", src: `${BASE}sprite/wind/wind3.png` },
  wind3Atlas: { type: "atlas", src: `${BASE}sprite/wind/wind3.json` },
  wind4: { type: "image", src: `${BASE}sprite/wind/wind4.png` },
  wind4Atlas: { type: "atlas", src: `${BASE}sprite/wind/wind4.json` },
  bird: { type: "image", src: `${BASE}sprite/bird/bird.png` },
  birdAtlas: { type: "atlas", src: `${BASE}sprite/bird/bird.json` },
  numbers2: { type: "image", src: `${BASE}sprite/bird/numbers2.png` },
  guideBubble: { type: "image", src: `${BASE}guide/bubble.png` },
  guideBubbleOption: { type: "image", src: `${BASE}guide/bubble_option.png` },
  guideEndCover: { type: "image", src: `${BASE}guide/end_cover.png` },
  guideShareBg: { type: "image", src: `${BASE}guide/share_bg.png` },
} satisfies Record<string, AssetItem>;

export type SpringAssetKey = keyof typeof ASSETS;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

export class AssetManagerClass {
  private readonly items = new Map<SpringAssetKey, AssetValue>();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    await Promise.all(
      Object.entries(ASSETS).map(async ([key, item]) => {
        let value: AssetValue;
        if (item.type === "image") {
          value = await loadImage(item.src);
        } else if (item.type === "atlas") {
          const response = await fetch(item.src);
          value = await response.json();
        } else {
          const font = new FontFace(item.fontName ?? key, `url(${item.src})`);
          value = await font.load();
          (document.fonts as unknown as { add: (font: FontFace) => void }).add(
            value as FontFace,
          );
        }
        this.items.set(key as SpringAssetKey, value);
      }),
    );
    this.loaded = true;
  }

  get<T extends AssetValue>(key: SpringAssetKey): T {
    const value = this.items.get(key);
    if (!value) throw new Error(`Spring asset not loaded: ${key}`);
    return value as T;
  }
}

export const AssetManager = new AssetManagerClass();
