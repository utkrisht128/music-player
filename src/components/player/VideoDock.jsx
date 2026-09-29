import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../Icon";
import { usePlayer } from "../../state/PlayerContext";
import { ensureHost } from "../../audio/YouTubeManager";

const POS_KEY = "resonate.videoDock.pos";
const MARGIN = 12;
const MOVE_MS = 440;

function readPos() {
  try {
    const value = JSON.parse(localStorage.getItem(POS_KEY));
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
  } catch {
    return null;
  }
}

function savePos(pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* storage unavailable: the position just is not remembered */
  }
}

/**
 * Positions the YouTube iframe (which lives outside React, in #yt-dock) and
 * renders its header. All geometry is set here in JS (left/top/width), so
 * there is exactly one source of truth for where the video is.
 *
 *   mini   floating card, draggable by its header; enlarge toggles its size
 *   stage  fills the `.np__video` slot of the Now Playing view
 *
 * YouTube's terms require the player to stay visible while it plays, so the
 * close button only appears while paused, and playing again brings it back.
 */
export default function VideoDock({ large, stage, onToggleLarge }) {
  const { currentTrack, isPlaying } = usePlayer();
  // The mini card stays hidden until playback starts (e.g. a track restored
  // on page load should not pop up a video on its own).
  const [dismissed, setDismissed] = useState(true);
  const active = currentTrack?.source === "youtube";
  const mode = !active ? "hidden" : stage ? "stage" : dismissed ? "hidden" : "mini";

  // User-chosen mini position (top-left, px); null = default bottom-right.
  const posRef = useRef(readPos());
  const modeRef = useRef("hidden");

  // Header container lives inside the dock, above the iframe host.
  const [header] = useState(() => {
    const el = document.createElement("div");
    el.className = "yt-dock__header";
    return el;
  });

  useEffect(() => {
    const host = ensureHost();
    host.parentElement.insertBefore(header, host);
    return () => header.remove();
  }, [header]);

  // Playing (again) always brings the video back.
  useEffect(() => {
    if (isPlaying) setDismissed(false);
  }, [isPlaying, currentTrack?.id]);

  const layout = useCallback(() => {
    const dock = ensureHost().parentElement;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (mode === "stage") {
      const slot = document.querySelector(".np__video");
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      dock.style.left = `${rect.left}px`;
      dock.style.top = `${rect.top}px`;
      dock.style.width = `${rect.width}px`;
      return;
    }
    if (mode !== "mini") return;

    const mobile = vw < 900;
    const width = mobile ? (large ? vw - 16 : 240) : large ? 560 : 340;
    dock.style.width = `${width}px`;
    const height = dock.offsetHeight;
    const bar = document.querySelector(".player");
    const floor = (bar ? bar.getBoundingClientRect().top : vh) - MARGIN;
    const maxX = vw - width - (mobile ? 8 : MARGIN);
    const maxY = floor - height;
    const pos = posRef.current || { x: maxX, y: maxY };
    dock.style.left = `${Math.max(mobile ? 8 : MARGIN, Math.min(pos.x, maxX))}px`;
    dock.style.top = `${Math.max(MARGIN, Math.min(pos.y, maxY))}px`;
  }, [mode, large]);

  // Apply the mode: classes, then an animated move to the new geometry.
  useEffect(() => {
    const dock = ensureHost().parentElement;
    const prev = modeRef.current;
    modeRef.current = mode;

    dock.classList.toggle("is-visible", mode !== "hidden");
    dock.classList.toggle("is-stage", mode === "stage");
    if (mode === "hidden") return undefined;

    dock.classList.toggle("is-moving", prev !== "hidden");
    layout();
    // Lay out again next frame, once the stage slot has its final size.
    const frame = requestAnimationFrame(layout);
    const done = setTimeout(() => dock.classList.remove("is-moving"), MOVE_MS + 40);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [mode, large, layout]);

  // Stay in place on resize, and on scroll for the mobile Now Playing view.
  useEffect(() => {
    if (mode === "hidden") return undefined;
    const observer = new ResizeObserver(() => layout());
    observer.observe(document.body);
    const slot = document.querySelector(".np__video");
    if (slot) observer.observe(slot);
    const onChange = () => layout();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [mode, layout]);

  useEffect(() => {
    ensureHost().parentElement.classList.toggle("is-playing", active && !!isPlaying);
  }, [active, isPlaying]);

  // Drag the mini card by its header.
  useEffect(() => {
    if (mode !== "mini") return undefined;
    const dock = ensureHost().parentElement;
    let start = null;

    const onDown = (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const rect = dock.getBoundingClientRect();
      start = { px: event.clientX, py: event.clientY, x: rect.left, y: rect.top };
      header.setPointerCapture(event.pointerId);
      dock.classList.remove("is-moving");
      dock.classList.add("is-dragging");
    };
    const onMove = (event) => {
      if (!start) return;
      posRef.current = { x: start.x + event.clientX - start.px, y: start.y + event.clientY - start.py };
      layout();
    };
    const onUp = () => {
      if (!start) return;
      start = null;
      dock.classList.remove("is-dragging");
      // Remember the clamped position actually on screen.
      const rect = dock.getBoundingClientRect();
      posRef.current = { x: rect.left, y: rect.top };
      savePos(posRef.current);
    };

    header.addEventListener("pointerdown", onDown);
    header.addEventListener("pointermove", onMove);
    header.addEventListener("pointerup", onUp);
    header.addEventListener("pointercancel", onUp);
    return () => {
      header.removeEventListener("pointerdown", onDown);
      header.removeEventListener("pointermove", onMove);
      header.removeEventListener("pointerup", onUp);
      header.removeEventListener("pointercancel", onUp);
    };
  }, [mode, header, layout]);

  if (!active) return null;

  return createPortal(
    <>
      <span className="yt-dock__live" aria-hidden="true">
        <span /><span /><span />
      </span>
      <div className="yt-dock__meta" title="Drag to move">
        <p className="yt-dock__title">{currentTrack.title}</p>
        <p className="yt-dock__artist">{currentTrack.artists?.join(", ")}</p>
      </div>
      <button
        type="button"
        className="yt-dock__btn"
        onClick={onToggleLarge}
        aria-label={large ? "Shrink video" : "Enlarge video"}
        title={large ? "Shrink video" : "Enlarge video"}
      >
        <Icon name={large ? "shrink" : "expand"} size={14} />
      </button>
      {!isPlaying ? (
        <button
          type="button"
          className="yt-dock__btn"
          onClick={() => setDismissed(true)}
          aria-label="Close video"
          title="Close video (it comes back when you press play)"
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </>,
    header
  );
}
