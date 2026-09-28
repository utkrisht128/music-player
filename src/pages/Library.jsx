import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useAsync } from "../hooks/useAsync";
import { getAllAlbums, getAllArtists, getCuratedPlaylists } from "../services/musicService";
import { SkeletonShelf } from "../components/Skeleton";
import { pluralize } from "../utils/format";
import ImportPlaylistDialog from "../components/ImportPlaylistDialog";
import { isYouTubeConfigured } from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

const FILTERS = [
  { id: "playlists", label: "Playlists" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
];

/** Your Library: user playlists first, then everything browsable. */
export default function LibraryPage() {
  useSeo({ title: "Your Library", noindex: true });
  const [filter, setFilter] = useState("playlists");
  const { playlists, createPlaylist, liked } = useLibrary();
  const { toast, openModal } = useUI();
  const navigate = useNavigate();

  const { data, loading } = useAsync(async () => {
    const [albums, artists, curated] = await Promise.all([
      getAllAlbums(),
      getAllArtists(),
      getCuratedPlaylists(),
    ]);
    return { albums, artists, curated };
  }, []);

  const newPlaylist = () => {
    const playlist = createPlaylist({ name: `My Playlist #${playlists.length + 1}` });
    toast("Playlist created", { icon: "check" });
    navigate(`/playlist/${playlist.id}`);
  };

  return (
    <div className="page">
      <div className="page__header-row">
        <h1 className="page__title">Your Library</h1>
        <div className="page__header-actions">
          {isYouTubeConfigured() ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => openModal({ title: "Import from YouTube", body: <ImportPlaylistDialog /> })}
            >
              <Icon name="download" size={16} />
              <span>Import</span>
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={newPlaylist}>
            <Icon name="plus" size={16} />
            <span>New playlist</span>
          </button>
        </div>
      </div>

      <div className="filters" role="tablist" aria-label="Library filter">
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`filters__chip${filter === entry.id ? " is-active" : ""}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <SkeletonShelf count={8} title={false} />
      ) : filter === "playlists" ? (
        <div className="shelf__grid">
          <Card
            to="/liked"
            title="Liked Songs"
            subtitle={pluralize(liked.length, "song")}
            artwork={null}
          />
          {playlists.map((playlist) => (
            <Card
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              title={playlist.name}
              subtitle={pluralize(playlist.trackIds.length, "song")}
              artwork={playlist.artwork}
            />
          ))}
          {data.curated.map((playlist) => (
            <Card
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              title={playlist.title}
              subtitle={playlist.description}
              artwork={playlist.artwork}
            />
          ))}
        </div>
      ) : filter === "albums" ? (
        <div className="shelf__grid">
          {data.albums.map((album) => (
            <Card
              key={album.id}
              to={`/album/${album.id}`}
              title={album.title}
              subtitle={`${album.year} • ${album.artistNames.join(", ")}`}
              artwork={album.artwork}
            />
          ))}
        </div>
      ) : (
        <div className="shelf__grid">
          {data.artists.map((artist) => (
            <Card
              key={artist.id}
              to={`/artist/${artist.id}`}
              title={artist.name}
              subtitle="Artist"
              artwork={artist.artwork}
              round
            />
          ))}
        </div>
      )}

      {filter === "playlists" && playlists.length === 0 ? (
        <EmptyState
          icon="library"
          title="Create your first playlist"
          message="Collect the songs you keep coming back to."
          action="Create playlist"
          onAction={newPlaylist}
        />
      ) : null}
    </div>
  );
}
