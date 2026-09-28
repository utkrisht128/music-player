import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import TrackList from "../components/TrackList";
import EmptyState from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { getTracks } from "../services/musicService";
import { generatePlaylist, isAIConfigured } from "../services/aiPlaylist";
import { track as trackEvent } from "../services/analytics";
import { useSeo } from "../hooks/useSeo";

const IDEAS = [
  "Late night drive through the city",
  "Focus music for studying, no lyrics",
  "90s Bollywood romance",
  "Upbeat Punjabi gym workout",
  "Rainy day chai and old ghazals",
  "Feel-good road trip with friends",
];

const SIZES = [10, 15, 25];

/** Describe a vibe, get a playlist: Gemini picks, our index resolves. */
export default function AIPlaylistPage() {
  useSeo({ title: "AI Playlist Maker", description: "Describe a mood and get a playlist made for you." });
  const navigate = useNavigate();
  const { playTracks, shufflePlay } = usePlayer();
  const { createPlaylist, recent, liked } = useLibrary();
  const { toast } = useUI();
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(15);
  const [useTaste, setUseTaste] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const tasteIds = useMemo(
    () => [...new Set([...recent.map((r) => r.id), ...liked.map((l) => (typeof l === "string" ? l : l.id))])].slice(0, 15),
    [recent, liked]
  );

  const generate = async (text = prompt) => {
    const request = text.trim();
    if (!request || busy) return;
    setPrompt(request);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const tasteTracks = useTaste && tasteIds.length ? await getTracks(tasteIds).catch(() => []) : [];
      const next = await generatePlaylist(request, { count, tasteTracks });
      setResult({ ...next, request });
      trackEvent("ai_playlist_generate", { prompt: request, matched: next.tracks.length, missed: next.missed.length });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const playlist = createPlaylist({
      name: result.name,
      description: result.description,
      trackIds: result.tracks.map((t) => t.id),
    });
    trackEvent("ai_playlist_save", { tracks: result.tracks.length });
    toast("Saved to your library", { icon: "check" });
    navigate(`/playlist/${playlist.id}`);
  };

  if (!isAIConfigured) {
    return (
      <div className="page">
        <EmptyState icon="music" title="AI playlists are off" message="They need Firebase, which is not set up on this site." />
      </div>
    );
  }

  return (
    <div className="page ai-maker">
      <header className="ai-maker__head">
        <span className="ai-maker__badge"><Icon name="radio" size={14} /> AI</span>
        <h1 className="page__title">Playlist Maker</h1>
        <p className="ai-maker__lede">Describe a mood, a moment or a mix of artists. We'll build the playlist.</p>
      </header>

      <form className="ai-maker__form" onSubmit={(e) => { e.preventDefault(); generate(); }}>
        <textarea
          className="field__input field__input--area ai-maker__input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); }
          }}
          placeholder="e.g. Sunday morning coffee with soft acoustic Hindi songs"
          maxLength={300}
          rows={3}
          aria-label="Describe your playlist"
        />
        <div className="ai-maker__controls">
          <div className="chips" role="radiogroup" aria-label="Number of songs">
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                className={`chip${count === n ? " chip--accent" : ""}`}
                onClick={() => setCount(n)}
              >
                {n} songs
              </button>
            ))}
          </div>
          {tasteIds.length ? (
            <label className="ai-maker__taste">
              <input type="checkbox" checked={useTaste} onChange={(e) => setUseTaste(e.target.checked)} />
              <span>Use my listening taste</span>
            </label>
          ) : null}
          <button type="submit" className="btn btn--primary" disabled={busy || !prompt.trim()}>
            <Icon name="radio" size={16} />
            <span>{busy ? "Creating…" : "Create playlist"}</span>
          </button>
        </div>
      </form>

      {!result && !busy ? (
        <section className="ai-maker__ideas">
          <h2 className="ai-maker__subhead">Try one of these</h2>
          <div className="chips">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="chip" onClick={() => generate(idea)}>{idea}</button>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="ai-maker__error" role="alert"><Icon name="warning" size={16} /> {error}</p> : null}

      {busy ? (
        <div aria-live="polite">
          <p className="ai-maker__status">Picking songs and finding them for you…</p>
          <SkeletonRows count={8} />
        </div>
      ) : null}

      {result ? (
        <section className="ai-maker__result">
          <div className="ai-maker__result-head">
            <div>
              <h2 className="ai-maker__name">{result.name}</h2>
              <p className="ai-maker__desc">{result.description}</p>
            </div>
            <div className="ai-maker__actions">
              <button type="button" className="btn btn--primary" disabled={!result.tracks.length} onClick={() => playTracks(result.tracks, 0, result.name)}>
                <Icon name="play" size={16} /><span>Play</span>
              </button>
              <button type="button" className="btn" disabled={!result.tracks.length} onClick={() => shufflePlay(result.tracks, result.name)}>
                <Icon name="shuffle" size={16} /><span>Shuffle</span>
              </button>
              <button type="button" className="btn" disabled={!result.tracks.length} onClick={save}>
                <Icon name="plus" size={16} /><span>Save</span>
              </button>
              <button type="button" className="btn" onClick={() => generate(result.request)}>
                <Icon name="repeat" size={16} /><span>Try again</span>
              </button>
            </div>
          </div>
          {result.tracks.length ? (
            <TrackList tracks={result.tracks} contextLabel={result.name} showAlbum />
          ) : (
            <EmptyState icon="music" title="No playable songs found" message="Try describing it differently." />
          )}
          {result.missed.length ? (
            <p className="ai-maker__missed">
              Couldn't find: {result.missed.map((s) => `${s.title} (${s.artist})`).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
