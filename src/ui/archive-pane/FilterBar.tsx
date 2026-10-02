import { years } from "../../data/manifest";
import { store } from "../../state/store";
import type { BannerTag } from "../../types";
import { Popover } from "../components/Popover";
import { TAG_LABELS, TAG_ORDER } from "../components/TagBadge";
import "./FilterBar.css";

export interface FilterBarProps {
  className?: string;
}

/**
 * FilterBar 筛选控制栏 (Task 4.3)
 * - 年份胶囊：复刻 B 站胶囊规范 (.b-capsule)，hover 展开 Popover 列出全部年份，点击后自动关闭菜单
 * - Tag 胶囊：hover 展开 Popover 列出 静态/视频/动态/场景互动，点击后自动关闭菜单
 * - 排序切换按钮：升序显示“顺序”，降序显示“倒序”，点击 store.toggleOrder()
 * - 重置按钮：仅在非默认筛选条件（年份非空或 Tag 非静态）下显示，使用 .b-capsule-action 样式，hover 变蓝无背景框
 */
export function FilterBar({ className = "" }: FilterBarProps) {
  const currentYear = store.year.value;
  const currentTag = store.tag.value;
  const currentOrder = store.order.value;

  // 年份选择逻辑
  const handleSelectYear = (year: string | null) => {
    if (year === currentYear) {
      store.setYear(null);
    } else {
      store.setYear(year);
    }
  };

  // Tag 选择逻辑：仅提供 4 项（静态、视频、动态、场景互动）。点击静态切为默认状态 (null)
  const handleSelectTag = (tag: BannerTag) => {
    if (tag === "img" || tag === currentTag) {
      store.setTag(null);
    } else {
      store.setTag(tag);
    }
  };

  // 是否有非默认的筛选条件生效（年份非空 或 Tag 非静态）
  const hasActiveFilters =
    currentYear !== null || (currentTag !== null && currentTag !== "img");

  return (
    <div className={`filter-bar ${className}`.trim()}>
      <div className="filter-bar__capsules">
        {/* 1. 年份筛选胶囊 */}
        <Popover
          placement="bottom-start"
          closeOnContentClick={true}
          trigger={
            <button
              type="button"
              className={`b-capsule b-capsule--select ${
                currentYear !== null ? "is-active b-capsule--current" : ""
              }`}
            >
              <span className="b-capsule__text">
                {currentYear ? `${currentYear}年` : "全部年份"}
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
          <div className="v-popover-menu v-popover-menu--grid">
            <button
              type="button"
              className={`v-popover-menu__item ${
                currentYear === null ? "is-active" : ""
              }`}
              onClick={() => handleSelectYear(null)}
            >
              全部年份
            </button>
            {years.map((y) => (
              <button
                type="button"
                key={y}
                className={`v-popover-menu__item ${
                  currentYear === y ? "is-active" : ""
                }`}
                onClick={() => handleSelectYear(y)}
              >
                {y}年
              </button>
            ))}
          </div>
        </Popover>

        {/* 2. 类型筛选胶囊 */}
        <Popover
          placement="bottom-start"
          closeOnContentClick={true}
          trigger={
            <button
              type="button"
              className={`b-capsule b-capsule--select ${
                currentTag !== null && currentTag !== "img"
                  ? "is-active b-capsule--current"
                  : ""
              }`}
            >
              <span className="b-capsule__text">
                {currentTag ? TAG_LABELS[currentTag] : "静态"}
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
            {TAG_ORDER.map((tag) => (
              <button
                type="button"
                key={tag}
                className={`v-popover-menu__item ${
                  (
                    tag === "img" &&
                      (currentTag === null || currentTag === "img")
                  ) || currentTag === tag
                    ? "is-active"
                    : ""
                }`}
                onClick={() => handleSelectTag(tag)}
              >
                {TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </Popover>

        {/* 3. 重置按钮：仅在非默认筛选条件时渲染 */}
        {hasActiveFilters && (
          <button
            type="button"
            className="b-capsule-action filter-bar__reset-btn"
            onClick={() => store.resetFilters()}
            title="重置年份与类型筛选"
          >
            <svg
              className="filter-bar__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3" />
              <path d="M3 3v5h5" />
            </svg>
            <span>重置</span>
          </button>
        )}
      </div>

      <div className="filter-bar__right">
        {/* 4. 排序切换按钮 */}
        <button
          type="button"
          className="b-capsule filter-bar__action-btn"
          onClick={() => store.toggleOrder()}
          title={`切换为${currentOrder === "asc" ? "倒序" : "顺序"}`}
        >
          {currentOrder === "asc" ? (
            // 顺序（升序，时间递增，短 -> 中 -> 长，水平居中对齐）
            <svg
              className="filter-bar__icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="6" y1="3.5" x2="10" y2="3.5" />
              <line x1="4" y1="8" x2="12" y2="8" />
              <line x1="2" y1="12.5" x2="14" y2="12.5" />
            </svg>
          ) : (
            // 倒序（降序，时间回溯，长 -> 中 -> 短，水平居中对齐）
            <svg
              className="filter-bar__icon"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="2" y1="3.5" x2="14" y2="3.5" />
              <line x1="4" y1="8" x2="12" y2="8" />
              <line x1="6" y1="12.5" x2="10" y2="12.5" />
            </svg>
          )}
          <span>{currentOrder === "asc" ? "顺序" : "倒序"}</span>
        </button>
      </div>
    </div>
  );
}
