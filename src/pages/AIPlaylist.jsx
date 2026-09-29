import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Artwork from "../components/Artwork";
import EmptyState from "../components/EmptyState";
import AIUsageMeter, { formatWait, useAIUsage } from "../components/AIUsageMeter";
import AIModelPicker from "../components/AIModelPicker";
import AIPipelineInspector from "../components/AIPipelineInspector";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";
import { useTrackActions } from "../hooks/useTrackActions";
import { getTracks } from "../services/musicService";
import {
  DEFAULT_FILTERS, FILTERS, MAX_YEAR, MIN_YEAR, MAX_CAROUSEL, POST_FORMATS,
  describeFilters, isAIConfigured, popularityLabel, prepareImage,
  analyzePhotos, buildSongPrompt, findSongs, AI_DEBUG,
} from "../services/aiPlaylist";
import {
  addHistory, clearHistory, getHistory, hoursLeft, onHistoryChange, removeHistory, summarizeSteps, thumbnail,
} from "../services/aiHistory";
import { MODELS, getChosenModel, getModelInfo, modelLabel, setChosenModel } from "../services/aiModels";
import { track as trackEvent } from "../services/analytics";
import { formatTime } from "../utils/format";
import { useSeo } from "../hooks/useSeo";

// ----------------------------------------------------------------- constants
const STEPS = [
  { id: "start", label: "Start" },
  { id: "input", label: "Your photo / idea" },
  { id: "details", label: "Preferences" },
  { id: "prompt", label: "Check" },
  { id: "results", label: "Songs" },
];

const IDEAS = [
  "Late night drive through the city",
  "Focus music for studying, no lyrics",
  "90s Bollywood romance",
  "Upbeat Punjabi gym workout",
  "Rainy day chai and old ghazals",
  "Feel-good road trip with friends",
];

/** One tap to tell the AI what was off about the last suggestions. */
const QUICK_FIXES = [
  "More romantic",
  "More fun and upbeat",
  "Calmer and softer",
  "Newer songs",
  "Older songs",
  "Only Hindi",
  "Only English",
  "More trending on Instagram",
  "Less mainstream",
];

const SIZES = [5, 10, 15, 25];
const POST_COUNT = 5;
const MORE_COUNT = 8;
const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);
const SCENE_PARTS = [
  ["setting", "Place"],
  ["activity", "What's happening"],
  ["colors", "Light"],
  ["mood", "Mood"],
];
const PHASES = { queued: "is waiting in the free queue", thinking: "is thinking", writing: "is writing the list" };

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ago = (at) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
};

// ---------------------------------------------------------------- small parts

