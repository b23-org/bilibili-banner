export interface LayerAnimationTrack {
  durations: number[];
  totalDuration: number;
  currentIndex: number;
  lastTime: number;
}

export class FrameAnimator {
  private tracks: Map<number, LayerAnimationTrack> = new Map();
  private hasActiveTracks = false;

  public registerLayer(layerIndex: number, durations: number[]): void {
    if (durations.length <= 1) return;
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    if (totalDuration <= 0) return;

    this.tracks.set(layerIndex, {
      durations,
      totalDuration,
      currentIndex: 0,
      lastTime: -1,
    });
    this.hasActiveTracks = true;
  }

  public get hasAnimations(): boolean {
    return this.hasActiveTracks;
  }

  public start(startTime: number): void {
    for (const track of this.tracks.values()) {
      track.lastTime = startTime;
      track.currentIndex = 0;
    }
  }

  public getCurrentIndex(layerIndex: number): number {
    return this.tracks.get(layerIndex)?.currentIndex ?? 0;
  }

  /**
   * 推进时间
   * - 返回已换帧的图层下标映射 [layerIndex, newFrameIndex]
   * - 采用取模跳帧机制杜绝后台唤醒死亡螺旋
   */
  public tick(now: number): Map<number, number> {
    const changes = new Map<number, number>();

    for (const [layerIndex, track] of this.tracks.entries()) {
      if (track.lastTime < 0) {
        track.lastTime = now;
        continue;
      }

      let elapsed = now - track.lastTime;

      // 取模跳帧优化：解决长时间后台休眠后唤醒的“死亡螺旋”卡死问题
      if (track.totalDuration > 0 && elapsed >= track.totalDuration) {
        const cycles = Math.floor(elapsed / track.totalDuration);
        track.lastTime += cycles * track.totalDuration;
        elapsed %= track.totalDuration;
      }

      let currentDuration = track.durations[track.currentIndex] ?? 0;
      let advanced = false;

      while (elapsed >= currentDuration && currentDuration > 0) {
        elapsed -= currentDuration;
        track.lastTime += currentDuration;
        track.currentIndex = (track.currentIndex + 1) % track.durations.length;
        currentDuration = track.durations[track.currentIndex] ?? 0;
        advanced = true;
      }

      if (advanced) {
        changes.set(layerIndex, track.currentIndex);
      }
    }

    return changes;
  }

  public reset(): void {
    this.tracks.clear();
    this.hasActiveTracks = false;
  }
}
