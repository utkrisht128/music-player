import React from "react";

/**
 * One icon set for the whole app.
 *
 * Inline SVG rather than the old PNG sprites: PNGs could not take the
 * accent colour on active states, blurred on high-DPI screens, and each one
 * was a separate request. These inherit `currentColor` and scale cleanly.
 *
 * Icons are decorative by default (aria-hidden) — the button that wraps them
 * carries the accessible name.
 */

const PATHS = {
  home: "M12 3.1 3 10.2V21h6v-6h6v6h6V10.2L12 3.1Z",
  search:
    "M10.5 3a7.5 7.5 0 1 0 4.55 13.46l4.24 4.25 1.42-1.42-4.25-4.24A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z",
  library:
    "M3 3h2v18H3V3Zm4 0h2v18H7V3Zm5.2.6 1.9-.5 4.7 17.4-1.9.5L12.2 3.6ZM19 21V3h2v18h-2Z",
  play: "M8 5.2c0-.9 1-1.4 1.7-1L19 9.9a1.2 1.2 0 0 1 0 2l-9.3 5.8c-.8.5-1.7 0-1.7-1V5.2Z",
  pause: "M7 4h3.5v16H7V4Zm6.5 0H17v16h-3.5V4Z",
  next: "M6 5.2c0-.9 1-1.4 1.7-1l7.6 4.7c.7.4.7 1.5 0 2L7.7 15.6c-.8.5-1.7 0-1.7-1V5.2ZM17 4h2v16h-2V4Z",
  previous: "M18 5.2c0-.9-1-1.4-1.7-1L8.7 8.9c-.7.4-.7 1.5 0 2l7.6 4.7c.8.5 1.7 0 1.7-1V5.2ZM7 4H5v16h2V4Z",
  shuffle:
    "M18.6 3.6 22 7l-3.4 3.4-1.4-1.4 1-1H16a3 3 0 0 0-2.4 1.2l-.9 1.2-1.2-1.7.7-.9A5 5 0 0 1 16 6h2.2l-1-1 1.4-1.4ZM2 7h3a5 5 0 0 1 4 2l4.6 6.2A3 3 0 0 0 16 16h2.2l-1-1 1.4-1.4L22 17l-3.4 3.4-1.4-1.4 1-1H16a5 5 0 0 1-4-2L7.4 9.8A3 3 0 0 0 5 9H2V7Zm0 8h3a3 3 0 0 0 2.4-1.2l.6-.8 1.2 1.7-.4.5A5 5 0 0 1 5 17H2v-2Z",
  repeat:
    "M7 4h10a4 4 0 0 1 4 4v3h-2V8a2 2 0 0 0-2-2H7v2.5L3 5.5 7 2.5V4Zm10 16H7a4 4 0 0 1-4-4v-3h2v3a2 2 0 0 0 2 2h10v-2.5l4 3-4 3V20Z",
  volumeHigh:
    "M11 4.5v15c0 .8-1 1.3-1.6.7L5.6 17H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.6l3.8-3.2c.6-.6 1.6-.1 1.6.7Zm3.5 2.1a6 6 0 0 1 0 10.8l-.9-1.8a4 4 0 0 0 0-7.2l.9-1.8Zm2-3.4a9.5 9.5 0 0 1 0 17.6l-.9-1.8a7.5 7.5 0 0 0 0-14l.9-1.8Z",
  volumeLow:
    "M11 4.5v15c0 .8-1 1.3-1.6.7L5.6 17H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.6l3.8-3.2c.6-.6 1.6-.1 1.6.7Zm3.5 2.1a6 6 0 0 1 0 10.8l-.9-1.8a4 4 0 0 0 0-7.2l.9-1.8Z",
  volumeMuted:
    "M11 4.5v15c0 .8-1 1.3-1.6.7L5.6 17H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.6l3.8-3.2c.6-.6 1.6-.1 1.6.7Zm3.3 4 2.2 2.2 2.2-2.2 1.4 1.4-2.2 2.2 2.2 2.2-1.4 1.4-2.2-2.2-2.2 2.2-1.4-1.4 2.2-2.2-2.2-2.2 1.4-1.4Z",
  heart:
    "M12 20.7 4.3 13a5 5 0 0 1 7.1-7.1l.6.6.6-.6a5 5 0 0 1 7.1 7.1L12 20.7Z",
  heartOutline:
    "M12 20.7 4.3 13a5 5 0 0 1 7.1-7.1l.6.6.6-.6a5 5 0 0 1 7.1 7.1L12 20.7Zm-6.3-9.1L12 17.9l6.3-6.3a3 3 0 1 0-4.2-4.2L12 9.4 9.9 7.4a3 3 0 1 0-4.2 4.2Z",
  queue:
    "M3 5h13v2H3V5Zm0 4h13v2H3V9Zm0 4h9v2H3v-2Zm14.5-4.5v6.2a2.8 2.8 0 1 0 2 2.7V11h2.5V8.5h-4.5Z",
  more: "M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  plus: "M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z",
  check: "M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 8.2 19 6.8 9.6 16.2Z",
  close: "M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3 1.4 1.4Z",
  chevronDown: "M12 15.5 4.9 8.4l1.4-1.4L12 12.7l5.7-5.7 1.4 1.4L12 15.5Z",
  chevronLeft: "M15.5 4.9 8.4 12l7.1 7.1 1.4-1.4L11.2 12l5.7-5.7-1.4-1.4Z",
  chevronRight: "M8.5 19.1 15.6 12 8.5 4.9 7.1 6.3 12.8 12l-5.7 5.7 1.4 1.4Z",
  trash: "M9 3h6l1 2h4v2H4V5h4l1-2ZM5.5 9h13l-1 12H6.5l-1-12Z",
  edit: "M3 17.2 16.9 3.4l3.7 3.7L6.8 21H3v-3.8Zm14.5-12L15.9 6.8l1.3 1.3 1.6-1.6-1.3-1.3Z",
  artist:
    "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 11c4.4 0 8 2.5 8 5.5V21H4v-1.5C4 16.5 7.6 14 12 14Z",
  people:
    "M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 9c3.9 0 7 2 7 4.5V20H2v-2.5C2 15 5.1 13 9 13Zm7.5-8.8a3.5 3.5 0 0 1 0 6.6 5.5 5.5 0 0 0 0-6.6ZM18 13.3c2.3.6 4 2.2 4 4.2V20h-4v-2.5c0-1.6-.7-3-2-4.1.7-.1 1.4 0 2 .1Z",
  album:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 2.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z",
  device: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6v2h3v2H7v-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  clock: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v6.4l4.7 2.8 1-1.7-3.7-2.2V7Z",
  music: "M20 3v12.5a3.5 3.5 0 1 1-2-3.2V7.6L10 9.3v8.2a3.5 3.5 0 1 1-2-3.2V6.5L20 3Z",
  warning: "M12 2 23 21H1L12 2Zm-1 6v7h2V8h-2Zm0 9v2h2v-2h-2Z",
  lyrics: "M4 4h16v2H4V4Zm0 5h10v2H4V9Zm0 5h7v2H4v-2Zm15-5v6.6a3 3 0 1 1-2-2.8V9h2Z",
  video: "M3 5h13a1 1 0 0 1 1 1v3.5l4-2.5v10l-4-2.5V18a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  expand: "M4 4h6v2H6v4H4V4Zm10 0h6v6h-2V6h-4V4ZM4 14h2v4h4v2H4v-6Zm14 0h2v6h-6v-2h4v-4Z",
  shrink: "M8 4h2v6H4V8h4V4Zm6 0h2v4h4v2h-6V4ZM4 14h6v6H8v-4H4v-2Zm10 0h6v2h-4v4h-2v-6Z",
  moon: "M20.7 14.6A8.5 8.5 0 0 1 9.4 3.3 9 9 0 1 0 20.7 14.6Z",
  share: "M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1Z",
  settings: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5-2.2-1.8ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z",
  chart: "M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z",
  download: "M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3V3ZM4 18h16v2H4v-2Z",
  upload: "M11 16V6.8L7.7 10.1 6.3 8.7 12 3l5.7 5.7-1.4 1.4L13 6.8V16h-2ZM4 18h16v2H4v-2Z",
  radio: "M4 8h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm1.6-1.6L16.2 2.6l.7 1.9L9.9 7H5.6Zm2.9 5.1a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM14 12v1.5h5V12h-5Zm0 3v1.5h5V15h-5Z",
  drag: "M9 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18 19a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z",
  trending: "M3 17.6 9.3 11.3l4 4L20 8.6V13h2V5h-8v2h4.6l-5.3 5.3-4-4L1.6 16.2 3 17.6Z",
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v10.6l3.3-3.3a1 1 0 0 1 1.4 0l2.8 2.8 4.3-4.3a1 1 0 0 1 1.4 0L19 11.6V5H5Zm3.5 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z",
  sparkle: "M11 2h2l1.4 4.6L19 8v2l-4.6 1.4L13 16h-2l-1.4-4.6L5 10V8l4.6-1.4L11 2Zm7 12h1.5l.7 2.3 2.3.7v1.5l-2.3.7-.7 2.3H18l-.7-2.3-2.3-.7V17l2.3-.7.7-2.3ZM5 15h1.2l.5 1.8 1.8.5v1.2l-1.8.5L6.2 21H5l-.5-1.8-1.8-.5v-1.2l1.8-.5L5 15Z",
  undo: "M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A7.5 7.5 0 0 1 20.2 16l2.4-.8A10 10 0 0 0 12.5 8Z",
};

export default function Icon({ name, size = 20, className = "", title, ...rest }) {
  const path = PATHS[name];
  if (!path) {
    // A typo in an icon name should be obvious in development, not a blank gap.
    // eslint-disable-next-line no-console
    console.warn(`Unknown icon: ${name}`);
    return null;
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={path} />
    </svg>
  );
}
