import React, { useCallback, useEffect, useRef } from "react";
import Icon from "./Icon";
import { useUI } from "../state/UIContext";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal host. One modal at a time, opened via `useUI().openModal(...)`.
 *
 * Implements the accessibility contract a dialog owes the user: focus moves
 * in on open, Tab is trapped inside, Escape closes, and focus returns to
 * whatever opened it.
 */
export default function ModalHost() {
  const { modal, closeModal } = useUI();
  const panelRef = useRef(null);
  const restoreFocusTo = useRef(null);

  useEffect(() => {
    if (!modal) return undefined;

    restoreFocusTo.current = document.activeElement;
    const panel = panelRef.current;
    const first = panel && panel.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    // The page behind a modal must not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      const target = restoreFocusTo.current;
      if (target && typeof target.focus === "function") target.focus();
    };
  }, [modal]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || []);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeModal]
  );

  if (!modal) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div
        className={modal.bare ? "modal modal--bare" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={modal.title}
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {modal.bare ? (
          <button type="button" className="icon-btn modal__close" onClick={closeModal} aria-label="Close dialog">
            <Icon name="close" size={18} />
          </button>
        ) : (
          <div className="modal__head">
            <h2 className="modal__title">{modal.title}</h2>
            <button type="button" className="icon-btn" onClick={closeModal} aria-label="Close dialog">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="modal__body">{modal.body}</div>
      </div>
    </div>
  );
}
