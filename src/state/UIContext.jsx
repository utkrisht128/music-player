import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Transient UI state: toasts, the single context menu, and the modal stack.
 *
 * These live in one place because only one context menu and one modal may be
 * open at a time — tracking that per-component is how you end up with two
 * menus on screen at once.
 */

const UIContext = createContext(null);

const TOAST_MS = 3200;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, options = {}) => {
      const id = nextId.current++;
      const entry = { id, message, icon: options.icon, tone: options.tone || "default" };
      setToasts((current) => [...current.slice(-3), entry]);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), options.duration || TOAST_MS)
      );
      return id;
    },
    [dismissToast]
  );

  /**
   * Open the shared context menu.
   * `anchor` is a viewport-space point; ContextMenu flips it near an edge.
   */
  const openMenu = useCallback((items, anchor) => {
    setMenu({ items: items.filter(Boolean), anchor });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const openModal = useCallback((content) => setModal(content), []);
  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(
    () => ({ toasts, toast, dismissToast, menu, openMenu, closeMenu, modal, openModal, closeModal }),
    [toasts, toast, dismissToast, menu, openMenu, closeMenu, modal, openModal, closeModal]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used inside a UIProvider.");
  return context;
}
