import type { BannerExtension, BannerExtensionContext } from "./core";

export default class AutumnExtension implements BannerExtension {
  async prepare(_context: BannerExtensionContext): Promise<boolean> {
    return false;
  }

  mount(_context: BannerExtensionContext): void {}

  dispose(): void {}
}
