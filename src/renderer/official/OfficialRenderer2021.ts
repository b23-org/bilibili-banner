import type {
  BannerConfig,
  LayersOfficial2021,
  Official2021BannerConfig,
} from "../../types";
import { ExtensionHost } from "../extensions/core";
import { BaseOfficialRenderer } from "./BaseOfficialRenderer";

export class OfficialRenderer2021 extends BaseOfficialRenderer {
  private bannerConfig: Official2021BannerConfig | null = null;
  private extensionHost: ExtensionHost | null = null;
  private _extensionAbortController = new AbortController();

  protected _normalizeConfig(raw: unknown): LayersOfficial2021[] {
    return raw as LayersOfficial2021[];
  }

  public async preload(
    bannerConfig: BannerConfig,
    signal?: AbortSignal,
  ): Promise<void> {
    if (bannerConfig?.type !== "official_2021") {
      return;
    }
    this.bannerConfig = bannerConfig as Official2021BannerConfig;
    return super.preload(bannerConfig, signal);
  }

  protected _onAfterSetup(): void {
    if (!this.container || !this.bannerConfig) return;

    const extensionHost = ExtensionHost.fromConfig({
      bannerEl: this.container,
      config: this.bannerConfig,
      signal: this._extensionAbortController.signal,
    });

    if (!extensionHost) return;
    this.extensionHost = extensionHost;

    void extensionHost.prepare().then(() => extensionHost.mount());
  }

  protected _onBeforeDispose(): void {
    this._extensionAbortController.abort();
    this.extensionHost?.dispose();
    this.extensionHost = null;
  }
}
