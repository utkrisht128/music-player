import { useEffect, useState } from "react";

const cache = new Map();

/**
 * Average colour of an image, nudged darker so white text stays readable on
 * it. Returns null until known, or when the image host blocks canvas reads
 * (no CORS), in which case callers keep their default background.
 */
export function useDominantColor(src) {
  const [color, setColor] = useState(() => (src ? cache.get(src) || null : null));

  useEffect(() => {
    if (!src) { setColor(null); return undefined; }
    if (cache.has(src)) { setColor(cache.get(src)); return undefined; }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2]);
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          // Weight colourful pixels over greys, so letterbox bars don't win.
          const weight = 1 + (max - min) / 32;
          r += data[i] * weight; g += data[i + 1] * weight; b += data[i + 2] * weight; n += weight;
        }
        const scale = 0.72; // darken for contrast with white text
        const value = `rgb(${Math.round((r / n) * scale)}, ${Math.round((g / n) * scale)}, ${Math.round((b / n) * scale)})`;
        cache.set(src, value);
        if (!cancelled) setColor(value);
      } catch (error) {
        cache.set(src, null); // tainted canvas: host sent no CORS header
        if (!cancelled) setColor(null);
      }
    };
    img.onerror = () => { if (!cancelled) setColor(null); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return color;
}
