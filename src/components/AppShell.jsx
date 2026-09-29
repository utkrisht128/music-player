import React, { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import TopBar from "./TopBar";
import Player from "./player/Player";
import ToastStack from "./Toast";
import ModalHost from "./Modal";
import ContextMenuHost from "./ContextMenu";
import ErrorBoundary from "./ErrorBoundary";
import { UsernamePrompt } from "./UsernameForm";
import { usePlayer } from "../state/PlayerContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

/**
 * The application shell: navigation, the scrolling content region, and the
 * persistent player.
 *
 * The router outlet is nested INSIDE this component so route changes swap only
 * the page content. The player sits outside it and is never remounted, which
 * is what lets audio survive navigation.
 */
export default function AppShell() {
  const location = useLocation();
  const scrollRef = useRef(null);
  const { currentTrack } = usePlayer();

  useKeyboardShortcuts();

  // Each page starts at the top; without this the scroll position carries over
  // from the previous route.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    // scrollTo is absent in some environments (jsdom, older engines); the
    // scrollTop assignment is the universally supported fallback.
    if (typeof node.scrollTo === "function") node.scrollTo({ top: 0 });
    else node.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className={`app${currentTrack ? " has-player" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <Sidebar />

      <div className="app__content">
        <TopBar scrollRef={scrollRef} />
        <main className="app__scroll" id="main" ref={scrollRef} tabIndex={-1}>
          <UsernamePrompt />
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <Player />
      <MobileNav />

      <ContextMenuHost />
      <ModalHost />
      <ToastStack />
    </div>
  );
}
