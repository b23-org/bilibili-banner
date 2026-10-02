import { effect } from "@preact/signals";
import {
  getLatestBannerId,
  isValidId,
  isValidTag,
  isValidYear,
} from "../data/query";
import { store } from "./store";

function setOrDelete(url: URL, key: string, value: string | null): void {
  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }
}

/**
 * 初始化 URL 同步：
 * 1. 一次性读取 URL 参数并写入 Signals（含有效性校验与安全回退）
 * 2. 建立 Signals -> URL 的响应式同步（通过 replaceState，零历史堆栈增量）
 */
export function initUrlSync(): void {
  const params = new URLSearchParams(window.location.search);

  // 解析 URL 参数 → 写入 signals
  const id = params.get("id");
  const year = params.get("year");
  const tag = params.get("tag");
  const order = params.get("order");

  if (year) {
    if (isValidYear(year)) {
      store.year.value = year;
    } else {
      console.warn(`[urlSync] 无效年份: ${year}，已忽略`);
    }
  }

  if (tag) {
    if (isValidTag(tag)) {
      store.tag.value = tag;
    } else {
      console.warn(`[urlSync] 无效 Tag: ${tag}，已忽略`);
    }
  }

  if (order === "asc") {
    store.order.value = "asc";
  } else if (order !== null && order !== "desc") {
    console.warn(`[urlSync] 无效排序: ${order}，已回退为 desc`);
  }

  if (id && isValidId(id)) {
    store.activeBannerId.value = id;
  } else {
    // 无效或缺失 id → 回退至最新 Banner
    if (id) {
      console.warn(`[urlSync] 无效 Banner ID: ${id}，回退至最新`);
    }
    store.activeBannerId.value = getLatestBannerId();
  }

  // 响应式：Signals → URL（自动追踪，任何关联 signal 变化时自动更新）
  effect(() => {
    const url = new URL(window.location.href);

    // id 始终存在
    url.searchParams.set("id", store.activeBannerId.value);

    // 非默认值才写入，默认值省略
    setOrDelete(url, "year", store.year.value);
    setOrDelete(url, "tag", store.tag.value);
    setOrDelete(url, "order", store.order.value === "asc" ? "asc" : null);

    window.history.replaceState({}, "", url);
  });
}
