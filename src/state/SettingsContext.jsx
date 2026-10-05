import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { readJSON, writeJSON } from "../utils/storage";

/**
 * Listener preferences. Outermost provider: the player reads autoplay and
 * crossfade from here.
 */

const SettingsContext = createContext(null);
const KEY = "settings";

/** Accent presets: [base, hover, press]. Each works on both themes. */
export const ACCENTS = {
  green: ["#1db954", "#1ed760", "#169c46"],
  blue: ["#3b82f6", "#60a5fa", "#2563eb"],
  purple: ["#a855f7", "#c084fc", "#9333ea"],
  pink: ["#ec4899", "#f472b6", "#db2777"],
  red: ["#ef4444", "#f87171", "#dc2626"],
  orange: ["#f97316", "#fb923c", "#ea580c"],
  yellow: ["#eab308", "#facc15", "#ca8a04"],
  teal: ["#14b8a6", "#2dd4bf", "#0d9488"],
};

export const TEXT_SIZES = { small: 0.9, default: 1, large: 1.12 };
const FONT_TOKENS = { "--fs-xs": 11, "--fs-sm": 13, "--fs-md": 14, "--fs-lg": 16, "--fs-xl": 22, "--fs-2xl": 32, "--fs-3xl": 48 };

const DEFAULTS = {
  theme: "dark", // "dark" | "light" | "system"
  autoplay: true, // keep playing similar songs when the queue ends
  crossfade: 0, // seconds of fade between songs; 0 = off
  accent: "green", // key of ACCENTS
  textSize: "default", // key of TEXT_SIZES
  compact: false, // denser track lists
  reduceMotion: false, // disable animations regardless of OS setting
  greetingName: "", // shown on Home ("Good evening, …"); empty = account name
  backgroundPlay: true, // keep playing audio when screen is locked or tab is in background
  keepAwake: false, // prevent screen from sleeping while music is playing
};

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);

function load() {
  const saved = readJSON(KEY, {});
  return {
    theme: pick(saved.theme, ["dark", "light", "system"], DEFAULTS.theme),
    autoplay: bool(saved.autoplay, DEFAULTS.autoplay),
    crossfade: pick(saved.crossfade, [0, 2, 4, 6, 8], DEFAULTS.crossfade),
    accent: pick(saved.accent, Object.keys(ACCENTS), DEFAULTS.accent),
    textSize: pick(saved.textSize, Object.keys(TEXT_SIZES), DEFAULTS.textSize),
    compact: bool(saved.compact, DEFAULTS.compact),
    reduceMotion: bool(saved.reduceMotion, DEFAULTS.reduceMotion),
    greetingName: typeof saved.greetingName === "string" ? saved.greetingName.slice(0, 40) : DEFAULTS.greetingName,
    backgroundPlay: bool(saved.backgroundPlay, DEFAULTS.backgroundPlay),
    keepAwake: bool(saved.keepAwake, DEFAULTS.keepAwake),
  };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => { writeJSON(KEY, settings); }, [settings]);

  // Resolve "system" against the OS and follow it live.
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    const apply = () => {
      const light = settings.theme === "light" || (settings.theme === "system" && media?.matches);
      document.documentElement.dataset.theme = light ? "light" : "dark";
    };
    apply();
    if (settings.theme !== "system" || !media) return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  // Accent colour. Inline custom properties beat the light-theme overrides.
  useEffect(() => {
    const [base, hover, press] = ACCENTS[settings.accent];
    const style = document.documentElement.style;
    style.setProperty("--accent", base);
    style.setProperty("--accent-hover", hover);
    style.setProperty("--accent-press", press);
    style.setProperty("--like", base);
    // Dark text on light accents (yellow, green…), white on the rest.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    style.setProperty("--accent-contrast", 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#ffffff");
  }, [settings.accent]);

  useEffect(() => {
    const scale = TEXT_SIZES[settings.textSize];
    Object.entries(FONT_TOKENS).forEach(([name, px]) =>
      document.documentElement.style.setProperty(name, `${Math.round(px * scale)}px`)
    );
  }, [settings.textSize]);

  useEffect(() => {
    const { dataset } = document.documentElement;
    dataset.density = settings.compact ? "compact" : "comfortable";
    dataset.motion = settings.reduceMotion ? "reduced" : "full";
  }, [settings.compact, settings.reduceMotion]);

  const reset = useCallback(() => setSettings(DEFAULTS), []);

  const update = useCallback((patch) => setSettings((current) => ({ ...current, ...patch })), []);

  const value = useMemo(() => ({ ...settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside a SettingsProvider.");
  return context;
}
