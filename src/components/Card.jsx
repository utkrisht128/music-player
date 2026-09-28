import React from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import Artwork from "./Artwork";

/**
 * The browse card used for albums, artists, playlists and tracks.
 *
 * The whole card is a link to the destination; the play button floats above
 * it as a separate control so "open" and "play" stay distinct actions rather
 * than one ambiguous click target.
 */
export default function Card({
  to,
  title,
  subtitle,
  artwork,
  round = false,
  isPlaying = false,
  onPlay,
  onContextMenu,
}) {
  return (
    <div className="card" onContextMenu={onContextMenu}>
      <Link to={to} className="card__link">
        <div className="card__art-wrap">
          <Artwork src={artwork} alt="" rounded={round} className="card__art" />
        </div>
        <div className="card__text">
          <span className="card__title">{title}</span>
          {subtitle ? <span className="card__subtitle">{subtitle}</span> : null}
        </div>
      </Link>

      {onPlay ? (
        <button
          type="button"
          className={`card__play${isPlaying ? " is-playing" : ""}`}
          aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPlay();
          }}
        >
          <Icon name={isPlaying ? "pause" : "play"} size={22} />
        </button>
      ) : null}
    </div>
  );
}
