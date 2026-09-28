import React, { useState } from "react";
import Icon from "../Icon";
import Artwork from "../Artwork";
import EmptyState from "../EmptyState";
import { usePlayer } from "../../state/PlayerContext";
import { useTrackActions } from "../../hooks/useTrackActions";

/**
 * Slide-over queue.
 *
 * Split into "now playing" / "next up" so the list answers the question the
 * listener actually has. Reordering is keyboard-first (move up / move down
 * buttons) rather than drag-only, which would be unusable without a mouse.
 */
export default function QueuePanel({ open, onClose }) {
  const { clearQueue } = usePlayer();
  const { upcoming } = useUpcoming();

  return (
    <aside
      className={`queue-panel${open ? " is-open" : ""}`}
      aria-label="Play queue"
      aria-hidden={!open}
      // Keeps the panel out of the tab order entirely while it is closed.
      inert={open ? undefined : ""}
    >
      <header className="queue-panel__head">
        <h2>Queue</h2>
        <div className="queue-panel__head-actions">
          {upcoming.length > 0 ? (
            <button type="button" className="btn btn--subtle queue-panel__clear" onClick={clearQueue}>
              Clear
            </button>
          ) : null}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close queue">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <QueueList className="queue-panel__body" />
    </aside>
  );
}

export function useUpcoming() {
  const { queue, index } = usePlayer();
  return { upcoming: queue.slice(index + 1) };
}

/** The queue contents — used by the slide-over panel and the Now Playing view. */
export function QueueList({ className = "" }) {
  const { queue, index, currentTrack, playAt, removeFromQueue, moveInQueue, contextLabel } =
    usePlayer();
  const { openTrackMenu } = useTrackActions();

  const upcoming = queue.slice(index + 1);
  // Drag-to-reorder (mouse); the up/down buttons remain for keyboard users.
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  return (
  <div className={className}>
    {currentTrack ? (
      <>
        <h3 className="queue-panel__label">Now playing</h3>
        <QueueItem track={currentTrack} isCurrent />
      </>
    ) : null}

    <h3 className="queue-panel__label">
      Next up{contextLabel ? <span className="queue-panel__context"> from {contextLabel}</span> : null}
    </h3>

    {upcoming.length === 0 ? (
      <EmptyState
        icon="queue"
        title="Nothing queued"
        message="Add songs with the ⋮ menu on any track."
      />
    ) : (
      <ul className="queue-panel__list">
        {upcoming.map((track, offset) => {
          const position = index + 1 + offset;
          return (
            <li
              key={`${track.id}-${position}`}
              draggable
              className={`queue-panel__item${dragOver === position ? " is-drop-target" : ""}${
                dragFrom === position ? " is-dragging" : ""
              }`}
              onDragStart={(event) => {
                setDragFrom(position);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(position));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOver !== position) setDragOver(position);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragFrom != null && dragFrom !== position) moveInQueue(dragFrom, position);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
            >
              <QueueItem
                track={track}
                onPlay={() => playAt(position)}
                onRemove={() => removeFromQueue(position)}
                onUp={offset > 0 ? () => moveInQueue(position, position - 1) : null}
                onDown={
                  offset < upcoming.length - 1 ? () => moveInQueue(position, position + 1) : null
                }
                onMenu={(anchor) =>
                  openTrackMenu(track, anchor, {
                    extraItems: [
                      {
                        label: "Remove from queue",
                        icon: "trash",
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => removeFromQueue(position),
                      },
                    ],
                  })
                }
              />
            </li>
          );
        })}
      </ul>
    )}
  </div>
  );
}

function QueueItem({ track, isCurrent = false, onPlay, onRemove, onUp, onDown, onMenu }) {
  return (
    <div className={`queue-item${isCurrent ? " is-current" : ""}`}>
      {isCurrent ? null : <Icon name="drag" size={14} className="queue-item__grip" aria-hidden="true" />}
      <Artwork src={track.artwork} alt="" size={40} />
      <button
        type="button"
        className="queue-item__main"
        onClick={onPlay}
        disabled={!onPlay}
        aria-label={onPlay ? `Play ${track.title}` : undefined}
      >
        <span className="queue-item__title">{track.title}</span>
        <span className="queue-item__artist">{track.artists?.join(", ")}</span>
      </button>

      {isCurrent ? null : (
        <div className="queue-item__actions">
          <button type="button" className="icon-btn" onClick={onUp} disabled={!onUp} aria-label={`Move ${track.title} up`}>
            <Icon name="chevronDown" size={14} className="rotate-180" />
          </button>
          <button type="button" className="icon-btn" onClick={onDown} disabled={!onDown} aria-label={`Move ${track.title} down`}>
            <Icon name="chevronDown" size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`More options for ${track.title}`}
            aria-haspopup="menu"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onMenu?.({ x: rect.left - 160, y: rect.bottom + 4 });
            }}
          >
            <Icon name="more" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${track.title} from queue`}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
