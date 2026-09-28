import React, { useEffect, useState } from "react";
import Icon from "./Icon";

/**
 * Album/playlist/artist artwork with a guaranteed fallback.
 *
 * A broken <img> renders as a torn-icon box, which looked like a bug in the
 * old grid. Here a load failure (or a missing src) swaps to a drawn
 * placeholder instead, so the layout never breaks.
 *
 * `rounded` is for artist avatars; `lazy` is on by default so off-screen
 * shelves do not fetch artwork the listener may never scroll to.
 */
export default function Artwork({
  src,
  alt = "",
  rounded = false,
  size,
  className = "",
  lazy = true,
}) {
  const [failed, setFailed] = useState(false);

  // A new src deserves a fresh attempt — otherwise a single failure would
  // permanently poison the slot as the component is reused down a list.
  useEffect(() => { setFailed(false); }, [src]);

  const style = size ? { width: size, height: size } : undefined;
  const classes = [
    "artwork",
    rounded ? "artwork--round" : "",
    className,
  ].filter(Boolean).join(" ");

  if (!src || failed) {
    return (
      <div className={`${classes} artwork--fallback`} style={style} role="img" aria-label={alt}>
        <Icon name={rounded ? "artist" : "music"} size="45%" />
      </div>
    );
  }

  return (
    <img
      className={classes}
      style={style}
      src={src}
      alt={alt}
      loading={lazy ? "lazy" : "eager"}
      decoding="async"
      draggable="false"
      onError={() => setFailed(true)}
    />
  );
}
