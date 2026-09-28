import React, { useRef, useState } from "react";

/**
 * Range control used for both seeking and volume.
 *
 * Built on <input type="range"> rather than a div with click maths. The old
 * implementation read `event.nativeEvent.offsetX` against the element width,
 * which broke whenever the pointer landed on the thumb (offset is relative to
 * the thumb, not the track) and was completely unusable by keyboard. A native
 * range gives correct pointer maths, arrow-key stepping and screen-reader
 * semantics for free.
 *
 * While dragging we hold a local value so React state updates arriving from
 * `timeupdate` do not fight the thumb under the user's finger.
 */
export default function Slider({
  value,
  max,
  step = 0.1,
  onChange,
  onCommit,
  ariaLabel,
  valueText,
  className = "",
  disabled = false,
}) {
  const [dragValue, setDragValue] = useState(null);
  const dragging = useRef(false);

  const safeMax = max > 0 ? max : 1;
  const shown = dragValue != null ? dragValue : Math.min(value || 0, safeMax);
  const percent = (shown / safeMax) * 100;

  const begin = () => { dragging.current = true; };

  const change = (event) => {
    const next = Number(event.target.value);
    if (dragging.current) setDragValue(next);
    onChange?.(next);
  };

  const commit = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragValue != null) onCommit?.(dragValue);
    setDragValue(null);
  };

  return (
    <div
      className={`slider ${className}`}
      style={{ "--slider-fill": `${Math.max(0, Math.min(100, percent))}%` }}
    >
      <div className="slider__track" aria-hidden="true">
        <div className="slider__fill" />
        <div className="slider__thumb" />
      </div>
      <input
        className="slider__input"
        type="range"
        min={0}
        max={safeMax}
        step={step}
        value={shown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        onMouseDown={begin}
        onTouchStart={begin}
        onKeyDown={begin}
        onChange={change}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
