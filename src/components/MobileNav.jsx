import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon";
import { useAuth } from "../state/AuthContext";

const TABS = [
  { to: "/", end: true, icon: "home", label: "Home" },
  { to: "/search", icon: "search", label: "Search" },
  { to: "/ai", icon: "sparkle", label: "AI", className: "mobile-nav__link--ai" },
  { to: "/library", icon: "library", label: "Library" },
];

// Everything else lives in the "More" sheet so the bar stays uncluttered.
const MORE = [
  { to: "/friends", icon: "people", label: "Friends" },
  { to: "/room", icon: "radio", label: "Listen Together" },
  { to: "/liked", icon: "heart", label: "Liked Songs" },
  { to: "/recent", icon: "clock", label: "Recently Played" },
  { to: "/stats", icon: "chart", label: "Your Stats" },
  { to: "/local", icon: "upload", label: "Your Uploads" },
  { to: "/settings", icon: "settings", label: "Settings" },
];

function Avatar({ user, size = 24 }) {
  const initial = (user?.name || user?.email || "").charAt(0).toUpperCase();
  if (user?.photo) {
    return <img className="mobile-nav__avatar" style={{ width: size, height: size }} src={user.photo} alt="" referrerPolicy="no-referrer" />;
  }
  if (user && !user.isAnonymous && initial) {
    return <span className="mobile-nav__avatar mobile-nav__avatar--initial" style={{ width: size, height: size }}>{initial}</span>;
  }
  return <Icon name="artist" size={size - 2} />;
}

/**
 * Phone/tablet bottom navigation: the four main tabs plus "More", which opens
 * a bottom sheet with the profile and every other page.
 */
export default function MobileNav() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const linkClass = ({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`;
  const signedIn = user && !user.isAnonymous;
  const moreActive = ["/profile", ...MORE.map((item) => item.to)].some((to) => location.pathname.startsWith(to));

  // Close on navigation and on Escape.
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav className="mobile-nav" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={(state) => `${linkClass(state)}${tab.className ? ` ${tab.className}` : ""}`}
          >
            <span className="mobile-nav__icon"><Icon name={tab.icon} size={22} /></span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav__link${moreActive || open ? " is-active" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="more-sheet"
        >
          <span className="mobile-nav__icon"><Avatar user={user} /></span>
          <span>More</span>
        </button>
      </nav>

      {open ? (
        <div className="more-sheet__backdrop" onClick={() => setOpen(false)}>
          <div
            id="more-sheet"
            className="more-sheet"
            role="dialog"
            aria-label="More"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="more-sheet__grip" aria-hidden="true" />
            <NavLink to="/profile" className="more-sheet__profile">
              <Avatar user={user} size={44} />
              <span className="more-sheet__who">
                <strong>{signedIn ? user.name || user.email || "Your profile" : "Your profile"}</strong>
                <small>{signedIn ? "View profile" : "Sign in to sync your library"}</small>
              </span>
            </NavLink>
            <nav className="more-sheet__grid" aria-label="More pages">
              {MORE.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `more-sheet__item${isActive ? " is-active" : ""}`}>
                  <span className="more-sheet__icon"><Icon name={item.icon} size={22} /></span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
