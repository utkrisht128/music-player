import { useCallback, useEffect, useState } from "react";
import { usePlayer } from "../../state/PlayerContext";
import { useUI } from "../../state/UIContext";

/** Opens the sleep-timer menu at an anchor point. */
export function useSleepMenu() {
  const { sleep, setSleepTimer } = usePlayer();
  const { openMenu, toast } = useUI();
  const remaining = useSleepRemaining();

  return useCallback(
    (anchor) => {
      const set = (value, label) => () => {
        setSleepTimer(value);
        toast(label, { icon: "moon" });
      };
      openMenu(
        [
          { label: "15 minutes", icon: "moon", onSelect: set(15, "Sleep timer set for 15 minutes") },
          { label: "30 minutes", onSelect: set(30, "Sleep timer set for 30 minutes") },
          { label: "45 minutes", onSelect: set(45, "Sleep timer set for 45 minutes") },
          { label: "1 hour", onSelect: set(60, "Sleep timer set for 1 hour") },
          { label: "End of this song", onSelect: set("track", "Stopping at the end of this song") },
          sleep
            ? {
                label: `Turn off${remaining ? ` (${remaining} left)` : ""}`,
                icon: "close",
                danger: true,
                separatorBefore: true,
                onSelect: set(null, "Sleep timer off"),
              }
            : null,
        ],
        anchor
      );
    },
    [sleep, setSleepTimer, openMenu, toast, remaining]
  );
}

/** "12m" style countdown for a timed sleep, or null. */
export function useSleepRemaining() {
  const { sleep } = usePlayer();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sleep?.at) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [sleep]);
  if (!sleep) return null;
  if (sleep.endOfTrack) return "end of song";
  const minutes = Math.max(1, Math.ceil((sleep.at - now) / 60000));
  return `${minutes}m`;
}
