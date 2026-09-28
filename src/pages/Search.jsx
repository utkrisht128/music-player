import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import Card from "../components/Card";
import Shelf from "../components/Shelf";
import Artwork from "../components/Artwork";
import QuotaMeter from "../components/QuotaMeter";
import TrackList from "../components/TrackList";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { SkeletonRows, SkeletonShelf } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { usePlayer } from "../state/PlayerContext";
import {
  search,
  getAllArtists,
  getQuotaStatus,
  searchYouTube,
  searchYouTubeCatalog,
  isYouTubeConfigured,
  getSuggestions,
  MOODS,
} from "../services/musicService";
import { readJSON, writeJSON } from "../utils/storage";
import { useSeo } from "../hooks/useSeo";
import { track as trackEvent } from "../services/analytics";

const DEBOUNCE_MS = 220;
const YT_MIN_CHARS = 2;
// Enter only spends a paid YouTube search when the free index finds fewer
// songs than this.
const ENOUGH_INDEX_RESULTS = 3;
const RECENT_KEY = "recentSearches";

const QUICK_PICKS = [
  { label: "Bollywood hits", query: "latest bollywood songs" },
  { label: "Arijit Singh", query: "Arijit Singh songs" },
  { label: "Punjabi", query: "latest punjabi songs" },
  { label: "90s Bollywood", query: "90s bollywood songs" },
  { label: "Romantic", query: "bollywood romantic songs" },
  { label: "Hollywood pop", query: "top pop songs" },
  { label: "Taylor Swift", query: "Taylor Swift official" },
  { label: "The Weeknd", query: "The Weeknd official" },
  { label: "Hip-hop", query: "hip hop hits" },
  { label: "Lo-fi", query: "bollywood lofi" },
];

