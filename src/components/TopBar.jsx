import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import AccountButton from "./AccountButton";

/** Bottom-tab destinations: on phones these show the brand, not a back button. */
const TAB_TITLES = {
  "/": "Resonate",
  "/search": "Search",
  "/library": "Your Library",
  "/local": "Your Uploads",
  "/profile": "Profile",
};

/**
 * Sticky page header with browser-history controls.
 *
 * It becomes opaque once the content scrolls beneath it — a transparent bar
 * over scrolling artwork is unreadable.
 */
export default function TopBar({ scrollRef }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = scrollRef?.current;
    if (!node) return undefined;
    const onScroll = () => setScrolled(node.scrollTop > 12);
    onScroll();
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // A route change resets the scroll position, so the bar must reset too.
  useEffect(() => { setScrolled(false); }, [location.pathname]);

  const tabTitle = TAB_TITLES[location.pathname];

  return (
    <header className={`topbar${scrolled ? " is-scrolled" : ""}${tabTitle ? " is-tab-root" : ""}`}>
      {tabTitle ? (
        <Link to="/" className="topbar__brand" aria-label="Resonate home">
          <span className="topbar__brand-logo"><Icon name="music" size={18} /></span>
          <span className="topbar__brand-title">{tabTitle}</span>
        </Link>
      ) : null}
      <div className="topbar__history">
        <button type="button" className="topbar__nav" onClick={() => navigate(-1)} aria-label="Go back">
          <Icon name="chevronLeft" size={20} />
        </button>
        <button type="button" className="topbar__nav topbar__nav--forward" onClick={() => navigate(1)} aria-label="Go forward">
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <div className="topbar__actions">
        <Link to="/stats" className="topbar__nav topbar__nav--mobile" aria-label="Your stats" title="Your stats">
          <Icon name="chart" size={18} />
        </Link>
        <Link to="/settings" className="topbar__nav topbar__nav--settings" aria-label="Settings" title="Settings">
          <Icon name="settings" size={18} />
        </Link>
        <AccountButton />
      </div>
    </header>
  );
}
