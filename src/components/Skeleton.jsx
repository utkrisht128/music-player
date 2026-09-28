import React from "react";

/**
 * Loading placeholders shaped like the content they stand in for, so the
 * layout does not jump when real data lands. Sections stay blank-free while
 * artwork and metadata resolve.
 */

export function SkeletonBlock({ width, height, radius = "var(--r-sm)", className = "" }) {
  return <span className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} />;
}

export function SkeletonCard() {
  return (
    <div className="card card--skeleton" aria-hidden="true">
      <SkeletonBlock width="100%" height="auto" className="skeleton--square" radius="var(--r-md)" />
      <SkeletonBlock width="75%" height="14px" />
      <SkeletonBlock width="50%" height="12px" />
    </div>
  );
}

export function SkeletonShelf({ count = 6, title = true }) {
  return (
    <section className="shelf" aria-busy="true" aria-label="Loading">
      {title ? <SkeletonBlock width="180px" height="24px" className="shelf__skeleton-title" /> : null}
      <div className="shelf__grid">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </section>
  );
}

export function SkeletonRows({ count = 8 }) {
  return (
    <div aria-busy="true" aria-label="Loading tracks">
      {Array.from({ length: count }, (_, i) => (
        <div className="track-row track-row--skeleton" key={i} aria-hidden="true">
          <SkeletonBlock width="40px" height="40px" radius="var(--r-sm)" />
          <div className="track-row__skeleton-text">
            <SkeletonBlock width="40%" height="13px" />
            <SkeletonBlock width="25%" height="11px" />
          </div>
        </div>
      ))}
    </div>
  );
}