function loadRecent() {
  const saved = readJSON(RECENT_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

/**
 * Search your library and YouTube in one place.
 *
 * The query lives in the URL (`?q=`), so a search is shareable, survives a
 * refresh, and the back button steps through searches. Library results update
 * as you type; YouTube results follow after a short pause (or on Enter).
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") || "";
  useSeo({
    title: urlQuery ? `${urlQuery} – songs & music videos` : "Search songs, artists and videos",
    description: urlQuery
      ? `Listen to ${urlQuery}: songs and music videos, free on Resonate.`
      : "Search any song, artist or music video and play it instantly on Resonate.",
  });
  const [input, setInput] = useState(urlQuery);
  const [recent, setRecent] = useState(loadRecent);
  const [ytQuery, setYtQuery] = useState(urlQuery.trim());
  const inputRef = useRef(null);
  // Type-ahead: free suggestions from the song index.
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestions = suggestOpen && input.trim() ? getSuggestions(input) : [];

  useEffect(() => {
    setInput((current) => (current === urlQuery ? current : urlQuery));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  useEffect(() => {
    if (input === urlQuery) return undefined;
    const timer = setTimeout(() => {
      setParams(input ? { q: input } : {}, { replace: true });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, urlQuery, setParams]);

  const trimmed = urlQuery.trim();

  // YouTube costs quota (about 100 searches a day), so it is searched only on
  // Enter, a chip, or a recent search, never on every keystroke. Returning to
  // a query already searched (back button, refresh) reuses the cached result.
  useEffect(() => {
    if (trimmed !== ytQuery && trimmed.length < YT_MIN_CHARS) setYtQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  // "/" focuses search from anywhere on this page.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "/" && document.activeElement !== inputRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rememberSearch = (query) => {
    const q = query.trim();
    if (!q) return;
    setRecent((current) => {
      const next = [q, ...current.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      writeJSON(RECENT_KEY, next);
      return next;
    });
  };

  /** Enter / chip / recent search. Pays for YouTube only if the index can't answer. */
  const runQuery = async (query, { force = false } = {}) => {
    setInput(query);
    setParams(query ? { q: query } : {}, { replace: false });
    rememberSearch(query);
    const q = query.trim();
    if (q) trackEvent("search", { search_term: q });
    if (q.length < YT_MIN_CHARS || !isYouTubeConfigured() || getQuotaStatus().exhausted) return;
    if (!force) {
      const free = await searchYouTubeCatalog(q);
      if (free.length >= ENOUGH_INDEX_RESULTS) return;
    }
    setYtQuery(q);
  };

  const local = useAsync(
    async () => (trimmed ? search(trimmed) : { browse: await getAllArtists() }),
    [trimmed]
  );

  // Free: the daily song index plus every YouTube song seen before.
  const indexed = useAsync(
    async () => (trimmed.length >= YT_MIN_CHARS && isYouTubeConfigured() ? searchYouTubeCatalog(trimmed) : []),
    [trimmed]
  );

  // Paid (100 units): only runs once ytQuery is set by runQuery.
  const youtube = useAsync(
    async () => (ytQuery && isYouTubeConfigured() ? searchYouTube(ytQuery) : null),
    [ytQuery]
  );

  // A YouTube result that arrived means the query was worth keeping.
  useEffect(() => {
    if (youtube.data && youtube.data.length > 0 && ytQuery) rememberSearch(ytQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtube.data]);

  const submit = (event) => {
    event.preventDefault();
    const picked = suggestions[activeSuggestion];
    runQuery(picked ? `${picked.title} ${picked.artists[0] || ""}`.trim() : input);
    setSuggestOpen(false);
    setActiveSuggestion(-1);
    inputRef.current?.blur();
  };

  const onInputKeyDown = (event) => {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Cycles through the suggestions and back to the typed text (-1).
      setActiveSuggestion((i) => {
        const next = i + step;
        if (next >= suggestions.length) return -1;
        if (next < -1) return suggestions.length - 1;
        return next;
      });
    } else if (event.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  const clearRecent = () => {
    setRecent([]);
    writeJSON(RECENT_KEY, []);
  };

  return (
    <div className="page search">
      <form className="search__form" onSubmit={submit} role="search">
        <Icon name="search" size={20} className="search__icon" />
        <input
          ref={inputRef}
          type="search"
          className="search__input"
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setSuggestOpen(true);
            setActiveSuggestion(-1);
          }}
          onKeyDown={onInputKeyDown}
          onFocus={() => setSuggestOpen(true)}
          // Delay so a click on a suggestion lands before the list closes.
          onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="search-suggestions"
          aria-activedescendant={activeSuggestion >= 0 ? `suggestion-${activeSuggestion}` : undefined}
          placeholder="Search any song, artist or movie — Hindi or English"
          aria-label="Search"
          autoComplete="off"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        {input ? (
          <button
            type="button"
            className="icon-btn search__clear"
            onClick={() => { setInput(""); inputRef.current?.focus(); }}
            aria-label="Clear search"
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <kbd className="search__kbd" aria-hidden="true">/</kbd>
        )}
        {suggestions.length > 0 ? (
          <ul className="suggest" id="search-suggestions" role="listbox">
            {suggestions.map((track, i) => (
              <li key={track.id} id={`suggestion-${i}`} role="option" aria-selected={i === activeSuggestion}>
                <button
                  type="button"
                  className={`suggest__item${i === activeSuggestion ? " is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    runQuery(`${track.title} ${track.artists[0] || ""}`.trim());
                    setSuggestOpen(false);
                  }}
                >
                  <Artwork src={track.artwork} alt="" size={32} />
                  <span className="suggest__text">
                    <span className="suggest__title">{track.title}</span>
                    <span className="suggest__artist">{track.artists.join(", ")}</span>
                  </span>
                  <Icon name="search" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <QuotaMeter />

      {!trimmed ? (
        <Discover
          recent={recent}
          onPick={runQuery}
          onClearRecent={clearRecent}
          local={local}
        />
      ) : (
        <Results
          query={trimmed}
          local={local}
          indexed={indexed}
          youtube={youtube}
          ytStale={ytQuery !== trimmed}
          onSearchYouTube={() => runQuery(trimmed, { force: true })}
        />
      )}
    </div>
  );
}

function Discover({ recent, onPick, onClearRecent, local }) {
  return (
    <>
      {recent.length > 0 ? (
        <section className="search__section">
          <div className="search__heading-row">
            <h2 className="search__heading">Recent searches</h2>
            <button type="button" className="link-btn" onClick={onClearRecent}>Clear</button>
          </div>
          <div className="chips">
            {recent.map((query) => (
              <button type="button" key={query} className="chip" onClick={() => onPick(query)}>
                <Icon name="clock" size={14} /> {query}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isYouTubeConfigured() ? (
        <section className="search__section">
          <h2 className="search__heading">Moods</h2>
          <div className="moods">
            {MOODS.map((mood) => (
              <Link key={mood.id} to={`/mood/${mood.id}`} className="mood-tile" style={{ "--mood": mood.color }}>
                {mood.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="search__section">
        <h2 className="search__heading">Quick picks</h2>
        <div className="chips">
          {QUICK_PICKS.map((pick) => (
            <button type="button" key={pick.label} className="chip chip--accent" onClick={() => onPick(pick.query)}>
              {pick.label}
            </button>
          ))}
        </div>
      </section>

      {local.loading && !local.data?.browse ? <SkeletonShelf count={8} /> : null}
      {local.data?.browse?.length ? (
        <Shelf title="Browse your library">
          {local.data.browse.map((artist) => (
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
      ) : null}
    </>
  );
}

function TopResult({ track, list, label }) {
  const { playTracks, currentTrack, isPlaying, togglePlay } = usePlayer();
  const playing = currentTrack?.id === track.id && isPlaying;
  return (
    <div className="top-result">
      <Artwork src={track.artwork} alt="" className="top-result__art" />
      <div className="top-result__text">
        <span className="top-result__title">{track.title}</span>
        <span className="top-result__artist">{track.artists.join(", ")}</span>
        <span className="badge">{track.source === "youtube" ? "YouTube" : "Library"}</span>
      </div>
      <button
        type="button"
        className="top-result__play"
        aria-label={playing ? "Pause" : `Play ${track.title}`}
        onClick={() => (currentTrack?.id === track.id ? togglePlay() : playTracks(list, 0, label))}
      >
        <Icon name={playing ? "pause" : "play"} size={26} />
      </button>
    </div>
  );
}

function Results({ query, local, indexed, youtube, ytStale, onSearchYouTube }) {
  const { tracks = [], artists = [], albums = [], playlists = [] } = local.data || {};
  const indexTracks = indexed.data || [];
  const seen = new Set(indexTracks.map((t) => t.id));
  // Paid results that the free index did not already show.
  const moreTracks = ytStale ? [] : (youtube.data || []).filter((t) => !seen.has(t.id));
  const ytTracks = [...indexTracks, ...moreTracks];
  const ytLoading = indexed.loading || (!ytStale && youtube.loading);
  const label = `Search: ${query}`;
  const { searchesLeft, exhausted } = getQuotaStatus();
  // Keep showing the last results while the next query loads; a skeleton only
  // appears on the very first load, so typing does not make the page flash.
  const firstLoad = indexed.data === null;
  const refreshing = local.loading || indexed.loading;
  // The quota meter above already explains an exhausted quota.
  const ytError = !ytStale && youtube.error && !youtube.error.quota ? youtube.error : null;

  const top = tracks[0] ? { track: tracks[0], list: tracks } : ytTracks[0] ? { track: ytTracks[0], list: ytTracks } : null;
  const nothing =
    !local.loading && !ytLoading && !youtube.error && !isYouTubeConfigured() &&
    tracks.length + artists.length + albums.length + playlists.length === 0;

  if (local.error) return <ErrorState message={local.error.message} onRetry={local.retry} />;

  if (nothing) {
    return (
      <EmptyState
        icon="search"
        title={`No results found for "${query}"`}
        message="Check the spelling, or try the song with the movie or artist name."
      />
    );
  }

  return (
    <div className={`search__results${refreshing ? " is-refreshing" : ""}`}>
      {top ? (
        <section className="search__section">
          <h2 className="search__heading">Top result</h2>
          <TopResult track={top.track} list={top.list} label={label} />
        </section>
      ) : null}

      {tracks.length > 0 ? (
        <section className="search__section">
          <h2 className="search__heading">In your library</h2>
          <TrackList tracks={tracks.slice(0, 8)} contextLabel={label} showAlbum />
        </section>
      ) : null}

      {isYouTubeConfigured() ? (
        <section className="search__section">
          <h2 className="search__heading">
            <Icon name="video" size={18} /> Songs from YouTube
          </h2>
          {ytLoading && ytTracks.length === 0 && firstLoad ? (
            <SkeletonRows count={6} />
          ) : ytTracks.length > 0 ? (
            <TrackList tracks={ytTracks} contextLabel={label} showAlbum />
          ) : !ytLoading ? (
            <p className="search__hint">
              {exhausted
                ? "No saved matches. Full YouTube search comes back when the limit resets."
                : "No matches in the song index yet."}
            </p>
          ) : null}
          {ytError ? <ErrorState message={ytError.message} onRetry={youtube.retry} /> : null}
          {!exhausted && (ytStale || (!youtube.loading && !youtube.error)) ? (
            <div className="search__more">
              <span className="search__hint">
                {ytStale ? "Not what you want?" : "Still missing a song?"}
              </span>
              <button
                type="button"
                className="chip chip--accent"
                onClick={onSearchYouTube}
                disabled={searchesLeft === 0 || !ytStale}
              >
                <Icon name="search" size={14} /> Search all of YouTube
                <span className="search__cost">uses 1 of ~{searchesLeft} left today</span>
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="search__hint">
          Add <code>REACT_APP_YOUTUBE_API_KEY</code> to <code>.env.local</code> to search YouTube.
        </p>
      )}

      {artists.length > 0 ? (
        <Shelf title="Artists">
          {artists.map((artist) => (
            <Card key={artist.id} to={`/artist/${artist.id}`} title={artist.name} subtitle="Artist" artwork={artist.artwork} round />
          ))}
        </Shelf>
      ) : null}

      {albums.length > 0 ? (
        <Shelf title="Albums">
          {albums.map((album) => (
            <Card
              key={album.id}
              to={`/album/${album.id}`}
              title={album.title}
              subtitle={[album.year, album.artistNames.join(", ")].filter(Boolean).join(" • ")}
              artwork={album.artwork}
            />
          ))}
        </Shelf>
      ) : null}

      {playlists.length > 0 ? (
        <Shelf title="Playlists">
          {playlists.map((playlist) => (
            <Card key={playlist.id} to={`/playlist/${playlist.id}`} title={playlist.title} subtitle={playlist.description} artwork={playlist.artwork} />
          ))}
        </Shelf>
      ) : null}
    </div>
  );
}
