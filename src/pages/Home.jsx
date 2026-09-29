import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import Artwork from "../components/Artwork";
import Shelf from "../components/Shelf";
import Card from "../components/Card";
import { SkeletonShelf } from "../components/Skeleton";
import { ErrorState } from "../components/EmptyState";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useAuth } from "../state/AuthContext";
import { useSettings } from "../state/SettingsContext";
import { useTrackActions } from "../hooks/useTrackActions";
import { useAsync } from "../hooks/useAsync";
import {
  getAllAlbums,
  getAllArtists,
  getCuratedPlaylists,
  getFeaturedTracks,
  getRecommendations,
  getTracks,
  getYouTubeCatalog,
  getYouTubeChart,
  isYouTubeConfigured,
} from "../services/musicService";
import { useSeo } from "../hooks/useSeo";

/** A failed chart must not take the whole home page down with it. */
const chart = (region) =>
  isYouTubeConfigured() ? getYouTubeChart(region, 20).catch(() => []) : Promise.resolve([]);

/** Where a card's title leads: its album, or a search for streamed tracks. */
function trackLink(track) {
  if (track.albumId) return `/album/${track.albumId}`;
  return `/search?q=${encodeURIComponent(`${track.title} ${track.artists[0] || ""}`.trim())}`;
}

