import React, { useState } from "react";
import { AUTO, MODELS, modelLabel } from "../services/aiModels";

/**
 * Debug-mode panel on the AI page: the exact prompt (original, edited,
 * sent), a way to run it on one model, and every step of each run with its
 * input, prompt, config, raw reply, parsed output, error and timing.
 */
const fmtMs = (ms) => (ms == null ? "…" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
const show = (v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));
const STATUS = { ok: "✓ Completed", failed: "✗ Failed", skipped: "– Skipped", running: "… Running" };

function Section({ label, value }) {
  const [open, setOpen] = useState(false);
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  return (
    <div className="ai-dbg__section">
      <button type="button" className="ai-link" onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} {label}</button>
      {open ? <pre className="ai-dbg__pre">{show(value)}</pre> : null}
    </div>
  );
}

function Step({ step, onRetry, busy }) {
  const model = step.type === "model";
  return (
    <li className={`ai-dbg__step is-${step.status}`}>
      <div className="ai-dbg__head">
        <strong>Step {step.n} · {step.name}</strong>
        <span>{STATUS[step.status] || step.status}</span>
        <span>{fmtMs(step.duration)}</span>
      </div>
      {step.provider ? <div className="ai-dbg__meta">{step.provider}{step.model ? ` · ${step.model}` : ""}{step.http ? ` · HTTP ${step.http}` : ""}{step.timeoutMs ? ` · timeout ${fmtMs(step.timeoutMs)}` : ""}</div> : null}
      {step.error ? (
        <div className="ai-dbg__error">
          <b>{step.error.errorType}</b>{step.error.message ? `: ${step.error.message}` : ""}
          {step.error.next ? <div>→ {step.error.next}</div> : null}
        </div>
      ) : null}
      <Section label="Input" value={step.input} />
      {step.prompt?.system ? <Section label="System prompt (actual)" value={step.prompt.system} /> : null}
      {step.prompt?.user ? <Section label="User prompt (actual, sent)" value={step.prompt.user} /> : null}
      <Section label="Config" value={step.config} />
      <Section label="Request body (images elided)" value={step.request} />
      <Section label="Notes / retries" value={step.notes} />
      {model ? <Section label="Raw response" value={step.raw} /> : null}
      <Section label="Parsed output" value={step.parsed} />
      <Section label="Output → next step" value={step.output} />
      <Section label="Usage" value={step.usage} />
      {model && step.status === "failed" && onRetry ? (
        <button type="button" className="ai-btn" disabled={busy} onClick={() => onRetry(step.model)}>Retry this step on {modelLabel(step.model)}</button>
      ) : null}
    </li>
  );
}

export default function AIPipelineInspector({ original, edited, onEdit, onRun, traces, busy, needsVision, visionModels }) {
  const [runModel, setRunModel] = useState(AUTO);
  const [selected, setSelected] = useState(0);
  const text = edited ?? original;
  const trace = traces[selected] || traces[0];
  const models = needsVision ? visionModels : MODELS;

  return (
    <details className="ai-dbg" open>
      <summary>AI Pipeline Inspector <small>(debug mode)</small></summary>

      <div className="ai-dbg__prompt">
        <div className="ai-dbg__head">
          <strong>Prompt</strong>
          <span>{edited != null ? "Modified by you" : "Original (built by the app)"}</span>
        </div>
        <textarea className="ai-dbg__textarea" rows={10} value={text} onChange={(e) => onEdit(e.target.value)} spellCheck={false} />
        <div className="ai-dbg__actions">
          <button type="button" className="ai-btn" disabled={edited == null} onClick={() => onEdit(null)}>Reset prompt</button>
          <select className="ai-dbg__select" value={runModel} onChange={(e) => setRunModel(e.target.value)} aria-label="Model to run">
            <option value={AUTO}>Auto (full fallback chain)</option>
            {models.map((id) => <option key={id} value={id}>{modelLabel(id)} only</option>)}
          </select>
          <button type="button" className="ai-btn ai-btn--magic" disabled={busy} onClick={() => onRun(runModel, text === original ? null : text)}>Run step</button>
        </div>
        <p className="ai-dbg__hint">The main button always sends the original prompt (it adds the “already suggested” list and feedback). “Run step” sends exactly the text above.</p>
        {edited != null ? <Section label="Original prompt (for comparison)" value={original} /> : null}
      </div>

      {traces.length ? (
        <>
          <div className="ai-dbg__runs">
            {traces.map((t, i) => (
              <button key={t.id} type="button" className={`ai-seg__btn${i === selected ? " is-on" : ""}`} onClick={() => setSelected(i)}>
                {t.status === "ok" ? "✓" : "✗"} {t.label} #{t.iteration || 1} · {fmtMs(t.duration)}
              </button>
            ))}
          </div>
          {trace ? (
            <>
              <div className="ai-dbg__meta">
                Chosen: {trace.chosenModel === AUTO ? "Auto" : modelLabel(trace.chosenModel)}{trace.single ? " (single model)" : ""} · Iteration {trace.iteration || 1} · Total {fmtMs(trace.duration)}
                {trace.prompt ? ` · Prompt: ${trace.prompt.edited ? "edited by you" : "original"}` : ""}
              </div>
              <table className="ai-dbg__table">
                <thead><tr><th>Step</th><th>Model</th><th>Status</th><th>Duration</th></tr></thead>
                <tbody>
                  {trace.steps.map((s) => (
                    <tr key={s.n} className={`is-${s.status}`}><td>{s.n}. {s.name}</td><td>{s.model ? modelLabel(s.model) : "—"}</td><td>{STATUS[s.status]}</td><td>{fmtMs(s.duration)}</td></tr>
                  ))}
                </tbody>
              </table>
              {!trace.debug ? <p className="ai-dbg__hint">Debug mode is off: prompts and raw replies are not recorded.</p> : null}
              <ol className="ai-dbg__steps">
                {trace.steps.map((s) => <Step key={s.n} step={s} busy={busy} onRetry={(m) => onRun(m, trace.prompt?.edited || null)} />)}
              </ol>
            </>
          ) : null}
        </>
      ) : <p className="ai-dbg__hint">Run a request to see each step here.</p>}
    </details>
  );
}
