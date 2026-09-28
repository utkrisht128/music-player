import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const SITE_NAME = "Resonate";
export const SITE_URL = "https://spotifyclone128.web.app";
const DEFAULT_DESCRIPTION =
  "Resonate is a free online music player: search songs and music videos, build playlists, " +
  "follow synced lyrics and pick music by mood.";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Per-page title, description, canonical URL and social tags.
 * Personal pages (library, stats, settings…) pass `noindex`.
 */
export function useSeo({ title, description = DEFAULT_DESCRIPTION, image, noindex = false } = {}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} – Free Online Music Player`;
    const url = SITE_URL + pathname;
    const img = image ? (image.startsWith("/") ? SITE_URL + image : image) : `${SITE_URL}/logo512.png`;

    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
    setCanonical(url);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", img);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", img);
  }, [title, description, image, noindex, pathname]);
}
