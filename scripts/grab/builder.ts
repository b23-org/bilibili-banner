import type {
  BannerConfigOfficial2021,
  LayersOfficial2021,
  SimpleBannerConfig,
} from "../../src/types";
import { extractFileNameFromUrl } from "../grab-shared/url";

export function buildSplitLayerData(
  layers: LayersOfficial2021[],
  logoUrl: string | undefined,
  year: string,
  date: string,
  logoDir?: string,
  link?: string,
): BannerConfigOfficial2021 {
  const basePath = `assets/${year}/${date}`;
  const logoPath = `assets/${year}/${logoDir || date}`;
  const outLayers = layers.map((layer) => ({
    ...layer,
    resources: layer.resources?.map((res) => ({
      ...res,
      src: `${basePath}/${extractFileNameFromUrl(res.src)}`,
    })),
  }));

  const output: BannerConfigOfficial2021 = {
    type: "official_2021",
    layers: outLayers,
  };

  if (logoUrl) {
    output.logo = { src: `${logoPath}/${extractFileNameFromUrl(logoUrl)}` };
  }

  if (link && link.trim() !== "") {
    output.link = link;
  }

  return output;
}

export function buildSimpleImageData(
  previewUrl: string,
  logoUrl: string | undefined,
  year: string,
  dirPath: string,
  link?: string,
): SimpleBannerConfig {
  const output: SimpleBannerConfig = {
    type: "simple-image",
    layer: {
      src: `assets/${year}/${dirPath}/${extractFileNameFromUrl(previewUrl)}`,
    },
  };

  if (logoUrl) {
    output.logo = {
      src: `assets/${year}/${dirPath}/${extractFileNameFromUrl(logoUrl)}`,
    };
  }

  if (link && link.trim() !== "") {
    output.link = link;
  }

  return output;
}
