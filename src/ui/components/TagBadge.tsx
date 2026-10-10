import type { BannerTag } from "../../types";
import "./TagBadge.css";

export interface TagBadgeProps {
  tag: BannerTag;
  active?: boolean;
  className?: string;
}

/** Tag 展示固定顺序：静态 → 视频 → 动态 → 场景互动 */
export const TAG_ORDER: BannerTag[] = [
  "img",
  "video",
  "split-layer",
  "interactive",
];

/** Tag 对应文案映射表 */
export const TAG_LABELS: Record<BannerTag, string> = {
  img: "静态",
  video: "视频",
  "split-layer": "动态",
  interactive: "场景互动",
};

/**
 * Tag 徽章组件
 * - img: 官方胶囊风格
 * - video / split-layer / interactive: 彩色标准
 * - 支持 active 高亮态
 */
export function TagBadge({ tag, className = "" }: TagBadgeProps) {
  const label = TAG_LABELS[tag] ?? tag;
  const classes = ["tag-badge", `tag-badge--${tag}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} data-tag={tag}>
      {label}
    </span>
  );
}
