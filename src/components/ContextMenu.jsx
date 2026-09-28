import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { useUI } from "../state/UIContext";

/**
 * The single context menu, opened via `useUI().openMenu(items, anchor)`.
 *
 * Items: { label, icon, onSelect, danger, separatorBefore } — `null` entries
 * are filtered out by the provider so callers can use inline conditionals.
 *
 * Positioning is measured after mount and flipped when the menu would spill
 * past the viewport, which matters for the last row of a long track list.
 */
export default function ContextMenuHost() {
  const { menu, closeMenu } = useUI();
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useLayoutEffect(() => {
    if (!menu || !ref.current) {
      setPosition(null);
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const margin = 8;
    const { x, y } = menu.anchor;

    const left = x + rect.width + margin > window.innerWidth
      ? Math.max(margin, window.innerWidth - rect.width - margin)
      : x;
    const top = y + rect.height + margin > window.innerHeight
      ? Math.max(margin, y - rect.height)
      : y;

    setPosition({ left, top });
    setActiveIndex(-1);
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    // Any scroll or resize invalidates the anchor point, so close rather than
    // leave a menu floating away from the row it belongs to.
    const close = () => closeMenu();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, closeMenu]);

  if (!menu) return null;

  const selectable = menu.items;

  const onKeyDown = (event) => {
    if (event.key === "Escape") { closeMenu(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) => (i + step + selectable.length) % selectable.length);
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      run(selectable[activeIndex]);
    }
  };

  const run = (item) => {
    closeMenu();
    item.onSelect?.();
  };

  return (
    <div className="menu-overlay" onMouseDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}>
      <div
        className="menu"
        role="menu"
        ref={ref}
        tabIndex={-1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        style={
          position
            ? { left: position.left, top: position.top, visibility: "visible" }
            : { left: menu.anchor.x, top: menu.anchor.y, visibility: "hidden" }
        }
      >
        {menu.items.map((item, i) => (
          <React.Fragment key={item.label}>
            {item.separatorBefore ? <div className="menu__separator" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              className={`menu__item${item.danger ? " menu__item--danger" : ""}${
                i === activeIndex ? " is-active" : ""
              }`}
              onClick={() => run(item)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {item.icon ? <Icon name={item.icon} size={16} /> : <span className="menu__spacer" />}
              <span>{item.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
