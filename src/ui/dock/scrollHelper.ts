export interface NavigateOptions {
  container: HTMLElement;
  targetTop: number;
  threshold?: number;
  leadDistance?: number;
}

/**
 * 两段式平滑滚动导航
 * - 短距离 (<= threshold)：原生 smooth 平滑滚动
 * - 长距离 (> threshold)：先瞬时跳转至临近距离，紧接着下一帧 smooth 减速滚入
 * 彻底消除虚拟列表飞速滑动中间大量节点的挂载与网络请求震荡
 */
export function navigateToScrollTop({
  container,
  targetTop,
  threshold = 800,
  leadDistance = 350,
}: NavigateOptions): void {
  const currentTop = container.scrollTop;
  const distance = Math.abs(targetTop - currentTop);

  if (distance <= threshold) {
    container.scrollTo({ top: targetTop, behavior: "smooth" });
    return;
  }

  // 长距离：先瞬移到接近目标位置
  const stepTop =
    targetTop > currentTop
      ? Math.max(0, targetTop - leadDistance)
      : targetTop + leadDistance;

  container.scrollTop = stepTop;
  requestAnimationFrame(() => {
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  });
}
