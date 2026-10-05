import React, { useRef } from "react";
import Icon from "../components/Icon";
import QuotaMeter from "../components/QuotaMeter";
import { ACCENTS, TEXT_SIZES, useSettings } from "../state/SettingsContext";
import { useUI } from "../state/UIContext";
import { useSeo } from "../hooks/useSeo";

// Everything the app stores is under the "mp:" prefix. Caches are left out of
// backups: they rebuild themselves and would only bloat the file.
const PREFIX = "mp:";
const SKIP = new Set(["mp:yt:cache", "mp:yt:catalog", "mp:durations", "mp:yt:quota"]);

function exportBackup() {
  const data = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key.startsWith(PREFIX) && !SKIP.has(key)) data[key] = window.localStorage.getItem(key);
  }
  const blob = new Blob([JSON.stringify({ app: "resonate", version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resonate-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="setting">
      <span className="setting__text">
        <span className="setting__label">{label}</span>
        {description ? <span className="setting__desc">{description}</span> : null}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function SettingsPage() {
  useSeo({ title: "Settings", noindex: true });
  const settings = useSettings();
  const { toast } = useUI();
  const fileRef = useRef(null);

  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.app !== "resonate" || typeof parsed.data !== "object") throw new Error("not a backup");
      if (!window.confirm("Replace your playlists, liked songs, history and settings with this backup?")) return;
      Object.entries(parsed.data).forEach(([key, value]) => {
        if (key.startsWith(PREFIX) && typeof value === "string") window.localStorage.setItem(key, value);
      });
      window.location.reload();
    } catch (error) {
      toast("That file isn't a Resonate backup.", { tone: "error" });
    }
  };

  return (
    <div className="page settings">
      <h1 className="page__title">Settings</h1>

      <section className="settings__group">
        <h2 className="settings__heading">Appearance</h2>
        <div className="setting">
          <span className="setting__text">
            <span className="setting__label">Theme</span>
          </span>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {["dark", "light", "system"].map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                className={`segmented__option${settings.theme === theme ? " is-active" : ""}`}
                onClick={() => settings.update({ theme })}
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="setting__text">
            <span className="setting__label">Accent colour</span>
            <span className="setting__desc">Used for play buttons, progress and highlights.</span>
          </span>
          <div className="swatches" role="radiogroup" aria-label="Accent colour">
            {Object.entries(ACCENTS).map(([name, [color]]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={settings.accent === name}
                aria-label={name}
                title={name[0].toUpperCase() + name.slice(1)}
                className={`swatch${settings.accent === name ? " is-active" : ""}`}
                style={{ background: color }}
                onClick={() => settings.update({ accent: name })}
              />
            ))}
          </div>
        </div>
        <div className="setting">
          <span className="setting__text">
            <span className="setting__label">Text size</span>
          </span>
          <div className="segmented" role="radiogroup" aria-label="Text size">
            {Object.keys(TEXT_SIZES).map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={settings.textSize === size}
                className={`segmented__option${settings.textSize === size ? " is-active" : ""}`}
                onClick={() => settings.update({ textSize: size })}
              >
                {size[0].toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <Toggle
          label="Compact lists"
          description="Tighter song rows so more fit on screen."
          checked={settings.compact}
          onChange={(compact) => settings.update({ compact })}
        />
        <Toggle
          label="Reduce motion"
          description="Turn off animations and transitions."
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => settings.update({ reduceMotion })}
        />
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Personalisation</h2>
        <label className="setting">
          <span className="setting__text">
            <span className="setting__label">What should we call you?</span>
            <span className="setting__desc">Shown in the greeting on Home. Leave empty to use your account name.</span>
          </span>
          <input
            className="input settings__name"
            value={settings.greetingName}
            maxLength={40}
            placeholder="Your name"
            onChange={(e) => settings.update({ greetingName: e.target.value })}
          />
        </label>
        <div className="settings__actions settings__reset">
          <button
            type="button"
            className="btn btn--subtle"
            onClick={() => {
              if (window.confirm("Reset all settings to their defaults?")) {
                settings.reset();
                toast("Settings reset");
              }
            }}
          >
            Reset all settings
          </button>
        </div>
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Playback</h2>
        <Toggle
          label="Background playback"
          description="Keep music playing when screen is locked or app is in the background."
          checked={settings.backgroundPlay}
          onChange={(backgroundPlay) => settings.update({ backgroundPlay })}
        />
        <Toggle
          label="Keep screen awake"
          description="Prevent the screen from dimming or going to sleep while music is playing."
          checked={settings.keepAwake}
          onChange={(keepAwake) => settings.update({ keepAwake })}
        />
        <Toggle
          label="Autoplay"
          description="When your queue ends, keep playing similar songs."
          checked={settings.autoplay}
          onChange={(autoplay) => settings.update({ autoplay })}
        />
        <div className="setting">
          <span className="setting__text">
            <span className="setting__label">Crossfade</span>
            <span className="setting__desc">Fade songs out and in instead of stopping abruptly.</span>
          </span>
          <select
            className="select"
            value={settings.crossfade}
            onChange={(e) => settings.update({ crossfade: Number(e.target.value) })}
            aria-label="Crossfade length"
          >
            <option value={0}>Off</option>
            <option value={2}>2 seconds</option>
            <option value={4}>4 seconds</option>
            <option value={6}>6 seconds</option>
            <option value={8}>8 seconds</option>
          </select>
        </div>
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Your data</h2>
        <p className="setting__desc settings__note">
          Playlists, liked songs and history are saved in this browser only. Export a backup to move them to another
          device or browser.
        </p>
        <div className="settings__actions">
          <button type="button" className="btn btn--ghost" onClick={() => { exportBackup(); toast("Backup downloaded", { icon: "download" }); }}>
            <Icon name="download" size={16} />
            <span>Export backup</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} />
            <span>Import backup</span>
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
        </div>
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">YouTube</h2>
        <QuotaMeter />
      </section>

      <section className="settings__group">
        <h2 className="settings__heading">Keyboard shortcuts</h2>
        <dl className="shortcuts">
          {[
            ["Space", "Play / pause"],
            ["← / →", "Seek 5 seconds"],
            ["Shift + ← / →", "Previous / next song"],
            ["↑ / ↓", "Volume"],
            ["M", "Mute"],
            ["S", "Shuffle"],
            ["R", "Repeat"],
            ["L", "Like"],
            ["/", "Search"],
          ].map(([key, action]) => (
            <React.Fragment key={key}>
              <dt><kbd>{key}</kbd></dt>
              <dd>{action}</dd>
            </React.Fragment>
          ))}
        </dl>
      </section>
    </div>
  );
}
