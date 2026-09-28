import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { importYouTubePlaylist } from "../services/musicService";

/**
 * Paste a YouTube / YouTube Music playlist link and save it as a playlist.
 * Costs about 1 quota unit per 50 songs (plus 1 for the title).
 */
export default function ImportPlaylistDialog() {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { createPlaylist } = useLibrary();
  const { closeModal, toast } = useUI();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { title, description, tracks } = await importYouTubePlaylist(link);
      if (tracks.length === 0) throw new Error("None of the videos in that playlist can be played here.");
      const playlist = createPlaylist({
        name: title,
        description: description.slice(0, 200),
        artwork: tracks[0].artwork,
        trackIds: tracks.map((t) => t.id),
      });
      closeModal();
      toast(`Imported ${tracks.length} songs`, { icon: "check" });
      navigate(`/playlist/${playlist.id}`);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="import-dialog" onSubmit={submit}>
      <label className="import-dialog__label" htmlFor="yt-playlist-link">
        YouTube or YouTube Music playlist link
      </label>
      <input
        id="yt-playlist-link"
        className="input"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://www.youtube.com/playlist?list=…"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        disabled={busy}
      />
      <p className="import-dialog__hint">The playlist must be public or unlisted. Up to 200 songs are imported.</p>
      {error ? <p className="import-dialog__error" role="alert">{error}</p> : null}
      <div className="import-dialog__actions">
        <button type="button" className="btn btn--subtle" onClick={closeModal} disabled={busy}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={busy || !link.trim()}>
          <Icon name="download" size={16} />
          <span>{busy ? "Importing…" : "Import"}</span>
        </button>
      </div>
    </form>
  );
}
