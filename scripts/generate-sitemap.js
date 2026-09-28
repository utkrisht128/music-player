/**
 * Writes public/sitemap.xml from the catalog ids (runs before `npm run build`).
 * Ids are read with regexes because the catalog modules import audio/images
 * that Node cannot load directly.
 */
const fs = require("fs");
const path = require("path");

const SITE_URL = "https://spotifyclone128.web.app";
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const catalog = read("src/data/catalog.js") + read("src/data/freeCatalog.js");
const moodsSource = read("src/services/youtube.js");
const moodsBlock = moodsSource.slice(moodsSource.indexOf("export const MOODS"));

const ids = (source, pattern) => [...new Set([...source.matchAll(pattern)].map((m) => m[1]))];

const urls = [
  { loc: "/", priority: "1.0", changefreq: "daily" },
  { loc: "/search", priority: "0.8", changefreq: "weekly" },
  ...ids(moodsBlock.slice(0, moodsBlock.indexOf("];")), /id: "([a-z0-9_-]+)"/g).map((id) => ({
    loc: `/mood/${id}`, priority: "0.8", changefreq: "daily",
  })),
  ...ids(catalog, /id: "(cur_[a-z0-9_]+)"/g).map((id) => ({ loc: `/playlist/${id}`, priority: "0.7" })),
  ...ids(catalog, /id: "(al_[a-z0-9_]+)"/g).map((id) => ({ loc: `/album/${id}`, priority: "0.6" })),
];

const today = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ loc, priority, changefreq = "monthly" }) =>
      `  <url><loc>${SITE_URL}${loc}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(path.join(root, "public/sitemap.xml"), xml);
console.log(`sitemap.xml: ${urls.length} urls`);
