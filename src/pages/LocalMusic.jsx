import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import Artwork from "../components/Artwork";
import TrackList from "../components/TrackList";
import EmptyState from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { useUI } from "../state/UIContext";
import { usePlayer } from "../state/PlayerContext";
import {
  addLocalSongs,
  getLocalSongs,
  getStorageEstimate,
  isAudioFile,
  removeLocalSong,
  requestPersistence,
  updateLocalSong,
} from "../utils/localSongs";
import { useSeo } from "../hooks/useSeo";

/**
 * "Your uploads": songs the listener adds from their own device.
 *
 * Files are saved in this browser (IndexedDB) so they are still here after a
 * refresh. Nothing is uploaded to a server. Title, artist and cover art come
 * from the file's ID3 tags when present, otherwise from the filename.
 */

const ACCEPTED = ".mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.opus,.webm,audio/*";
const LABEL = "Your uploads";

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`;
}

export default function LocalMusicPage() {
  useSeo({ title: "Your Uploads", noindex: true });
  const [tracks, setTracks] = useState(null);
  const [filter, setFilter] = useState("");
  const [managing, setManaging] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(null);
  const fileRef = useRef(null);
  const folderRef = useRef(null);
  const dragDepth = useRef(0);
  const { toast } = useUI();
  const { playTracks, shufflePlay } = usePlayer();

  const reload = useCallback(async () => {
    try {
      setTracks(await getLocalSongs());
    } catch (error) {
      setTracks([]);
      toast(error.message || "Could not open your saved songs.", { tone: "error", icon: "warning" });
    }
    setStorage(await getStorageEstimate());
  }, [toast]);

  useEffect(() => { reload(); }, [reload]);

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;
      const audio = files.filter(isAudioFile);
      const skipped = files.length - audio.length;
      if (audio.length === 0) {
        toast("Those files are not audio your browser can play.", { tone: "error", icon: "warning" });
        return;
      }
      setBusy(true);
      requestPersistence();
      try {
        const { added, duplicates } = await addLocalSongs(audio);
        const notes = [
          duplicates ? `${duplicates} already added` : "",
          skipped ? `${skipped} not audio` : "",
        ].filter(Boolean).join(", ");
        toast(`Added ${added} song${added === 1 ? "" : "s"}${notes ? ` (${notes})` : ""}`, { icon: "check" });
      } catch (error) {
        toast(
          error?.name === "QuotaExceededError" ? "Your browser is out of storage space for songs." : "Could not save those songs.",
          { tone: "error", icon: "warning" }
        );
      }
      setBusy(false);
      reload();
    },
    [toast, reload]
  );

  const remove = async (track) => {
    await removeLocalSong(track.id);
    toast(`Removed "${track.title}"`, { icon: "trash" });
    reload();
  };

  const rename = async (track) => {
    const title = window.prompt("Song title", track.title);
    if (title == null) return;
    const artist = window.prompt("Artist", track.artists[0] === "Unknown artist" ? "" : track.artists[0]);
    if (artist == null) return;
    await updateLocalSong(track.id, { title: title.trim() || track.title, artist: artist.trim() });
    reload();
  };

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!tracks || !q) return tracks || [];
    return tracks.filter((t) => `${t.title} ${t.artists.join(" ")} ${t.albumTitle}`.toLowerCase().includes(q));
  }, [tracks, filter]);

  const totalSize = (tracks || []).reduce((sum, t) => sum + t.size, 0);

  // Drop files anywhere on the page. The depth counter stops the highlight
  // flickering as the pointer crosses child elements.
  const dropProps = {
    onDragEnter: (event) => { event.preventDefault(); dragDepth.current++; setDragging(true); },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDragOver: (event) => event.preventDefault(),
    onDrop: (event) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(event.dataTransfer.files);
    },
  };

  return (
    <div className={`page local__drop${dragging ? " is-over" : ""}`} {...dropProps}>
      <div className="page__header-row">
        <h1 className="page__title">{LABEL}</h1>
        <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name={busy ? "clock" : "upload"} size={16} />
          <span>{busy ? "Adding…" : "Add songs"}</span>
        </button>
      </div>

      <p className="page__note">
        Add songs you have downloaded and play them here. They are saved in this browser only, never
        uploaded, and stay after a refresh.
        {tracks?.length ? ` ${tracks.length} song${tracks.length === 1 ? "" : "s"} · ${formatBytes(totalSize)}` : ""}
        {storage?.quota ? ` of about ${formatBytes(storage.quota)} available.` : ""}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="sr-only"
        onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
      />
      <input
        ref={folderRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        className="sr-only"
        onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
      />

      {tracks === null ? (
        <SkeletonRows count={6} />
      ) : tracks.length === 0 ? (
        <div className={`dropzone${dragging ? " is-over" : ""}`}>
          <EmptyState
            icon="upload"
            title="Add your downloaded songs"
            message="Drag audio files or a folder here, or choose them from your device. MP3, WAV, OGG, M4A and FLAC work if your browser supports them."
            action="Choose files"
            onAction={() => fileRef.current?.click()}
          />
          <p className="search__hint" style={{ textAlign: "center", paddingBottom: 24 }}>
            <button type="button" className="link-btn" onClick={() => folderRef.current?.click()}>
              Or add a whole folder
            </button>
          </p>
        </div>
      ) : (
        <>
          <div className="local__toolbar">
            <button type="button" className="btn btn--primary" onClick={() => playTracks(shown, 0, LABEL)}>
              <Icon name="play" size={16} /> <span>Play all</span>
            </button>
            <button type="button" className="btn btn--subtle" onClick={() => shufflePlay(shown, LABEL)}>
              <Icon name="shuffle" size={16} /> <span>Shuffle</span>
            </button>
            <button type="button" className="btn btn--subtle" onClick={() => folderRef.current?.click()}>
              <Icon name="plus" size={16} /> <span>Add folder</span>
            </button>
            <button
              type="button"
              className={`btn ${managing ? "btn--primary" : "btn--ghost"}`}
              onClick={() => setManaging((on) => !on)}
            >
              <Icon name={managing ? "check" : "edit"} size={16} /> <span>{managing ? "Done" : "Edit"}</span>
            </button>
            <input
              type="search"
              className="search__input"
              style={{ flex: "1 1 180px", maxWidth: 280, padding: "8px 14px", borderRadius: 999 }}
              placeholder="Filter your songs"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter your songs"
            />
          </div>

          {managing ? (
            <ul className="track-list" style={{ listStyle: "none", padding: 0 }}>
              {shown.map((track) => (
                <li key={track.id} className="top-result" style={{ padding: 8, marginBottom: 4, gap: 12 }}>
                  <Artwork src={track.artwork} alt="" size={40} />
                  <div className="top-result__text" style={{ flex: 1, minWidth: 0 }}>
                    <span>{track.title}</span>
                    <span className="search__hint">{track.artists.join(", ")} · {formatBytes(track.size)}</span>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => rename(track)} aria-label={`Rename ${track.title}`}>
                    <Icon name="edit" size={18} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => remove(track)} aria-label={`Remove ${track.title}`}>
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          ) : shown.length ? (
            <TrackList tracks={shown} contextLabel={LABEL} showArtwork showAlbum />
          ) : (
            <p className="search__hint">No songs match "{filter}".</p>
          )}
        </>
      )}
    </div>
  );
}
