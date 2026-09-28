import React from "react";
import Icon from "../Icon";
import Slider from "../Slider";
import { usePlayer } from "../../state/PlayerContext";

/** Mute toggle plus volume slider. The icon reflects the actual output level. */
export default function VolumeControl() {
  const { volume, muted, setVolume, toggleMute } = usePlayer();

  const effective = muted ? 0 : volume;
  const iconName =
    effective === 0 ? "volumeMuted" : effective < 0.5 ? "volumeLow" : "volumeHigh";

  return (
    <div className="volume">
      <button
        type="button"
        className="icon-btn"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <Icon name={iconName} size={18} />
      </button>
      <Slider
        className="volume__slider"
        value={effective}
        max={1}
        step={0.01}
        ariaLabel="Volume"
        valueText={`${Math.round(effective * 100)} percent`}
        onChange={setVolume}
      />
    </div>
  );
}
