import { useEffect } from "react";
import { usePlayer } from "../state/PlayerContext";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";

/** Fields and editable regions where a bare letter key means "type it". */
function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable === true
  );
}

/**
 * Global transport shortcuts.
 *
 *   Space  play/pause      ←/→  seek 5s      Shift+←/→  previous/next
 *   M  mute    S  shuffle    R  repeat    L  like    ↑/↓  volume
 *
 * Deliberately inert while the user is typing, and while a modifier that
 * belongs to the browser (Ctrl/Cmd/Alt) is held.
 */
export function useKeyboardShortcuts() {
  const player = usePlayer();
  const { toggleLike } = useLibrary();
  const { toast, modal, closeModal } = useUI();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Escape belongs to whatever is open on top.
      if (event.key === "Escape" && modal) {
        closeModal();
        return;
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          player.togglePlay();
          break;

        case "ArrowRight":
          event.preventDefault();
          if (event.shiftKey) player.skipNext(false);
          else player.nudge(5);
          break;

        case "ArrowLeft":
          event.preventDefault();
          if (event.shiftKey) player.skipPrevious();
          else player.nudge(-5);
          break;

        case "ArrowUp":
          event.preventDefault();
          player.setVolume(Math.min(1, player.volume + 0.05));
          break;

        case "ArrowDown":
          event.preventDefault();
          player.setVolume(Math.max(0, player.volume - 0.05));
          break;

        case "m":
        case "M":
          player.toggleMute();
          break;

        case "s":
        case "S":
          player.toggleShuffle();
          break;

        case "r":
        case "R":
          player.cycleRepeat();
          break;

        case "l":
        case "L": {
          if (!player.currentTrack) break;
          const nowLiked = toggleLike(player.currentTrack.id);
          toast(nowLiked ? "Added to Liked Songs" : "Removed from Liked Songs", {
            icon: nowLiked ? "heart" : "heartOutline",
          });
          break;
        }

        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, toggleLike, toast, modal, closeModal]);
}
