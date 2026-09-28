import React, { useState } from "react";
import Icon from "./Icon";
import Artwork from "./Artwork";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { pluralize } from "../utils/format";

/**
 * Body of the "Add to playlist" modal: pick an existing playlist, or create
 * one that starts with this track already in it.
 */
export default function AddToPlaylistDialog({ track }) {
  const { playlists, addToPlaylist, createPlaylist } = useLibrary();
  const { closeModal, toast } = useUI();
  const [creating, setCreating] = useState(playlists.length === 0);
  const [name, setName] = useState("");

  const choose = (playlist) => {
    const added = addToPlaylist(playlist.id, track.id);
    closeModal();
    toast(
      added ? `Added to ${playlist.name}` : `Already in ${playlist.name}`,
      { icon: added ? "check" : "warning" }
    );
  };

  const create = (event) => {
    event.preventDefault();
    const playlist = createPlaylist({
      name,
      artwork: track.artwork,
      trackIds: [track.id],
    });
    closeModal();
    toast(`Created ${playlist.name}`, { icon: "check" });
  };

  return (
    <div className="add-dialog">
      <div className="add-dialog__track">
        <Artwork src={track.artwork} alt="" size={44} />
        <div className="add-dialog__meta">
          <span className="add-dialog__title">{track.title}</span>
          <span className="add-dialog__artist">{track.artists?.join(", ")}</span>
        </div>
      </div>

      {creating ? (
        <form className="add-dialog__form" onSubmit={create}>
          <label className="field">
            <span className="field__label">Playlist name</span>
            <input
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My playlist"
              maxLength={80}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </label>
          <div className="add-dialog__actions">
            {playlists.length > 0 ? (
              <button type="button" className="btn btn--subtle" onClick={() => setCreating(false)}>
                Back
              </button>
            ) : null}
            <button type="submit" className="btn btn--primary">
              Create and add
            </button>
          </div>
        </form>
      ) : (
        <>
          <button type="button" className="add-dialog__new" onClick={() => setCreating(true)}>
            <span className="add-dialog__new-icon">
              <Icon name="plus" size={18} />
            </span>
            New playlist
          </button>

          <ul className="add-dialog__list">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button type="button" className="add-dialog__option" onClick={() => choose(playlist)}>
                  <Artwork src={playlist.artwork} alt="" size={40} />
                  <span className="add-dialog__meta">
                    <span className="add-dialog__title">{playlist.name}</span>
                    <span className="add-dialog__artist">
                      {pluralize(playlist.trackIds.length, "song")}
                    </span>
                  </span>
                  {playlist.trackIds.includes(track.id) ? (
                    <Icon name="check" size={16} className="add-dialog__check" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
