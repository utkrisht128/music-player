/**
 * NVIDIA (build.nvidia.com) chat models behind the same tiny interface the
 * Firebase AI SDK gives us: `model.generateContent(parts)` resolving to
 * `{ response: { text() } }`, so the model chain can mix NVIDIA and Gemini.
 * Per-model settings (JSON mode, tokens, timeout) come from aiModels.js.
 *
 * Requests go to REACT_APP_NVIDIA_PROXY_URL (default /api/nvidia, served by
 * src/setupProxy.js in dev), which adds the secret key.
 *
 * Every reply (and error) also carries `raw`, `status` and `request` (the
 * body we sent, images elided) for the pipeline inspector.
 */
const PROXY = (process.env.REACT_APP_NVIDIA_PROXY_URL || "/api/nvidia").replace(/\/$/, "");

/** Firebase-style parts (string or [{ inlineData }, "text"]) -> OpenAI content. */
function toContent(parts) {
  if (typeof parts === "string") return parts;
  return parts.map((part) =>
    typeof part === "string"
      ? { type: "text", text: part }
      : { type: "image_url", image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` } }
  );
}

/** The request body with base64 images replaced by a short note (for the trace). */
function redactBody(body) {
  return {
    ...body,
    messages: body.messages.map((m) => (Array.isArray(m.content)
      ? { ...m, content: m.content.map((c) => (c.type === "image_url" ? { type: "image_url", image_url: `<image ${Math.round(c.image_url.url.length * 0.75 / 1024)} KB>` } : c)) }
      : m)),
  };
}

/**
 * Models sometimes wrap JSON in ```json fences, add a sentence, think out
 * loud first, or (Llama 3.2 Vision with a photo) drop the outer braces.
 * Returns the JSON text, or "" when there is no JSON object in the reply.
 */
export function extractJSON(text) {
  const clean = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  const tryParse = (s) => { try { JSON.parse(s); return s; } catch { return null; } };
  if (tryParse(clean)) return clean;
  // Bare members: `"scene": {...}, "songs": [...]` with no enclosing braces.
  if (/^"[^"]+"\s*:/.test(clean)) {
    const wrapped = tryParse(`{${clean.replace(/,\s*$/, "")}}`);
    if (wrapped) return wrapped;
  }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(clean.slice(start, end + 1)) || clean.slice(start, end + 1);
  return "";
}

export function nvidiaSystemPrompt(jsonShape) {
  return `You are a music expert. Reply with ONLY a JSON object (no markdown, no extra text) in exactly this shape:
${jsonShape}
Only suggest real, released songs with correct titles and artists.`;
}

/**
 * Reads an OpenAI-style SSE stream. Returns { content, reasoning, finishReason, usage }.
 * `onChunk(phase)` fires on every chunk ("thinking" or "writing"), which also
 * resets the idle timer: a model that is still producing is never cut off.
 */
async function readStream(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const out = { content: "", reasoning: "", finishReason: null, usage: null, error: null };
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach((line) => {
      const payload = line.replace(/^data:\s*/, "").trim();
      if (!line.startsWith("data:") || !payload || payload === "[DONE]") return;
      let chunk;
      try { chunk = JSON.parse(payload); } catch { return; }
      // NVIDIA reports some failures (e.g. "CUDA out of memory") inside a 200 stream.
      if (chunk.error) out.error = chunk.error.message || String(chunk.error);
      const choice = chunk.choices?.[0];
      const delta = choice?.delta || {};
      if (delta.reasoning_content || delta.reasoning) out.reasoning += delta.reasoning_content || delta.reasoning;
      if (delta.content) out.content += delta.content;
      if (choice?.finish_reason) out.finishReason = choice.finish_reason;
      if (chunk.usage) out.usage = chunk.usage;
      onChunk(delta.content ? "writing" : "thinking");
    });
  }
  return out;
}

export function getNvidiaModel(info, jsonShape) {
  const system = nvidiaSystemPrompt(jsonShape);
  return {
    /**
     * `timeoutMs` is how long to wait for the FIRST token (the free tier can
     * queue a big model like Kimi for minutes). Once the model is producing,
     * only `idleMs` of silence aborts. `onProgress(phase)` reports
     * "queued" | "thinking" | "writing" for the UI.
     */
    async generateContent(parts, { timeoutMs = info.timeoutMs || 90000, onProgress } = {}) {
      const controller = new AbortController();
      const idleMs = info.idleMs || 60000;
      let why = `${info.label} timed out after ${Math.round(timeoutMs / 1000)}s waiting in NVIDIA's queue`;
      let timer = setTimeout(() => controller.abort(), timeoutMs);
      let phase = "queued";
      onProgress?.(phase);
      const heard = (next) => {
        clearTimeout(timer);
        why = `${info.label} stopped answering (no data for ${Math.round(idleMs / 1000)}s)`;
        timer = setTimeout(() => controller.abort(), idleMs);
        if (next !== phase) { phase = next; onProgress?.(phase); }
      };
      const body = {
        model: info.id,
        messages: [
          { role: "system", content: system },
          { role: "user", content: toContent(parts) },
        ],
        temperature: info.temperature ?? 0.7,
        max_tokens: info.maxTokens || 3000,
        stream: true,
        ...(info.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(info.extraBody || {}),
      };
      const request = redactBody(body);
      const fail = (message, extra = {}) => Object.assign(new Error(message), { request, ...extra });
      let res;
      let reply;
      try {
        res = await fetch(`${PROXY}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        if (res.ok && /event-stream/.test(res.headers.get("content-type") || "")) {
          reply = await readStream(res, heard);
        }
      } catch (error) {
        clearTimeout(timer);
        // Timeouts and network hiccups: let the chain try the next model.
        if (error.name === "AbortError") throw fail(why, { errorType: "TIMEOUT" });
        throw fail(`${info.label} unavailable [503]: network error: ${error.message}`, { errorType: "MODEL_CONNECTION" });
      }
      clearTimeout(timer);

      if (!reply) {
        // Not a stream: an error body, or a server that ignored `stream`.
        const raw = await res.text();
        let data = null;
        try {
          data = JSON.parse(raw);
        } catch {
          // No proxy (e.g. production without REACT_APP_NVIDIA_PROXY_URL) returns the HTML app shell.
          throw fail(`${info.label} unavailable [503]: proxy not reachable`, { status: res.status, raw: raw.slice(0, 2000), errorType: "MODEL_CONNECTION" });
        }
        if (!res.ok) {
          // Keep the real status: 404/410 = retired, 429 = slow down, 5xx = busy, 4xx = a bad request.
          const detail = data?.detail || data?.error?.message || data?.title || raw.slice(0, 200);
          const kind = res.status === 404 || res.status === 410 ? "not found"
            : res.status === 429 ? "rate limit"
            : res.status >= 500 ? "unavailable"
            : "rejected the request";
          throw fail(`${info.label} ${kind} [${res.status}]: ${detail}`, {
            status: res.status,
            raw,
            errorType: res.status === 429 ? "RATE_LIMIT" : res.status === 401 || res.status === 403 ? "AUTHENTICATION" : "MODEL_API_ERROR",
          });
        }
        const message = data?.choices?.[0]?.message || {};
        reply = { content: message.content || "", reasoning: message.reasoning_content || "", finishReason: data?.choices?.[0]?.finish_reason, usage: data?.usage };
      }

      if (reply.error && !reply.content) {
        // "unavailable" = busy: retried once, then the next model takes over.
        throw fail(`${info.label} unavailable [503]: ${reply.error.slice(0, 200)}`, { status: res.status, raw: reply.error, errorType: "MODEL_API_ERROR" });
      }
      // A thinking model that ran out of tokens sometimes leaves the JSON in its reasoning.
      const text = extractJSON(reply.content) || (reply.content ? "" : extractJSON(reply.reasoning));
      const meta = {
        status: res.status,
        raw: reply.reasoning ? `[thinking, ${reply.reasoning.length} chars]\n${reply.reasoning.slice(-1500)}\n\n[answer]\n${reply.content}` : reply.content,
        finishReason: reply.finishReason,
        usage: reply.usage,
        request,
      };
      if (!text) {
        const cut = reply.finishReason === "length" ? `: ran out of tokens (max_tokens ${body.max_tokens}) before answering` : reply.content ? "" : ": empty reply";
        throw fail(`${info.label} returned no JSON [invalid reply]${cut}`, { ...meta, errorType: "MODEL_RESPONSE" });
      }
      return { response: { text: () => text }, ...meta };
    },
  };
}