/** Greets by time of day the way a music app is expected to. */
function greeting(name) {
  const base = timeGreeting();
  return name ? `${base}, ${name}` : base;
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Two-column shortcut tiles at the top of Home, like a phone music app. */
function QuickAccess({ playlists, likedCount }) {
  const tiles = [
    { to: "/liked", label: "Liked Songs", icon: "heart", tone: "liked", hint: likedCount ? `${likedCount}` : null },
    { to: "/recent", label: "Recently Played", icon: "clock", tone: "recent" },
    { to: "/stats", label: "Your Stats", icon: "chart", tone: "stats" },
    { to: "/ai", label: "AI Song Finder", icon: "sparkle", tone: "ai" },
    { to: "/room", label: "Listen Together", icon: "people", tone: "room" },
    ...playlists.slice(0, 1).map((p) => ({ to: `/playlist/${p.id}`, label: p.name, artwork: p.artwork, icon: "music", tone: "playlist" })),
  ];
  return (
    <nav className="quick" aria-label="Quick access">
      {tiles.map((tile) => (
        <Link key={tile.to} to={tile.to} className="quick__tile">
          {tile.artwork ? (
            <Artwork src={tile.artwork} alt="" className="quick__art" />
          ) : (
            <span className={`quick__art quick__art--${tile.tone}`}><Icon name={tile.icon} size={18} /></span>
          )}
          <span className="quick__label">{tile.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export default function Home() {
  useSeo({ description: "Listen free on Resonate: trending songs, music videos, moods like Romantic, Party and Punjabi, playlists and synced lyrics." });
  const { playTracks, currentTrack, isPlaying } = usePlayer();
  const { recent, playlists, liked } = useLibrary();
  const { user } = useAuth();
  const { greetingName } = useSettings();
  const firstName = (greetingName.trim() || (user && !user.isAnonymous ? user.name || "" : "")).split(" ")[0];
  const { openTrackMenu } = useTrackActions();

  // Recommendations are seeded from what this listener actually played.
  const seedIds = useMemo(() => recent.slice(0, 5).map((entry) => entry.id), [recent]);
  const recentIds = useMemo(() => recent.slice(0, 8).map((entry) => entry.id), [recent]);

  const { data, loading, error, retry } = useAsync(
    async () => {
      const [recentTracks, featured, madeForYou, albums, artists, playlists, india, global, index] =
        await Promise.all([
          getTracks(recentIds),
          getFeaturedTracks(10),
          getRecommendations(seedIds, 8),
          getAllAlbums(),
          getAllArtists(),
          getCuratedPlaylists(),
          chart("IN"),
          chart("US"),
          // Refreshed at most once a day; also feeds free search.
          isYouTubeConfigured() ? getYouTubeCatalog() : { shelves: {} },
        ]);
      return { recentTracks, featured, madeForYou, albums, artists, playlists, india, global, index };
    },
    [recentIds.join(","), seedIds.join(",")]
  );

  if (error) {
    return (
      <div className="page">
        <ErrorState message={error.message} onRetry={retry} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="page">
        <h1 className="page__title home__greeting">{greeting(firstName)}</h1>
        <SkeletonShelf count={6} />
        <SkeletonShelf count={6} />
      </div>
    );
  }

  const trackCard = (track, list, index, label) => (
    <Card
      key={track.id}
      to={trackLink(track)}
      title={track.title}
      subtitle={track.artists.join(", ")}
      artwork={track.artwork}
      isPlaying={currentTrack?.id === track.id && isPlaying}
      onPlay={() => playTracks(list, index, label)}
      onContextMenu={(event) => {
        event.preventDefault();
        openTrackMenu(track, { x: event.clientX, y: event.clientY });
      }}
    />
  );

  return (
    <div className="page">
      <h1 className="page__title home__greeting">{greeting(firstName)}</h1>
      <QuickAccess playlists={playlists} likedCount={liked.length} />

      {data.recentTracks.length > 0 ? (
        <Shelf title="Recently played" seeAllTo="/recent">
          {data.recentTracks.map((track, i) =>
            trackCard(track, data.recentTracks, i, "Recently played")
          )}
        </Shelf>
      ) : null}

      {data.india.length > 0 ? (
        <Shelf title="Trending in India" subtitle="Bollywood, Punjabi and more — most played on YouTube today.">
          {data.india.map((track, i) => trackCard(track, data.india, i, "Trending in India"))}
        </Shelf>
      ) : null}

      {data.global.length > 0 ? (
        <Shelf title="Trending worldwide" subtitle="Hollywood and international hits right now.">
          {data.global.map((track, i) => trackCard(track, data.global, i, "Trending worldwide"))}
        </Shelf>
      ) : null}

      {(data.index.shelves?.bollywood || []).length > 0 ? (
        <Shelf title="Latest Bollywood" subtitle="New releases from T-Series, Sony Music India, Zee Music and more.">
          {data.index.shelves.bollywood.slice(0, 20).map((track, i, list) => trackCard(track, list, i, "Latest Bollywood"))}
        </Shelf>
      ) : null}

      {(data.index.shelves?.hollywood || []).length > 0 ? (
        <Shelf title="Latest Hollywood" subtitle="New from the biggest international artists.">
          {data.index.shelves.hollywood.slice(0, 20).map((track, i, list) => trackCard(track, list, i, "Latest Hollywood"))}
        </Shelf>
      ) : null}

      <Shelf
        title="Made for you"
        subtitle={
          seedIds.length > 0
            ? "Based on what you have been playing."
            : "Play something and this will start following your taste."
        }
      >
        {data.madeForYou.map((track, i) => trackCard(track, data.madeForYou, i, "Made for you"))}
      </Shelf>

      <Shelf title="Popular in your library">
        {data.featured.map((track, i) => trackCard(track, data.featured, i, "Popular"))}
      </Shelf>

      <Shelf title="Playlists">
        {data.playlists.map((playlist) => (
          <Card
            key={playlist.id}
            to={`/playlist/${playlist.id}`}
            title={playlist.title}
            subtitle={playlist.description}
            artwork={playlist.artwork}
          />
        ))}
      </Shelf>

      <Shelf title="Albums">
        {data.albums.map((album) => (
          <Card
            key={album.id}
            to={`/album/${album.id}`}
            title={album.title}
            subtitle={`${album.year} • ${album.artistNames.join(", ")}`}
            artwork={album.artwork}
          />
        ))}
      </Shelf>

      <Shelf title="Artists">
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
      </Shelf>
    </div>
  );
}
