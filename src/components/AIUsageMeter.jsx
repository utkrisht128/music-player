import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { getAIUsage, onAIUsageChange } from "../services/aiUsage";
import { modelLabel } from "../services/aiModels";

/** Live AI status; re-reads every second so countdowns move. */
export function useAIUsage() {
  const [usage, setUsage] = useState(() => getAIUsage());
  useEffect(() => {
    const off = onAIUsageChange(setUsage);
    const timer = setInterval(() => setUsage(getAIUsage()), 1000);
    return () => { off(); clearInterval(timer); };
  }, []);
  const secondsLeft = usage.blocked ? Math.max(0, Math.ceil((usage.readyAt - Date.now()) / 1000)) : 0;
  return { ...usage, secondsLeft };
}

export function formatWait(seconds) {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/**
 * AI status: which Gemini models still have today's free allowance (one dot
 * each), how many requests were made today, and a countdown when Google has
 * asked everyone to wait.
 */
export default function AIUsageMeter({ usage, compact = false }) {
  const { models, modelsLeft, usedToday, blocked, secondsLeft } = usage;
  const low = !blocked && modelsLeft === 1 && models.length > 1;
  const tone = blocked ? " is-blocked" : low ? " is-low" : "";
  const help = `Free AI models (NVIDIA + Gemini), shared by the whole team. When one is busy or used up, the app switches to the next.\n${models
    .map((m) => `${m.available ? "✓" : "✗"} ${modelLabel(m.name)}${m.available ? "" : " (used up today)"}`)
    .join("\n")}`;

  if (blocked) {
    const day = blocked === "day";
    return (
      <div className={`ai-meter${tone}${compact ? " is-compact" : ""}`} role="status" aria-live="polite" title={help}>
        <span className="ai-meter__ring" style={{ "--p": day ? 1 : Math.min(1, secondsLeft / 60) }}>
          <Icon name={day ? "moon" : "clock"} size={14} />
        </span>
        <span className="ai-meter__text">
          <strong>{day ? "Today's free AI is used up" : "The free AI asked us to slow down"}</strong>
          <small>
            {day
              ? `Every model has hit its daily limit. Back at midnight (in ${formatWait(secondsLeft)}).`
              : `Ready again in ${formatWait(secondsLeft)}. Songs you already have still play.`}
          </small>
        </span>
      </div>
    );
  }

  return (
    <div className={`ai-meter${tone}${compact ? " is-compact" : ""}`} role="status" title={help}>
      <span className="ai-meter__live" aria-hidden="true" />
      <span className="ai-meter__text">
        <strong>{low ? "AI ready · last backup model" : "AI ready"}</strong>
        <small>
          <span className="ai-meter__dots" aria-label={`${modelsLeft} of ${models.length} models available`}>
            {models.map((m) => <i key={m.name} className={m.available ? "is-on" : ""} title={modelLabel(m.name)} />)}
          </span>
          {modelsLeft} of {models.length} models · {usedToday} {usedToday === 1 ? "request" : "requests"} today
        </small>
      </span>
    </div>
  );
}
