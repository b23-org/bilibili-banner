/**
 * 受限并发执行映射操作
 *
 * @param items 输入数组
 * @param worker 处理每个条目的异步函数
 * @param limit 最大并发数（需 >= 1）
 * @returns 保持与输入顺序完全一致的结果数组
 */
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<R[]> {
  if (items.length === 0) return [];

  const actualLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: actualLimit }, () => runWorker());
  await Promise.all(workers);

  return results;
}
