import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { getQuotaStatus, isYouTubeConfigured, onQuotaChange } from "../services/musicService";

function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${total % 60}s`;
}

/**
 * Today's YouTube quota: an estimate counted from this browser's own requests
 * (the API does not report it), and the exact reset time (midnight Pacific).
 */
export default function QuotaMeter() {
  const [status, setStatus] = useState(getQuotaStatus);
  const [now, setNow] = useState(Date.now());

  useEffect(() => onQuotaChange(setStatus), []);

  // Tick the countdown, and roll over to a fresh day once the reset passes.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setStatus((current) => (Date.now() >= current.resetAt.getTime() ? getQuotaStatus() : current));
    }, status.exhausted ? 1000 : 30000);
    return () => clearInterval(timer);
  }, [status.exhausted]);

  if (!isYouTubeConfigured()) return null;

  const percent = Math.round((status.used / status.limit) * 100);
  const resetTime = status.resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tone = status.exhausted ? " is-out" : percent >= 80 ? " is-low" : "";
  const detail = `Estimated from this browser (${status.used.toLocaleString()} / ${status.limit.toLocaleString()} units). Resets at ${resetTime}, midnight Pacific.`;

  return (
    <div className={`quota${tone}`} role="status" title={detail}>
      <Icon name={status.exhausted ? "warning" : "video"} size={14} />
      <span className="quota__label">
        {status.exhausted
          ? "YouTube search paused. Library and saved songs still work"
          : `~${status.searchesLeft} YouTube searches left`}
      </span>
      <span
        className="quota__bar"
        role="progressbar"
        aria-label="YouTube quota used today"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="quota__reset">
        {status.exhausted ? "back in " : "resets in "}
        {countdown(status.resetAt.getTime() - now)}
      </span>
    </div>
  );
}
