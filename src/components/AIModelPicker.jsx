import React from "react";
import { AUTO, MODEL_CATALOG, MODELS } from "../services/aiModels";

/**
 * Pick which AI answers. "Auto" walks the whole list; a specific model goes
 * first and the rest stay as backups. Photo requests grey out models that
 * can't see images.
 */
export default function AIModelPicker({ value, onChange, needsVision = false, usedUp = [] }) {
  const models = MODEL_CATALOG.filter((m) => MODELS.includes(m.id));
  const groups = [
    ["NVIDIA (free)", models.filter((m) => m.provider === "nvidia")],
    ["Google Gemini", models.filter((m) => m.provider === "gemini")],
  ].filter(([, list]) => list.length);

  return (
    <label className="ai-model">
      <span className="ai-model__label">AI model</span>
      <select className="ai-select ai-model__select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={AUTO}>Auto (best available)</option>
        {groups.map(([name, list]) => (
          <optgroup key={name} label={name}>
            {list.map((m) => {
              const blind = needsVision && !m.vision;
              const gone = usedUp.includes(m.id);
              return (
                <option key={m.id} value={m.id} disabled={blind}>
                  {m.label} · {blind ? "can't read photos" : gone ? "used up today" : m.note}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
