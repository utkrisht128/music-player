import React from "react";
import Icon from "./Icon";
import { useUI } from "../state/UIContext";

/**
 * Toast stack. Rendered once at the app root.
 *
 * The region is a polite live region so a screen reader announces
 * confirmations without stealing focus from whatever the user just clicked.
 */
export default function ToastStack() {
  const { toasts, dismissToast } = useUI();

  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          {toast.icon ? <Icon name={toast.icon} size={18} className="toast__icon" /> : null}
          <span className="toast__text">{toast.message}</span>
          <button
            type="button"
            className="toast__close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
