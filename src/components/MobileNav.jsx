import React from "react";
import { NavLink } from "react-router-dom";
import Icon from "./Icon";
import { useAuth } from "../state/AuthContext";

const TABS = [
  { to: "/", end: true, icon: "home", label: "Home" },
  { to: "/search", icon: "search", label: "Search" },
  { to: "/library", icon: "library", label: "Library" },
  { to: "/local", icon: "upload", label: "Uploads" },
];

/**
 * Phone/tablet bottom navigation. Sits below the mini player, both fixed to
 * the bottom of the viewport. The last tab is the listener's profile, shown
 * with their avatar once signed in.
 */
export default function MobileNav() {
  const { user } = useAuth();
  const linkClass = ({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`;
  const initial = (user?.name || user?.email || "").charAt(0).toUpperCase();

  return (
    <nav className="mobile-nav" aria-label="Main">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={linkClass}>
          <span className="mobile-nav__icon"><Icon name={tab.icon} size={22} /></span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
      <NavLink to="/profile" className={linkClass}>
        <span className="mobile-nav__icon">
          {user?.photo ? (
            <img className="mobile-nav__avatar" src={user.photo} alt="" referrerPolicy="no-referrer" />
          ) : user && !user.isAnonymous && initial ? (
            <span className="mobile-nav__avatar mobile-nav__avatar--initial">{initial}</span>
          ) : (
            <Icon name="artist" size={22} />
          )}
        </span>
        <span>You</span>
      </NavLink>
    </nav>
  );
}
