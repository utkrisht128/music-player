import React from "react";
import Icon from "./Icon";

/**
 * Empty and error states. Both get a reason and, where one exists, a way out
 * — an empty section with no explanation reads as a broken page.
 */
export default function EmptyState({ icon = "music", title, message, action, onAction }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} className="empty__icon" />
      <h3 className="empty__title">{title}</h3>
      {message ? <p className="empty__message">{message}</p> : null}
      {action ? (
        <button type="button" className="btn btn--primary empty__action" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty empty--error" role="alert">
      <Icon name="warning" size={36} className="empty__icon" />
      <h3 className="empty__title">Something went wrong</h3>
      <p className="empty__message">{message || "We could not load this. Please try again."}</p>
      {onRetry ? (
        <button type="button" className="btn btn--ghost empty__action" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
