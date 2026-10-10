import { findEntryByRefId } from "../../data/query";
import { store } from "../../state/store";
import type { BannerEntry, BannerRef } from "../../types";
import { Popover } from "./Popover";
import { TAG_ORDER, TagBadge } from "./TagBadge";
import "./BannerInfoBar.css";

export interface BannerInfoBarProps {
  /** 模式：舞台常驻信息栏 (stage) 或 缩略卡片信息区 (card) */
  mode: "stage" | "card";
  /** card 模式传入对应 entry；stage 模式可选传入覆盖 */
  entry?: BannerEntry;
  /** stage 模式传入当前运行的 ref；可选传入覆盖 */
  refItem?: BannerRef;
  /** 点击版本项切换回调（默认调用 store.select） */
  onSelectRef?: (ref: BannerRef) => void;
}

/**
 * BannerInfoBar 双模式信息栏
 * - stage 模式：展示当前运行 ref.name、日期、聚合 Tag、外链跳转图标、多版本选择 Popover
 * - card 模式：展示 entry.refs[0].name、日期、聚合 Tag、多版本入口 Popover
 * - 官方胶囊样式 (.channel-link) 与 Popover 无缝协同
 */
export function BannerInfoBar({
  mode,
  entry,
  refItem,
  onSelectRef,
}: BannerInfoBarProps) {
  // 1. 数据归一化解析
  let targetRef: BannerRef | null = null;
  let targetEntry: BannerEntry | null = null;

  if (mode === "stage") {
    targetRef = refItem ?? store.activeRef.value;
    targetEntry =
      entry ??
      store.activeEntry.value ??
      (targetRef ? findEntryByRefId(targetRef.id) : null);
  } else {
    targetEntry = entry ?? null;
    targetRef = targetEntry?.refs[0] ?? null;
  }

  if (!targetRef && !targetEntry) {
    return null;
  }

  // 标题
  const title =
    mode === "stage"
      ? (targetRef?.name ?? "")
      : (targetEntry?.refs[0]?.name ?? "");

  // 日期
  const date =
    targetEntry?.date ?? (targetRef?.id ? targetRef.id.slice(0, 10) : "");

  // 外链：stage 模式展示当前 ref 的 link，card 模式展示 entry 首个 ref 的 link
  const link =
    mode === "stage"
      ? targetRef?.config.link
      : targetEntry?.refs[0]?.config.link;

  // Tag 列表解析：
  // 主舞台 (stage) 模式仅展示当前渲染 ref 的 tags；
  // 卡片 (card) 模式展示整个 entry 所有版本的去重聚合 tags
  const rawTags =
    mode === "stage"
      ? (targetRef?.tags ?? [])
      : targetEntry
        ? Array.from(new Set(targetEntry.refs.flatMap((r) => r.tags)))
        : (targetRef?.tags ?? []);
  const sortedTags = TAG_ORDER.filter((t) => rawTags.includes(t));

  // 版本列表
  const refs = targetEntry?.refs ?? (targetRef ? [targetRef] : []);
  const hasMultipleVersions = refs.length > 1;

  // 当前激活状态 ID（用于多版本菜单内高亮当前项）
  const activeRefId =
    mode === "stage"
      ? (targetRef?.id ?? store.activeBannerId.value)
      : store.activeBannerId.value;

  const handleSelectRef = (ref: BannerRef) => {
    if (onSelectRef) {
      onSelectRef(ref);
    } else {
      store.select(ref.id);
    }
  };

  const popoverPlacement = mode === "stage" ? "bottom-end" : "top-end";

  return (
    <div className={`banner-info-bar banner-info-bar--${mode}`}>
      {/* 左侧主体信息区 */}
      <div className="banner-info-bar__left">
        <div className="banner-info-bar__title-row">
          <span className="banner-info-bar__title" title={title}>
            {title}
          </span>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="banner-info-bar__link"
              title="前往活动页面"
              onClick={(e) => e.stopPropagation()}
            >
              <span
                style={{
                  position: "absolute",
                  width: "1px",
                  height: "1px",
                  padding: 0,
                  margin: "-1px",
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  border: 0,
                }}
              >
                前往活动页面
              </span>
              <svg
                width={mode === "stage" ? 16 : 13}
                height={mode === "stage" ? 16 : 13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="banner-info-bar__link-icon"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>

        <div className="banner-info-bar__meta-row">
          {date && <span className="banner-info-bar__date">{date}</span>}
          {sortedTags.length > 0 && (
            <div className="banner-info-bar__tags">
              {sortedTags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 右侧多版本胶囊入口 */}
      {hasMultipleVersions && (
        <div className="banner-info-bar__right">
          <Popover
            placement={popoverPlacement}
            trigger={
              <button
                type="button"
                className="b-capsule b-capsule--select banner-info-bar__capsule"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="b-capsule__text">
                  {`多版本 (${refs.length})`}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 9 9"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="b-capsule__arrow"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M7.50588 3.40623C7.40825 3.3086 7.24996 3.3086 7.15232 3.40623L4.41244 6.14612L1.67255 3.40623C1.57491 3.3086 1.41662 3.3086 1.31899 3.40623C1.22136 3.50386 1.22136 3.66215 1.31899 3.75978L4.11781 6.5586C4.28053 6.72132 4.54434 6.72132 4.70706 6.5586L7.50588 3.75978C7.60351 3.66215 7.60351 3.50386 7.50588 3.40623Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            }
          >
            <div className="v-popover-menu">
              {refs.map((r, index) => {
                const isSelected = r.id === activeRefId;
                return (
                  <button
                    type="button"
                    key={r.id}
                    className={`v-popover-menu__item v-popover-menu__item--version ${
                      isSelected ? "is-active" : ""
                    }`}
                    onClick={() => handleSelectRef(r)}
                  >
                    <span className="banner-info-bar__version-name">
                      {r.name || `版本 ${index + 1}`}
                    </span>
                    <div className="banner-info-bar__version-tags">
                      {r.tags.map((t) => (
                        <TagBadge key={t} tag={t} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Popover>
        </div>
      )}
    </div>
  );
}
