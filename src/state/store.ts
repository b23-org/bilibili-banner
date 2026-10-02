import { computed, signal } from "@preact/signals";
import { findEntryByRefId, findRefById, queryEntries } from "../data/query";
import type { BannerEntry, BannerRef, BannerTag } from "../types";

// ── 基础 Signals ──
const activeBannerId = signal<string>("");
const year = signal<string | null>(null);
const tag = signal<BannerTag | null>(null);
const order = signal<"asc" | "desc">("desc");

// ── 交互反馈 Signals ──
const highlightedBannerId = signal<string | null>(null);
const toastMessage = signal<string | null>(null);

let highlightTimer: number | null = null;
let toastTimer: number | null = null;

// ── 计算属性 Computed ──
const activeRef = computed<BannerRef | null>(() =>
  findRefById(activeBannerId.value),
);

const activeEntry = computed<BannerEntry | null>(() =>
  findEntryByRefId(activeBannerId.value),
);

const filtered = computed<BannerEntry[]>(() =>
  queryEntries(year.value, tag.value, order.value),
);

/**
 * 全局统一状态对象字面量
 */
export const store = {
  // ── Banner 选中 ──

  /** 当前舞台展示的 BannerRef.id */
  activeBannerId,

  /** 派生：当前 BannerRef 对象 */
  activeRef,

  /** 派生：当前 BannerRef 所属的 BannerEntry */
  activeEntry,

  /** 操作：选中 Banner */
  select(id: string) {
    activeBannerId.value = id;
  },

  // ── 筛选 ──

  /** 年份筛选（null = 全部年份） */
  year,

  /** Tag 筛选（null = 全部） */
  tag,

  /** 排序方向 */
  order,

  /** 派生：筛选 + 排序后的完整 Entry 列表 */
  filtered,

  /** 操作：设置年份筛选 */
  setYear(y: string | null) {
    year.value = y;
  },

  /** 操作：设置 Tag 筛选 */
  setTag(t: BannerTag | null) {
    tag.value = t;
  },

  /** 操作：切换升降序 */
  toggleOrder() {
    order.value = order.value === "desc" ? "asc" : "desc";
  },

  /** 操作：重置筛选（保持 order 不变） */
  resetFilters() {
    year.value = null;
    tag.value = null;
  },

  // ── 交互反馈 ──

  /** 当前获得定位光晕脉冲的 BannerRef.id */
  highlightedBannerId,

  /** 全局轻量提示文本 */
  toastMessage,

  /** 触发卡片高亮脉冲（持续 1.2 秒后复位） */
  triggerHighlight(id: string) {
    if (highlightTimer !== null) {
      window.clearTimeout(highlightTimer);
    }
    highlightedBannerId.value = id;
    highlightTimer = window.setTimeout(() => {
      highlightedBannerId.value = null;
      highlightTimer = null;
    }, 2000);
  },

  /** 显示轻提示（持续 2.5 秒后复位） */
  showToast(msg: string) {
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    toastMessage.value = msg;
    toastTimer = window.setTimeout(() => {
      toastMessage.value = null;
      toastTimer = null;
    }, 2500);
  },
};
