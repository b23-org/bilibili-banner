// ===============================================
// Layer Types - Official 2020
// ===============================================

export interface LayerConfig2020 {
  images: Array<{ src: string; duration?: number }>;
  initial: {
    scale?: number;
    translate?: [number, number];
    rotate?: number;
    blur?: number;
  };
  offset: {
    scale?: number;
    translate?: [number, number];
    rotate?: number;
    blur?: number;
  };
  offsetCurve: {
    scale?: [number, number, number, number];
    translate?: [number, number, number, number];
    rotate?: [number, number, number, number];
    blur?: [number, number, number, number];
  };
}

// ===============================================
// Layer Types - Official 2021
// ===============================================

interface Resource {
  src: string;
  id?: number;
}

interface BaseProperty {
  offsetCurve?: [number, number, number, number];
}

interface ScalarProperty extends BaseProperty {
  initial?: number;
  offset?: number;
}

export interface WrappableProperty extends ScalarProperty {
  wrap?: "clamp" | "alternate";
}

interface TranslateProperty extends BaseProperty {
  initial?: [number, number];
  offset?: [number, number];
}

export interface LayersOfficial2021 {
  resources: Resource[];
  scale?: ScalarProperty;
  rotate?: ScalarProperty;
  translate?: TranslateProperty;
  blur?: WrappableProperty;
  opacity?: WrappableProperty;
  id?: number;
  name?: string;
}

export type BannerExtensionKey =
  | "snow"
  | "petals"
  | "spring"
  | "summer"
  | "autumn";

export type BannerExtensionMap = Partial<
  Record<BannerExtensionKey, Record<string, never>>
>;

// ===============================================
// Simple Banner Types
// ===============================================

interface SimpleLayer {
  src: string;
}

// ===============================================
// Banner Config (纯配置，对应 JSON 文件格式)
// ===============================================

export const BANNER_TYPES_ARR = [
  "simple-image",
  "official_2020",
  "official_2021",
] as const;

export type BannerType = (typeof BANNER_TYPES_ARR)[number];

export interface LogoConfig {
  logo?: {
    src: string;
    width?: number | string;
    height?: number | string;
  };
}

/** 官方 2020 多图层配置（配置文件格式） */
export interface Official2020BannerConfig extends LogoConfig {
  type: "official_2020";
  layers: LayerConfig2020[];
  link?: string;
}

/** 官方 2021 多图层配置（配置文件格式） */
export interface Official2021BannerConfig extends LogoConfig {
  type: "official_2021";
  layers: LayersOfficial2021[];
  extensions?: BannerExtensionMap;
  link?: string;
}

/** 单图层配置（配置文件格式） */
export interface SimpleBannerConfig extends LogoConfig {
  type: "simple-image";
  layer: SimpleLayer;
  link?: string;
}

/** Banner 配置联合类型（配置文件格式） */
export type BannerConfig =
  | Official2020BannerConfig
  | Official2021BannerConfig
  | SimpleBannerConfig;

// ===============================================
// Banner Data
// ===============================================

export type BannerTag = "img" | "video" | "split-layer" | "interactive";

export interface BannerRef<T extends BannerConfig = BannerConfig> {
  id: string;
  name: string;
  tags: BannerTag[];
  /** 分区 ID */
  tid: number[];
  config: T;
}

// ===============================================
// Group Types
// ===============================================

export interface BannerEntry {
  date: string;
  refs: BannerRef[];
}
