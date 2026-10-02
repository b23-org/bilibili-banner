import { createPortal } from "preact/compat";
import { store } from "../../state/store";
import "./Toast.css";

/**
 * Toast 轻量全局提示组件
 * 消费 store.toastMessage 响应式信号
 */
export function Toast() {
  const message = store.toastMessage.value;
  if (!message || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="v-toast-container" role="status" aria-live="polite">
      <div className="v-toast">
        <svg
          className="v-toast__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span className="v-toast__text">{message}</span>
      </div>
    </div>,
    document.body,
  );
}
