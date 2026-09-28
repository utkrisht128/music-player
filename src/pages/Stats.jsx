import React, { useState } from "react";
import { Link } from "react-router-dom";
import Artwork from "../components/Artwork";
import TrackList from "../components/TrackList";
import EmptyState from "../components/EmptyState";
import { SkeletonRows } from "../components/Skeleton";
import { useAsync } from "../hooks/useAsync";
import { getTracks } from "../services/musicService";
import { summarise } from "../utils/stats";
import { useSeo } from "../hooks/useSeo";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 0, label: "All time" },
];

function formatListening(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Your own listening, from this device's history only. */
export default function StatsPage() {
  useSeo({ title: "Your Stats", noindex: true });
  const [range, setRange] = useState(7);

  const { data, loading } = useAsync(async () => {
    const summary = summarise(range);
    const ids = Object.keys({ ...summary.plays, ...summary.seconds });
    const tracks = await getTracks(ids);
    const byId = new Map(tracks.map((t) => [t.id, t]));

    const topTracks = ids
      .filter((id) => byId.has(id))
      .sort((a, b) => (summary.plays[b] || 0) - (summary.plays[a] || 0) || (summary.seconds[b] || 0) - (summary.seconds[a] || 0))
      .slice(0, 10)
      .map((id) => byId.get(id));

    const artists = new Map();
    ids.forEach((id) => {
      const track = byId.get(id);
      if (!track) return;
      track.artists.forEach((name, i) => {
        const key = track.artistIds?.[i] || name;
        const entry = artists.get(key) || { id: track.artistIds?.[i], name, artwork: track.artwork, seconds: 0, plays: 0 };
        entry.seconds += summary.seconds[id] || 0;
        entry.plays += summary.plays[id] || 0;
        artists.set(key, entry);
      });
    });
    const topArtists = [...artists.values()].sort((a, b) => b.seconds - a.seconds || b.plays - a.plays).slice(0, 6);

    // Last 7 days as a mini bar chart.
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ key, label: d.toLocaleDateString([], { weekday: "short" }), seconds: summarise(7).perDay[key] || 0 });
    }

    return { summary, topTracks, topArtists, days };
  }, [range]);

  const maxDay = Math.max(60, ...(data?.days || []).map((d) => d.seconds));

  return (
    <div className="page stats">
      <h1 className="page__title">Your listening</h1>

      <div className="filters" role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={range === r.id}
            className={`filters__chip${range === r.id ? " is-active" : ""}`}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <SkeletonRows count={6} />
      ) : data.summary.totalPlays === 0 && data.summary.totalSeconds < 60 ? (
        <EmptyState icon="chart" title="No listening yet" message="Play some songs and your stats will show up here." />
      ) : (
        <>
          <div className="stats__tiles">
            <div className="stat-tile">
              <span className="stat-tile__value">{formatListening(data.summary.totalSeconds)}</span>
              <span className="stat-tile__label">Listening time</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{data.summary.totalPlays}</span>
              <span className="stat-tile__label">Plays</span>
            </div>
            <div className="stat-tile">
              <span className="stat-tile__value">{Object.keys(data.summary.plays).length}</span>
              <span className="stat-tile__label">Different songs</span>
            </div>
          </div>

          <section className="stats__section">
            <h2 className="search__heading">Last 7 days</h2>
            <div className="stats__chart" role="img" aria-label="Minutes listened per day, last 7 days">
              {data.days.map((day) => (
                <div key={day.key} className="stats__bar-wrap" title={`${day.label}: ${formatListening(day.seconds)}`}>
                  <span className="stats__bar-value">{day.seconds >= 60 ? Math.round(day.seconds / 60) : ""}</span>
                  <span className="stats__bar" style={{ height: `${Math.max(2, (day.seconds / maxDay) * 100)}%` }} />
                  <span className="stats__bar-label">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          {data.topArtists.length > 0 ? (
            <section className="stats__section">
              <h2 className="search__heading">Top artists</h2>
              <ol className="stats__artists">
                {data.topArtists.map((artist, i) => {
                  const body = (
                    <>
                      <span className="stats__rank">{i + 1}</span>
                      <Artwork src={artist.artwork} alt="" size={48} rounded />
                      <span className="stats__artist-name">{artist.name}</span>
                      <span className="stats__artist-time">{formatListening(artist.seconds)}</span>
                    </>
                  );
                  return (
                    <li key={artist.id || artist.name}>
                      {artist.id ? <Link to={`/artist/${artist.id}`} className="stats__artist">{body}</Link> : <div className="stats__artist">{body}</div>}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {data.topTracks.length > 0 ? (
            <section className="stats__section">
              <h2 className="search__heading">Top songs</h2>
              <TrackList tracks={data.topTracks} contextLabel="Your top songs" />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