/** Where you are: 1 Start · 2 Photo · 3 Preferences · 4 Check · 5 Songs. */
function Stepper({ current, onGo, reachable }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="ai-stepper" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < at ? "is-done" : i === at ? "is-now" : ""}>
          <button type="button" disabled={!reachable.includes(s.id) || i === at} onClick={() => onGo(s.id)} aria-current={i === at ? "step" : undefined}>
            <span className="ai-stepper__num">{i < at ? <Icon name="check" size={12} /> : i + 1}</span>
            <span className="ai-stepper__label">{s.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** The photo as the AI read it: people, place, moment, mood. */
function SceneCard({ scene, photo, photoCount = 1 }) {
  if (!scene) return null;
  return (
    <div className="ai-seen">
      {photo ? (
        <div className="ai-seen__stack">
          <img src={photo} alt="" className="ai-seen__photo" />
          {photoCount > 1 ? <span className="ai-scan__count">{photoCount} slides</span> : null}
        </div>
      ) : null}
      <div className="ai-seen__body">
        <span className="ai-eyebrow">What the AI sees in your photo</span>
        {scene.vibe ? <p className="ai-seen__vibe">{scene.vibe}</p> : null}
        {scene.story ? <p className="ai-seen__story">{scene.story}</p> : null}
        <dl className="ai-scene">
          {scene.people.map((p, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <div key={i} className="ai-scene__item">
              <dt>{p.who || `Person ${i + 1}`}</dt>
              <dd>{[p.look, p.pose, p.expression].filter(Boolean).join(" · ")}</dd>
            </div>
          ))}
          {SCENE_PARTS.filter(([key]) => scene[key]).map(([key, label]) => (
            <div key={key} className="ai-scene__item">
              <dt>{label}</dt>
              <dd>{scene[key]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Live status while the AI works (the free queue can take minutes). */
function Working({ busy, progress, now, photo, forPost }) {
  const rows = busy === "prepare"
    ? [[forPost ? "photo" : "build", forPost ? "Reading the people, place and mood in your photo" : "Putting your request together"]]
    : [["model", "Picking songs"], ["match", "Finding them on YouTube"]];
  const at = rows.findIndex(([s]) => s === progress?.stage);
  return (
    <div className="ai-loading" aria-live="polite">
      {photo ? (
        <div className="ai-scan"><img src={photo} alt="" /><span className="ai-scan__line" /></div>
      ) : (
        <div className="ai-orb" aria-hidden="true"><Icon name="sparkle" size={30} /></div>
      )}
      <div className="ai-loading__body">
        <p className="ai-loading__title">{busy === "prepare" ? "Getting things ready" : "Finding your songs"}</p>
        <ol className="ai-loading__steps">
          {rows.map(([stage, text], i) => {
            const state = i < at ? "is-done" : i === Math.max(at, 0) ? "is-now" : "";
            return (
              <li key={stage} className={state}>
                <span className="ai-loading__dot">{state === "is-done" ? <Icon name="check" size={12} /> : null}</span>
                <span>
                  {text}
                  {state === "is-now" && progress?.label ? (
                    <small className="ai-loading__live">{progress.label} {PHASES[progress.phase] || "is working"} · {clock(now - progress.since)}</small>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
        {progress?.phase === "queued" && now - progress.since > 20000 ? (
          <p className="ai-loading__hint">Free AI models wait in a queue. Kimi often takes 3–5 minutes to start. You can keep this tab open and do something else.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * "Why these songs?": every song the AI suggested and what happened to it
 * on YouTube, then each step of the run. This is where a poor result is
 * explained: a wrong photo reading, made-up songs, or matches YouTube missed.
 */
function RunLog({ entry }) {
  if (!entry) return null;
  const songs = entry.songLog || [];
  const found = songs.filter((s) => s.found).length;
  return (
    <div className="ai-log">
      <div className="ai-log__summary">
        <span><b>{found}</b> of {songs.length} suggested songs found</span>
        {entry.model ? <span>AI: <b>{modelLabel(entry.model)}</b></span> : null}
        {entry.ms ? <span>Took <b>{clock(entry.ms)}</b></span> : null}
        {entry.edited ? <span className="ai-log__tag">Prompt edited by you</span> : null}
      </div>
      {entry.error ? <p className="ai-log__error"><Icon name="warning" size={14} /> {entry.error}</p> : null}

      {songs.length ? (
        <table className="ai-log__table">
          <thead><tr><th>AI suggested</th><th>Searched YouTube for</th><th>Result</th></tr></thead>
          <tbody>
            {songs.map((s, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i} className={s.found ? "is-ok" : "is-miss"}>
                <td><b>{s.title}</b><br /><small>{s.artist}{s.film ? ` · ${s.film}` : ""}{s.year ? ` · ${s.year}` : ""}</small></td>
                <td><small>{s.search}</small></td>
                <td>
                  {s.found ? (
                    <><Icon name="check" size={12} /> {s.found.title}<br /><small>{s.found.channel} · via {s.via === "index" ? "free index" : "YouTube search"}</small></>
                  ) : (
                    <><Icon name="close" size={12} /> Not used<br /><small>{s.reason}{s.closest ? ` · closest: “${s.closest.title}” (${s.closest.channel})` : ""}</small></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <details className="ai-log__more">
        <summary>Step-by-step log</summary>
        <ol className="ai-log__steps">
          {(entry.steps || []).map((s, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className={`is-${s.status}`}>
              <b>{s.name}</b>{s.model ? ` · ${modelLabel(s.model)}` : ""} · {s.status}{s.ms != null ? ` · ${(s.ms / 1000).toFixed(1)}s` : ""}
              {s.error ? <div className="ai-log__err">{s.error}</div> : null}
              {s.notes?.length ? <ul>{s.notes.map((n, j) => <li key={j}>{n}</li>)}</ul> : null /* eslint-disable-line react/no-array-index-key */}
            </li>
          ))}
        </ol>
      </details>
      {entry.prompt ? (
        <details className="ai-log__more">
          <summary>Prompt that was sent</summary>
          <pre className="ai-log__pre">{entry.prompt}</pre>
        </details>
      ) : null}
    </div>
  );
}

/** Earlier searches (this device, last 48 hours). */
function HistoryPanel({ entries, onClose, onReuse }) {
  const [open, setOpen] = useState(null);
  return (
    <aside className="ai-history" aria-label="Search history">
      <div className="ai-history__head">
        <div>
          <h2>History</h2>
          <p>Your searches on this device. Each one is deleted after 48 hours.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close history"><Icon name="close" size={18} /></button>
      </div>
      {entries.length ? (
        <>
          <ul className="ai-history__list">
            {entries.map((e) => (
              <li key={e.id} className={`ai-history__item${open === e.id ? " is-open" : ""}`}>
                <button type="button" className="ai-history__row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  {e.thumb ? <img src={e.thumb} alt="" /> : <span className="ai-history__icon"><Icon name="music" size={18} /></span>}
                  <span className="ai-history__text">
                    <b>{e.request || (e.mode === "photo" ? `Photo for ${e.format === "post" ? "a post" : "a story"}` : "Mood playlist")}</b>
                    <small>
                      {ago(e.at)} · {e.status === "failed" ? "failed" : `${(e.songLog || []).filter((s) => s.found).length} songs`}
                      {e.model ? ` · ${modelLabel(e.model)}` : ""} · deleted in {hoursLeft(e)} h
                    </small>
                  </span>
                  <span className={`ai-history__status is-${e.status}`}>{e.status === "failed" ? "Failed" : "Done"}</span>
                </button>
                {open === e.id ? (
                  <div className="ai-history__detail">
                    {e.filters?.length ? <p className="ai-history__filters">Preferences: {e.filters.join(" · ")}</p> : null}
                    <RunLog entry={e} />
                    <div className="ai-history__actions">
                      {e.inputs && e.prompt ? (
                        <button type="button" className="ai-btn ai-btn--magic" onClick={() => onReuse(e)}><Icon name="undo" size={14} /><span>Use this prompt again</span></button>
                      ) : null}
                      <button type="button" className="ai-btn" onClick={() => removeHistory(e.id)}><Icon name="close" size={14} /><span>Delete</span></button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" className="ai-link" onClick={() => { if (window.confirm("Delete all search history?")) clearHistory(); }}>Clear all history</button>
        </>
      ) : <p className="ai-history__empty">No searches yet. They'll show up here for 48 hours.</p>}
    </aside>
  );
}

/** Three bouncing bars, shown on the song that is playing. */
function Equalizer() {
  return <span className="ai-eq" aria-hidden="true"><i /><i /><i /></span>;
}

function Badge({ score }) {
  const badge = popularityLabel(score);
  return <span className={`ai-badge ai-badge--${badge.tone}`}>{badge.text}</span>;
}

// ------------------------------------------------------------------- page

/**
 * AI Song Finder as a simple wizard:
 *   1 Start       photo for Instagram, or a mood playlist
 *   2 Input       the photo (+ optional words), or the mood in words
 *   3 Preferences optional language / era / energy
 *   4 Check       what the AI saw and the exact prompt, editable
 *   5 Songs       results, "why these songs?" log, and refine
 * Every run is saved to History (48 hours) with its full log.
 */
export default function AIPlaylistPage() {
  useSeo({ title: "AI Song Finder", description: "Add a photo and find the perfect song for your Instagram story, or describe a mood and get a playlist." });
  const navigate = useNavigate();
  const { playTracks, playFrom, shufflePlay, currentTrack, isPlaying, togglePlay, currentTime, duration } = usePlayer();
  const { createPlaylist, recent, liked } = useLibrary();
  const { toast } = useUI();
  const { openTrackMenu } = useTrackActions();
  const fileInput = useRef(null);
  const topRef = useRef(null);

  const [step, setStep] = useState("start");
  const [mode, setMode] = useState("photo"); // "photo" | "mood"
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState([]);
  const [format, setFormat] = useState("story");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [count, setCount] = useState(10);
  const [useTaste, setUseTaste] = useState(true);
  const [model, setModel] = useState(getChosenModel);
  const [dragging, setDragging] = useState(false);

  const [busy, setBusy] = useState(null); // null | "prepare" | "new" | "more" | "refine"
  const [progress, setProgress] = useState(null); // { stage, label, phase, since }
  const [now, setNow] = useState(Date.now());
  const [review, setReview] = useState(null); // the prompt window
  const [result, setResult] = useState(null);
  const [lastRun, setLastRun] = useState(null); // history entry of the latest run (for "Why these songs?")
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [hookStop, setHookStop] = useState(null);
  const [traces, setTraces] = useState([]);
  const [history, setHistory] = useState(getHistory);
  const [showHistory, setShowHistory] = useState(false);
  const sceneCache = useRef({ key: null, scene: null });

  const usage = useAIUsage();
  const aiBlocked = Boolean(usage.blocked);
  const waitText = usage.blocked === "day" ? "Back tomorrow" : `Ready in ${formatWait(usage.secondsLeft)}`;
  const forPost = mode === "photo";
  const maxPhotos = format === "post" ? MAX_CAROUSEL : 1;
  const rules = describeFilters(filters);
  const chosenLabels = Object.entries(FILTERS)
    .map(([key, group]) => {
      if (key === "era" && filters.era === "custom") return `${Math.min(filters.from, filters.to)}–${Math.max(filters.from, filters.to)}`;
      const option = group.options.find((o) => o.id === filters[key]);
      return option && option.id !== "any" ? option.label : null;
    })
    .filter(Boolean);
  const tasteIds = useMemo(
    () => [...new Set([...recent.map((r) => r.id), ...liked.map((l) => (typeof l === "string" ? l : l.id))])].slice(0, 15),
    [recent, liked]
  );
  const inputReady = forPost ? images.length > 0 : Boolean(prompt.trim());
  const reachable = ["start", ...(inputReady || review ? ["input", "details"] : ["input"]), ...(review ? ["prompt"] : []), ...(result ? ["results"] : [])];

  useEffect(() => onHistoryChange(setHistory), []);
  // Old entries also expire while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setHistory(getHistory()), 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  // Changing what the prompt is built from makes the checked prompt stale.
  useEffect(() => { setReview(null); }, [mode, format, images, filters, count, useTaste, prompt]);

  const goTo = (id) => {
    setStep(id);
    setError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const report = (update) => setProgress((current) => ({
    ...update,
    since: current && current.stage === update.stage && current.label === update.label ? current.since : Date.now(),
  }));
  const addTrace = (t) => { if (t) setTraces((current) => [t, ...current].slice(0, 12)); };
  const chooseModel = (id) => { setModel(id); setChosenModel(id); };
  const setFilter = (key, id) => setFilters((current) => ({ ...current, [key]: id }));

  // ------------------------------------------------------------- photos
  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError(null);
    try {
      const prepared = await Promise.all(files.slice(0, maxPhotos).map((f) => prepareImage(f)));
      setImages((current) => (maxPhotos === 1 ? prepared.slice(0, 1) : [...current, ...prepared].slice(0, maxPhotos)));
      if (maxPhotos > 1 && images.length + files.length > maxPhotos) toast(`A carousel holds up to ${maxPhotos} photos.`, { icon: "warning" });
    } catch (e) {
      setError(e.message);
    }
  };
  const chooseFormat = (next) => {
    setFormat(next);
    if (next === "story") setImages((current) => current.slice(0, 1));
  };

  // ------------------------------------------------------------- history
  const logRun = async ({ id, reviewed, next, failure, startedAt, extra = {} }) => {
    const entry = {
      id,
      mode: reviewed.inputs.forPost ? "photo" : "mood",
      format: reviewed.inputs.format,
      request: reviewed.inputs.request,
      filters: reviewed.filterLabels || [],
      thumb: reviewed.thumb || null,
      inputs: { ...reviewed.inputs, tasteTracks: [] },
      scene: reviewed.inputs.scene,
      prompt: reviewed.prompt,
      edited: reviewed.prompt !== reviewed.original,
      status: failure ? "failed" : "ok",
      error: failure?.message || null,
      model: next?.model || null,
      songLog: next?.songLog || [],
      steps: [...(reviewed.photoSteps || []), ...summarizeSteps(next?.trace || failure?.trace)],
      ms: Date.now() - startedAt,
      ...extra,
    };
    const saved = addHistory(entry);
    setLastRun({ ...entry, id: saved });
    return saved;
  };

  // ------------------------------------------------------------- step 4: build the prompt
  const readPhotos = async (photos) => {
    const key = photos.map((img) => img.previewUrl).join("|");
    if (sceneCache.current.key === key) return sceneCache.current;
    report({ stage: "photo" });
    const { scene, trace } = await analyzePhotos(photos, { onProgress: (p) => report({ stage: "photo", ...p }) });
    addTrace(trace);
    sceneCache.current = { key, scene, steps: summarizeSteps(trace) };
    return sceneCache.current;
  };

  const buildPrompt = async () => {
    if (busy || !inputReady) return;
    setBusy("prepare");
    setError(null);
    try {
      const photo = forPost ? await readPhotos(images) : null;
      const tasteTracks = !forPost && useTaste && tasteIds.length ? await getTracks(tasteIds).catch(() => []) : [];
      const inputs = {
        request: prompt.trim(), scene: photo?.scene || null, filters, forPost, format,
        imageCount: images.length, count: forPost ? POST_COUNT : count, tasteTracks,
      };
      const text = buildSongPrompt(inputs);
      setReview({
        inputs,
        original: text,
        prompt: text,
        photo: forPost ? images[0]?.previewUrl : null,
        photos: forPost ? images.map((img) => img.previewUrl) : [],
        thumb: forPost ? await thumbnail(images[0]?.previewUrl) : null,
        photoSteps: photo?.steps || [],
        filterLabels: chosenLabels,
      });
      goTo("prompt");
    } catch (e) {
      setError(e.message);
      addTrace(e.trace);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  // ------------------------------------------------------------- step 5: find songs
  const send = (text, inputs, { size, useModel = model, single = false, iteration = 1, edited = false }) => findSongs(text, {
    count: size, forPost: inputs.forPost, format: inputs.format, model: useModel, single, iteration, edited, onProgress: report,
  });

  const generate = async ({ useModel = model, single = false, reviewed = review, feedbackText = "" } = {}) => {
    if (!reviewed || busy) return;
    setBusy(feedbackText ? "refine" : "new");
    setError(null);
    setResult(feedbackText ? result : null);
    goTo("results");
    const startedAt = Date.now();
    const iteration = feedbackText && result ? (result.iteration || 1) + 1 : 1;
    const edited = reviewed.prompt !== reviewed.original;
    try {
      const next = await send(reviewed.prompt, reviewed.inputs, { size: reviewed.inputs.count, useModel, single, iteration, edited });
      addTrace(next.trace);
      setResult({ ...next, iteration, review: reviewed, forPost: reviewed.inputs.forPost, format: reviewed.inputs.forPost ? reviewed.inputs.format : null });
      setFeedback("");
      logRun({ reviewed, next, startedAt, extra: feedbackText ? { request: `${reviewed.inputs.request || "Photo"} → ${feedbackText}` } : {} });
      trackEvent(feedbackText ? "ai_playlist_refine" : "ai_playlist_generate", {
        prompt: reviewed.inputs.request || "(photo only)",
        with_photo: reviewed.photo ? 1 : 0,
        model: next.model,
        prompt_edited: edited ? 1 : 0,
        filters: (reviewed.filterLabels || []).join(", ") || "none",
        feedback: feedbackText || undefined,
        matched: next.picks.length,
        missed: next.missed.length,
      });
    } catch (e) {
      setError(e.message);
      addTrace(e.trace);
      logRun({ reviewed, failure: e, startedAt });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  /** The checked prompt with a new part: rebuilt when untouched, else appended to the listener's edit. */
  const extendPrompt = (base, change, extra) => {
    if (base.prompt === base.original) {
      const inputs = { ...base.inputs, ...change };
      const text = buildSongPrompt(inputs);
      return { ...base, inputs, original: text, prompt: text };
    }
    return { ...base, inputs: { ...base.inputs, ...change }, prompt: `${base.prompt}\n\n${extra}` };
  };

  const more = async () => {
    if (!result || busy) return;
    setBusy("more");
    setError(null);
    const startedAt = Date.now();
    const size = result.forPost ? POST_COUNT : MORE_COUNT;
    const asked = extendPrompt(result.review, { exclude: result.suggested, count: size },
      `## Already suggested (don't repeat)\n${result.suggested.join("; ")}\nSuggest ${size} NEW songs.`);
    try {
      const iteration = (result.iteration || 1) + 1;
      const next = await send(asked.prompt, asked.inputs, { size, iteration, edited: asked.prompt !== asked.original });
      addTrace(next.trace);
      logRun({ reviewed: asked, next, startedAt, extra: { request: `${asked.inputs.request || "Photo"} → more songs` } });
      setResult((current) => {
        const have = new Set(current.picks.map((p) => p.track.id));
        const fresh = next.picks.filter((p) => !have.has(p.track.id));
        if (!fresh.length) toast("No new songs this time. Try telling us what's missing.", { icon: "warning" });
        const picks = [...current.picks, ...fresh];
        return {
          ...current,
          picks,
          tracks: picks.map((p) => p.track),
          suggested: [...current.suggested, ...next.suggested],
          missed: [...current.missed, ...next.missed],
          model: next.model || current.model,
          iteration,
        };
      });
    } catch (e) {
      setError(e.message);
      addTrace(e.trace);
      logRun({ reviewed: asked, failure: e, startedAt });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const refine = (text = feedback) => {
    const note = text.trim();
    if (!note || !result) return;
    const next = extendPrompt(result.review, { feedback: note, exclude: result.suggested },
      `## Feedback on the last suggestions (follow it)\n"${note}"`);
    setReview(next);
    generate({ reviewed: next, feedbackText: note });
  };

  const reuse = (entry) => {
    setShowHistory(false);
    setMode(entry.mode);
    setFormat(entry.format || "story");
    // Set after the "inputs changed" reset has run.
    setTimeout(() => {
      setReview({
        inputs: { ...entry.inputs, tasteTracks: [] },
        original: entry.prompt,
        prompt: entry.prompt,
        photo: entry.thumb,
        photos: entry.thumb ? [entry.thumb] : [],
        thumb: entry.thumb,
        photoSteps: [],
        filterLabels: entry.filters,
      });
      goTo("prompt");
    }, 0);
  };

  const startOver = () => {
    setResult(null);
    setReview(null);
    setLastRun(null);
    setPrompt("");
    setImages([]);
    setFeedback("");
    setFilters(DEFAULT_FILTERS);
    goTo("start");
  };

  // ------------------------------------------------------------- listen
  const playHook = (index) => {
    const pick = result.picks[index];
    if (result.forPost) {
      if (currentTrack?.id === pick.track.id && hookStop?.id === pick.track.id && isPlaying) { togglePlay(); return; }
      setHookStop({ id: pick.track.id, end: pick.hookEnd });
      playFrom(result.tracks, index, pick.hookStart, "Instagram song ideas");
    } else {
      playFrom(result.tracks, index, pick.hookStart, result.name);
    }
    trackEvent("ai_play_best_part", { track_title: pick.title, rank: index + 1 });
  };

  // Stop at the end of the clip being previewed.
  useEffect(() => {
    if (!hookStop) return;
    if (currentTrack && currentTrack.id !== hookStop.id) { setHookStop(null); return; }
    if (isPlaying && currentTime >= hookStop.end) {
      togglePlay();
      setHookStop(null);
    }
  }, [hookStop, currentTrack, currentTime, isPlaying, togglePlay]);

  const playFull = (index) => {
    const pick = result.picks[index];
    setHookStop(null);
    if (currentTrack?.id === pick.track.id) togglePlay();
    else playTracks(result.tracks, index, result.name);
  };

  const save = () => {
    const playlist = createPlaylist({
      name: result.name,
      description: result.vibe ? `${result.vibe} ${result.description}` : result.description,
      trackIds: result.tracks.map((t) => t.id),
    });
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

  const nav = (back, next) => (
    <div className="ai-nav">
      {back ? <button type="button" className="ai-btn ai-btn--big" onClick={() => goTo(back)} disabled={Boolean(busy)}><Icon name="previous" size={16} /><span>Back</span></button> : <span />}
      {next}
    </div>
  );

  // ------------------------------------------------------------- render
  return (
    <div className="page ai ai-wizard">
      <div ref={topRef} />
      <header className="ai-wizard__head">
        <div>
          <span className="ai-chip-badge"><Icon name="sparkle" size={13} /> AI Song Finder</span>
          <h1 className="ai-wizard__title">
            {step === "start" ? "Find the right song" : forPost ? <>A song for <span className="ai-grad-text">your {format === "post" ? "post" : "story"}</span></> : <>A playlist for <span className="ai-grad-text">your mood</span></>}
          </h1>
        </div>
        <button type="button" className="ai-btn ai-btn--big" onClick={() => setShowHistory(true)}>
          <Icon name="clock" size={16} /><span>History{history.length ? ` (${history.length})` : ""}</span>
        </button>
      </header>

      <Stepper current={step} onGo={goTo} reachable={busy ? [] : reachable} />

      {error ? (
        <div className="ai-error" role="alert">
          <Icon name="warning" size={18} />
          <span>{error}</span>
          <button type="button" className="ai-link" onClick={() => setShowHistory(true)}>See the log</button>
          <button type="button" className="ai-link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      ) : null}

      {/* ============================================ 1. start */}
      {step === "start" ? (
        <section className="ai-card">
          <h2 className="ai-card__title">What do you need?</h2>
          <div className="ai-choices">
            <button type="button" className={`ai-choice${forPost ? " is-on" : ""}`} onClick={() => { setMode("photo"); goTo("input"); }}>
              <span className="ai-choice__icon"><Icon name="image" size={28} /></span>
              <strong>A song for my photo</strong>
              <small>For an Instagram story or post. Add a photo, we pick songs that fit it.</small>
            </button>
            <button type="button" className={`ai-choice${!forPost ? " is-on" : ""}`} onClick={() => { setMode("mood"); goTo("input"); }}>
              <span className="ai-choice__icon"><Icon name="music" size={28} /></span>
              <strong>A playlist for a mood</strong>
              <small>Describe a moment or feeling, in English or Hinglish.</small>
            </button>
          </div>
        </section>
      ) : null}

      {/* ============================================ 2. input */}
      {step === "input" ? (
        <section className="ai-card">
          {forPost ? (
            <>
              <h2 className="ai-card__title">Add your photo</h2>
              <div className="ai-seg ai-seg--wide" role="radiogroup" aria-label="Instagram format">
                {Object.entries(POST_FORMATS).map(([id, f]) => (
                  <button key={id} type="button" role="radio" aria-checked={format === id} className={`ai-seg__btn${format === id ? " is-on" : ""}`} onClick={() => chooseFormat(id)}>
                    {f.label} <small>· {id === "post" ? "1–10 photos" : "1 photo"}</small>
                  </button>
                ))}
              </div>
              <div
                className={`ai-drop${images.length ? " has-image" : ""}${images.length > 1 ? " is-carousel" : ""}${dragging ? " is-dragging" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addPhotos(e.dataTransfer.files); }}
              >
                {images.length ? (
                  <div className="ai-carousel">
                    {images.map((img, i) => (
                      <figure key={img.previewUrl} className="ai-carousel__slide">
                        <img src={img.previewUrl} alt={`Slide ${i + 1}`} />
                        <button type="button" className="ai-carousel__remove" onClick={() => setImages((c) => c.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}>
                          <Icon name="close" size={12} />
                        </button>
                      </figure>
                    ))}
                    {images.length < maxPhotos ? (
                      <button type="button" className="ai-carousel__add" onClick={() => fileInput.current?.click()}>
                        <Icon name="plus" size={20} /><small>{maxPhotos > 1 ? `${images.length}/${maxPhotos}` : "Change"}</small>
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button type="button" className="ai-drop__pick" onClick={() => fileInput.current?.click()}>
                    <span className="ai-drop__icon"><Icon name="image" size={28} /></span>
                    <strong>Tap to choose a photo</strong>
                    <small>or drop it here</small>
                  </button>
                )}
                <input ref={fileInput} type="file" accept="image/*" multiple={maxPhotos > 1} hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </div>
              <label className="ai-field">
                <span>Anything to add? <small>optional</small></span>
                <input
                  className="ai-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. best friend's wedding, want something trending"
                />
              </label>
            </>
          ) : (
            <>
              <h2 className="ai-card__title">What do you want to hear?</h2>
              <textarea
                className="ai-input ai-input--big"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. sad songs for rain, or kuch purane romantic gaane"
                aria-label="Describe what you want to hear"
              />
              <div className="ai-ideas">
                {IDEAS.map((idea) => <button key={idea} type="button" className="ai-chip" onClick={() => setPrompt(idea)}>{idea}</button>)}
              </div>
            </>
          )}
          {nav("start", (
            <button type="button" className="ai-cta" disabled={!inputReady} onClick={() => goTo("details")}>
              <span>{inputReady ? "Next" : forPost ? "Add a photo first" : "Type something first"}</span><Icon name="next" size={18} />
            </button>
          ))}
        </section>
      ) : null}

      {/* ============================================ 3. details */}
      {step === "details" ? (
        <section className="ai-card">
          <h2 className="ai-card__title">Any preferences? <small>all optional</small></h2>
          <div className="ai-helper">
            {Object.entries(FILTERS).map(([key, group]) => (
              <div key={key} className="ai-helper__row">
                <span className="ai-helper__label" id={`ai-f-${key}`}>{group.label}</span>
                <div className="ai-helper__chips" role="radiogroup" aria-labelledby={`ai-f-${key}`}>
                  {group.options.map((option) => (
                    <button key={option.id} type="button" role="radio" aria-checked={filters[key] === option.id} className={`ai-chip${filters[key] === option.id ? " is-on" : ""}`} onClick={() => setFilter(key, option.id)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filters.era === "custom" ? (
              <div className="ai-helper__row">
                <span className="ai-helper__label">Years</span>
                <div className="ai-years">
                  <select className="ai-select" value={filters.from} onChange={(e) => setFilter("from", Number(e.target.value))} aria-label="From year">
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span>to</span>
                  <select className="ai-select" value={filters.to} onChange={(e) => setFilter("to", Number(e.target.value))} aria-label="To year">
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            ) : null}
            {!forPost ? (
              <div className="ai-helper__row">
                <span className="ai-helper__label">Songs</span>
                <div className="ai-helper__chips">
                  {SIZES.map((n) => <button key={n} type="button" className={`ai-chip${count === n ? " is-on" : ""}`} onClick={() => setCount(n)}>{n}</button>)}
                  {tasteIds.length ? (
                    <label className="ai-switch">
                      <input type="checkbox" checked={useTaste} onChange={(e) => setUseTaste(e.target.checked)} />
                      <span className="ai-switch__track" aria-hidden="true"><span /></span>
                      <span>Use my taste</span>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
            <p className="ai-helper__summary">
              {rules.length ? <span>Looking for <strong>{rules.join(" · ")}</strong></span> : <span>No preferences: we'll pick from everything.</span>}
              {rules.length ? <button type="button" className="ai-link" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset</button> : null}
            </p>
          </div>
          {busy === "prepare" ? <Working busy={busy} progress={progress} now={now} photo={images[0]?.previewUrl} forPost={forPost} /> : null}
          {nav("input", (
            <button type="button" className="ai-cta" disabled={Boolean(busy) || aiBlocked} onClick={buildPrompt}>
              <span>{aiBlocked ? waitText : busy === "prepare" ? (forPost ? "Reading your photo…" : "Building…") : forPost ? "Read my photo" : "Next"}</span>
              <Icon name="next" size={18} />
            </button>
          ))}
        </section>
      ) : null}

      {/* ============================================ 4. check the prompt */}
      {step === "prompt" && review ? (
        <section className="ai-card">
          <h2 className="ai-card__title">Check before we search</h2>
          <p className="ai-card__hint">
            {review.inputs.scene
              ? "This is what the AI understood from your photo. If something is wrong, fix it in the prompt below: good songs need a correct description."
              : "This is exactly what the AI will get. You can change anything."}
          </p>
          <SceneCard scene={review.inputs.scene} photo={review.photo} photoCount={review.photos.length} />
          <details className="ai-prompt" open={review.prompt !== review.original}>
            <summary>
              <span>{review.prompt !== review.original ? "Prompt (edited by you)" : "See or edit the full prompt"}</span>
            </summary>
            <textarea
              className="ai-prompt__text"
              value={review.prompt}
              onChange={(e) => setReview((r) => ({ ...r, prompt: e.target.value }))}
              rows={16}
              spellCheck={false}
              aria-label="Prompt sent to the AI"
            />
            <button type="button" className="ai-btn" disabled={review.prompt === review.original} onClick={() => setReview((r) => ({ ...r, prompt: r.original }))}>
              <Icon name="undo" size={14} /><span>Undo my changes</span>
            </button>
          </details>
          <div className="ai-prompt__model">
            <AIModelPicker value={model} onChange={chooseModel} usedUp={usage.models.filter((m) => !m.available).map((m) => m.name)} />
            <AIUsageMeter usage={usage} />
          </div>
          {nav("details", (
            <button type="button" className="ai-cta" disabled={Boolean(busy) || !review.prompt.trim() || aiBlocked} onClick={() => generate()}>
              <Icon name={aiBlocked ? "clock" : "sparkle"} size={18} /><span>{aiBlocked ? waitText : "Find songs"}</span>
            </button>
          ))}
        </section>
      ) : null}

      {/* ============================================ 5. results */}
      {step === "results" ? (
        <section className="ai-result">
          {busy === "new" || busy === "refine" ? (
            <Working busy={busy} progress={progress} now={now} photo={review?.photo} forPost={forPost} />
          ) : null}

          {result && !(busy === "new" || busy === "refine") ? (
            <>
              {result.vibe ? <p className="ai-seen__vibe ai-result__vibe">{result.vibe}</p> : null}
              {result.picks.length ? (
                <ol className="ai-posts">
                  {result.picks.map((pick, index) => {
                    const loaded = currentTrack?.id === pick.track.id;
                    const clipPlaying = loaded && isPlaying && hookStop?.id === pick.track.id;
                    const fullPlaying = loaded && isPlaying && !clipPlaying;
                    const length = loaded && duration > 0 ? duration : Math.max(pick.hookEnd + 60, 210);
                    const pct = (t) => `${Math.min(100, (t / length) * 100)}%`;
                    return (
                      <li key={pick.track.id} className={`ai-post${index === 0 ? " is-top" : ""}${loaded && isPlaying ? " is-playing" : ""}`}>
                        <div className="ai-post__art-wrap">
                          <Artwork src={pick.track.artwork} className="ai-post__art" />
                          {loaded && isPlaying ? <Equalizer /> : null}
                        </div>
                        <div className="ai-post__body">
                          {index === 0 ? <span className="ai-eyebrow ai-eyebrow--gold">Best match</span> : null}
                          <h3 className="ai-post__title">{pick.title}</h3>
                          <p className="ai-pick__artist">{pick.artist}{pick.year ? ` · ${pick.year}` : ""} <Badge score={pick.popularity} /></p>
                          {pick.why ? <p className="ai-pick__why">{pick.why}</p> : null}
                          {result.forPost ? (
                            <div className="ai-clip" aria-label={`Clip ${formatTime(pick.hookStart)} to ${formatTime(pick.hookEnd)}`}>
                              <div className="ai-clip__track">
                                <span className="ai-clip__range" style={{ left: pct(pick.hookStart), width: `calc(${pct(pick.hookEnd)} - ${pct(pick.hookStart)})` }} />
                                {loaded ? <span className="ai-clip__head" style={{ left: pct(currentTime) }} /> : null}
                              </div>
                              <div className="ai-clip__meta">
                                <span className="ai-clip__time">{formatTime(pick.hookStart)} – {formatTime(pick.hookEnd)}{pick.hookEstimated ? " · estimated" : ""}</span>
                                {pick.hookLine ? <span className="ai-hook ai-hook--small">“{pick.hookLine}”</span> : null}
                              </div>
                            </div>
                          ) : null}
                          <div className="ai-pick__actions">
                            <button type="button" className="ai-btn ai-btn--hook" onClick={() => playHook(index)}>
                              <Icon name={clipPlaying ? "pause" : "play"} size={14} />
                              <span>{clipPlaying ? "Stop" : result.forPost ? "Play clip" : "Best part"}</span>
                            </button>
                            <button type="button" className="ai-btn" onClick={() => playFull(index)}>
                              <Icon name={fullPlaying ? "pause" : "music"} size={14} /><span>{fullPlaying ? "Pause" : "Full song"}</span>
                            </button>
                            <button type="button" className="icon-btn ai-pick__more" aria-label={`More options for ${pick.title}`} onClick={(e) => openTrackMenu(pick.track, { x: e.clientX, y: e.clientY })}>
                              <Icon name="more" size={18} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState icon="music" title="No playable songs found" message="Open “Why these songs?” below to see what went wrong." />
              )}

              <div className="ai-result__actions">
                {!result.forPost ? (
                  <>
                    <button type="button" className="ai-btn" disabled={!result.tracks.length} onClick={() => shufflePlay(result.tracks, result.name)}><Icon name="shuffle" size={14} /><span>Shuffle</span></button>
                    <button type="button" className="ai-btn" disabled={!result.tracks.length} onClick={save}><Icon name="plus" size={14} /><span>Save playlist</span></button>
                  </>
                ) : null}
                <button type="button" className="ai-btn" onClick={more} disabled={Boolean(busy) || aiBlocked}><Icon name="plus" size={14} /><span>{busy === "more" ? `Finding more… ${progress?.since ? clock(now - progress.since) : ""}` : "More songs"}</span></button>
                <button type="button" className="ai-btn" onClick={startOver} disabled={Boolean(busy)}><Icon name="undo" size={14} /><span>New search</span></button>
              </div>

              <div className="ai-refine">
                <h3 className="ai-refine__title">Not quite right? Tell us what to change</h3>
                <div className="ai-refine__chips">
                  {QUICK_FIXES.map((fix) => <button key={fix} type="button" className="ai-chip" disabled={Boolean(busy) || aiBlocked} onClick={() => refine(fix)}>{fix}</button>)}
                </div>
                <form className="ai-refine__form" onSubmit={(e) => { e.preventDefault(); refine(); }}>
                  <input className="ai-refine__input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. more like Arijit Singh" maxLength={200} aria-label="What should change?" />
                  <button type="submit" className="ai-cta ai-cta--small" disabled={!feedback.trim() || Boolean(busy) || aiBlocked}><Icon name="sparkle" size={16} /><span>Search again</span></button>
                </form>
              </div>
            </>
          ) : null}

          {lastRun && !(busy === "new" || busy === "refine") ? (
            <details className="ai-why" open={!result?.picks.length}>
              <summary>Why these songs? <small>what the AI suggested, what we found on YouTube, and the full log</small></summary>
              <RunLog entry={lastRun} />
            </details>
          ) : null}
        </section>
      ) : null}

      {AI_DEBUG ? (
        <AIPipelineInspector
          original={review?.original || ""}
          edited={review && review.prompt !== review.original ? review.prompt : null}
          onEdit={(text) => setReview((r) => (r ? { ...r, prompt: text ?? r.original } : r))}
          busy={Boolean(busy)}
          needsVision={false}
          visionModels={MODELS.filter((id) => getModelInfo(id).vision)}
          traces={traces}
          onRun={(useModel) => generate({ useModel, single: useModel !== "auto" })}
        />
      ) : null}

      {showHistory ? (
        <div className="ai-history__backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowHistory(false); }} role="presentation">
          <HistoryPanel entries={history} onClose={() => setShowHistory(false)} onReuse={reuse} />
        </div>
      ) : null}
    </div>
  );
}
