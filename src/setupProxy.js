/**
 * Dev-server proxy for NVIDIA's AI API (build.nvidia.com).
 *
 * NVIDIA doesn't allow browser (CORS) calls, and the key must stay secret,
 * so the browser calls /api/nvidia/* and this adds the key server-side.
 * NVIDIA_KEY lives in .env.local WITHOUT the REACT_APP_ prefix, so it is
 * never bundled into the app. Only runs with `npm start`.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  const key = (process.env.NVIDIA_KEY || "").trim();
  if (!key) return;
  app.use(
    "/api/nvidia",
    createProxyMiddleware({
      target: "https://integrate.api.nvidia.com",
      changeOrigin: true,
      pathRewrite: { "^/api/nvidia": "" },
      // Kimi can sit in NVIDIA's free queue for 4+ minutes before its first
      // token; the app has its own (per-model) limits, so don't cut it here.
      proxyTimeout: 600000,
      timeout: 600000,
      onProxyReq(proxyReq) {
        proxyReq.setHeader("Authorization", `Bearer ${key}`);
      },
      onProxyRes(proxyRes) {
        // The dev server gzips responses, which buffers a stream until it
        // ends; "no-transform" makes it pass the chunks straight through.
        proxyRes.headers["cache-control"] = "no-cache, no-transform";
      },
    })
  );
};
