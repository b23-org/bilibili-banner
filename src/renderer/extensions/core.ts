import type { BannerDataOfficial2021, BannerExtensionKey } from "../../types";

export type { BannerExtensionKey };

export interface BannerExtensionContext {
  readonly bannerEl: HTMLElement;
  readonly bannerData: BannerDataOfficial2021;
  readonly signal: AbortSignal;
}

/**
 * 辅助函数：查询并返回 Banner 默认 UI 元素
 * 重扩展可以使用此函数来隐藏/恢复 UI。
 */
export function queryBannerUiElements(bannerEl: HTMLElement) {
  return {
    innerEl: bannerEl.querySelector<HTMLElement>(".animated-banner"),
    logoEl: bannerEl.querySelector<HTMLElement>("#logo"),
  };
}

export interface BannerExtension {
  prepare(context: BannerExtensionContext): Promise<boolean>;
  mount(context: BannerExtensionContext): Promise<void> | void;
  dispose(): void;
}

type BannerExtensionModule = {
  default: new () => BannerExtension;
};

export const bannerExtensionRegistry: Record<
  BannerExtensionKey,
  () => Promise<BannerExtensionModule>
> = {
  snow: () => import("./snow"),
  petals: () => import("./petals"),
  spring: () => import("./spring"),
  summer: () => import("./summer"),
  autumn: () => import("./autumn"),
};

export class ExtensionHost {
  private static readonly PREPARE_TIMEOUT_MS = 30_000;

  private readonly enabledKeys: BannerExtensionKey[];
  private readonly instances: BannerExtension[] = [];
  private disposed = false;

  constructor(private readonly context: BannerExtensionContext) {
    this.enabledKeys = Object.keys(
      context.bannerData.extensions ?? {},
    ) as BannerExtensionKey[];
  }

  public static fromBannerData(
    context: BannerExtensionContext,
  ): ExtensionHost | null {
    const extensions = context.bannerData.extensions;
    if (!extensions || Object.keys(extensions).length === 0) {
      console.log("[ExtensionHost] No extensions configured");
      return null;
    }
    console.log(
      "[ExtensionHost] Creating host for extensions:",
      Object.keys(extensions),
    );
    return new ExtensionHost(context);
  }

  public async prepare(): Promise<void> {
    console.log("[ExtensionHost] Preparing extensions:", this.enabledKeys);
    for (const key of this.enabledKeys) {
      if (this.disposed) return;

      const loadExtension = bannerExtensionRegistry[key];
      if (!loadExtension) {
        console.warn(`[ExtensionHost] No loader found for extension: ${key}`);
        continue;
      }

      try {
        console.log(`[ExtensionHost] Loading extension: ${key}`);
        const mod = await loadExtension();
        if (this.disposed) return;

        const instance = new mod.default();
        console.log(
          `[ExtensionHost] Loaded extension: ${key}, calling prepare...`,
        );

        const ready = await this.prepareWithTimeout(
          instance,
          key,
          ExtensionHost.PREPARE_TIMEOUT_MS,
        );

        if (this.disposed) {
          instance.dispose();
          return;
        }

        if (ready) {
          console.log(`[ExtensionHost] Extension ${key} prepared successfully`);
          this.instances.push(instance);
        } else {
          console.log(
            `[ExtensionHost] Extension ${key} returned false from prepare`,
          );
          instance.dispose();
        }
      } catch (error) {
        console.error(`[ExtensionHost] prepare failed: ${key}`, error);
      }
    }
    console.log(
      "[ExtensionHost] Prepare complete. Ready extensions:",
      this.instances.length,
    );
  }

  private async prepareWithTimeout(
    instance: BannerExtension,
    key: BannerExtensionKey,
    timeoutMs: number,
  ): Promise<boolean> {
    console.log(
      `[ExtensionHost] prepareWithTimeout: ${key}, timeout=${timeoutMs}ms`,
    );
    const result = await Promise.race([
      instance.prepare(this.context),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), timeoutMs),
      ),
    ]);

    if (result === "timeout") {
      console.warn(
        `[ExtensionHost] prepare timed out after ${timeoutMs}ms: ${key}`,
      );
      return false;
    }
    console.log(`[ExtensionHost] prepare result for ${key}:`, result);
    return result;
  }

  public async mount(): Promise<void> {
    if (this.disposed) return;

    console.log("[ExtensionHost] Mounting extensions:", this.instances.length);
    for (const instance of this.instances) {
      if (this.disposed) return;

      try {
        console.log("[ExtensionHost] Mounting extension...");
        await instance.mount(this.context);
        console.log("[ExtensionHost] Extension mounted successfully");
      } catch (error) {
        console.error("[ExtensionHost] mount failed", error);
      }
    }
    console.log("[ExtensionHost] All extensions mounted");
  }

  public dispose(): void {
    this.disposed = true;

    console.log("[ExtensionHost] Disposing extensions:", this.instances.length);
    for (const instance of this.instances) {
      try {
        instance.dispose();
      } catch (error) {
        console.error("[ExtensionHost] dispose failed", error);
      }
    }
    this.instances.length = 0;
    console.log("[ExtensionHost] All extensions disposed");
  }
}
