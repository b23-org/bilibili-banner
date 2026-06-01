import type { BannerExtension, BannerExtensionContext } from "../core";
import { SpringBannerSession } from "./banner/session";

export default class SpringExtension implements BannerExtension {
  private session: SpringBannerSession | null = null;

  async prepare(context: BannerExtensionContext): Promise<boolean> {
    this.session = new SpringBannerSession(context);
    return this.session.prepare();
  }

  mount(context: BannerExtensionContext): void {
    if (!this.session) {
      this.session = new SpringBannerSession(context);
    }
    this.session.mountIdle();
  }

  dispose(): void {
    this.session?.dispose();
    this.session = null;
  }
}
