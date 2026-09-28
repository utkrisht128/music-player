/**
 * Share links. A song link is /track/<id>; a playlist link carries its name
 * and song ids in the URL (/shared?name=…&ids=…), so nothing needs a server.
 * Songs chosen from the device cannot be shared (they only exist locally).
 */

const MAX_SHARED_IDS = 150; // keeps URLs well under common length limits

export const isShareable = (track) => track && track.source !== "device";

export function trackShareUrl(track) {
  return `${window.location.origin}/track/${encodeURIComponent(track.id)}`;
}

export function playlistShareUrl(name, trackIds) {
  const ids = trackIds.filter((id) => !id.startsWith("device_")).slice(0, MAX_SHARED_IDS);
  const params = new URLSearchParams({ name, ids: ids.join(",") });
  return `${window.location.origin}/shared?${params}`;
}

/** Native share sheet on phones; clipboard elsewhere. Resolves to a message. */
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return null; // the OS sheet is its own feedback
    } catch (error) {
      if (error.name === "AbortError") return null;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied to clipboard";
  } catch (error) {
    window.prompt("Copy this link:", url);
    return null;
  }
}
