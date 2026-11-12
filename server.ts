import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import type { Request, Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = "models/gemini-omni-1.1-flash";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";

function stripHttpOptions(val: any): any {
  if (!val || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(stripHttpOptions);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (
      k === "httpOptions" ||
      k === "http_options" ||
      k === "__proto__" ||
      k === "constructor" ||
      k === "prototype" ||
      k === "cachedContent" ||
      k === "cached_content" ||
      k === "fileSearch" ||
      k === "file_search" ||
      k === "corpora" ||
      k === "semanticRetriever" ||
      k === "semantic_retriever"
    ) continue;
    if ((k === "fileData" || k === "file_data") && v && typeof v === "object") {
      const rawU = (v as any).fileUri ?? (v as any).file_uri;
      const u = typeof rawU === "string" ? rawU.trim() : "";
      if (!/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(u)) continue;
    }
    out[k] = stripHttpOptions(v);
  }
  return out;
}

function safeVideoMimeType(mime?: unknown): string {
  if (typeof mime === "string") {
    const normalized = mime.split(";")[0].trim().toLowerCase();
    if (/^video\/(mp4|webm)$/i.test(normalized)) return normalized;
  }
  return "video/mp4";
}

function getClientKey(req: Request): string {
  const raw = req.headers["x-client-id"];
  const cid = typeof raw === "string" ? raw.trim() : "";
  if (cid && /^[a-zA-Z0-9._-]{8,128}$/.test(cid)) {
    return `cid:${cid}`;
  }
  return `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
}

function getServerApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
}

function rawBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 2);

  const activeJobs = new Map<string, { ownerKey: string; startedAt: number }>();
  const MAX_PENDING_PER_CLIENT = 2;
  const MAX_PENDING_GLOBAL = 12;
  const STALE_JOB_MS = 10 * 60 * 1000;

  interface CachedVideo {
    ownerKey: string;
    mimeType: string;
    data: Buffer;
    createdAt: number;
  }
  const cachedVideos = new Map<string, CachedVideo>();
  const MAX_VIDEO_BUFFERS = 10;
  const MAX_VIDEO_CACHE_BYTES = 150 * 1024 * 1024;

  function cleanupJobsAndVideos() {
    const now = Date.now();
    for (const [id, j] of activeJobs.entries()) {
      if (now - j.startedAt > STALE_JOB_MS) activeJobs.delete(id);
    }
    for (const [id, v] of cachedVideos.entries()) {
      if (now - v.createdAt > 30 * 60 * 1000) cachedVideos.delete(id);
    }
  }

  function countPendingJobs(ownerKey?: string): number {
    cleanupJobsAndVideos();
    let count = 0;
    for (const j of activeJobs.values()) {
      if (!ownerKey || j.ownerKey === ownerKey) count++;
    }
    return count;
  }

  function storeCachedVideo(id: string, entry: CachedVideo) {
    if (entry.data.length > MAX_VIDEO_CACHE_BYTES) return;
    let bufferedCount = 0;
    let bufferedBytes = 0;
    for (const [k, v] of cachedVideos.entries()) {
      if (k !== id) {
        bufferedCount++;
        bufferedBytes += v.data.length;
      }
    }
    for (const [k, v] of cachedVideos.entries()) {
      if (k === id) continue;
      if (bufferedCount < MAX_VIDEO_BUFFERS && bufferedBytes + entry.data.length <= MAX_VIDEO_CACHE_BYTES) break;
      bufferedCount--;
      bufferedBytes -= v.data.length;
      cachedVideos.delete(k);
    }
    cachedVideos.set(id, entry);
  }

  setInterval(cleanupJobsAndVideos, 60 * 1000).unref();

  app.use(express.json({ limit: "25mb" }));
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === "object") {
      req.body = stripHttpOptions(req.body);
    }
    next();
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, configured: Boolean(getServerApiKey()) });
  });

  // Verification result is cached so repeated page loads do not trigger a
  // billable model call per request. Upstream error bodies are logged, never
  // reflected to the client.
  const VERIFY_CACHE_MS = 10 * 60 * 1000;
  let verifyCache: { at: number; status: number; body: { ok: boolean; detail: string } } | null = null;
  let verifyInFlight: Promise<{ status: number; body: { ok: boolean; detail: string } }> | null = null;

  async function runVerify(apiKey: string): Promise<{ status: number; body: { ok: boolean; detail: string } }> {
    try {
      const modelsRes = await fetch(GEMINI_MODELS_URL, {
        headers: { "x-goog-api-key": apiKey },
      });
      if (!modelsRes.ok) {
        const text = await modelsRes.text();
        console.error(`Verify: Gemini models list returned ${modelsRes.status}:`, text.slice(0, 300));
        return { status: 502, body: { ok: false, detail: "Server key verification failed." } };
      }

      const json: any = await modelsRes.json();
      const names: string[] = (json.models ?? []).map((m: any) => m.name);
      if (!names.includes(MODEL)) {
        return { status: 200, body: { ok: false, detail: `Server key is valid, but ${MODEL} is not available on it.` } };
      }

      const probe = await fetch(GEMINI_INTERACTIONS_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input: [{ type: "text", text: "Reply with the single word: ready." }],
        }),
      });

      if (probe.status === 404) {
        return { status: 200, body: { ok: false, detail: "The Interactions API is not enabled for the server key's project." } };
      }
      if (probe.status === 401 || probe.status === 403) {
        const text = await probe.text();
        console.error(`Verify: Gemini interactions probe returned ${probe.status}:`, text.slice(0, 300));
        return { status: 502, body: { ok: false, detail: "Server key verification failed." } };
      }

      return { status: 200, body: { ok: true, detail: `Ready: ${MODEL} reachable, Interactions API enabled.` } };
    } catch (err) {
      console.error("Verify: request to Gemini failed:", err);
      return { status: 500, body: { ok: false, detail: "Server key verification failed." } };
    }
  }

  app.get("/api/verify", async (_req: Request, res: Response) => {
    const apiKey = getServerApiKey();
    if (!apiKey) {
      res.status(500).json({
        ok: false,
        detail: "GEMINI_API_KEY is not configured on the server.",
      });
      return;
    }

    if (verifyCache && Date.now() - verifyCache.at < (verifyCache.body.ok ? VERIFY_CACHE_MS : 60 * 1000)) {
      res.status(verifyCache.status).json(verifyCache.body);
      return;
    }

    try {
      if (!verifyInFlight) {
        verifyInFlight = runVerify(apiKey)
          .then((result) => {
            verifyCache = { at: Date.now(), ...result };
            return result;
          })
          .finally(() => {
            verifyInFlight = null;
          });
      }
      const result = await verifyInFlight;
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error("Verify failed:", err);
      res.status(500).json({ ok: false, detail: "Server key verification failed." });
    }
  });

  app.post("/api/generate", async (req: Request, res: Response) => {
    const apiKey = getServerApiKey();
    if (!apiKey) {
      res.status(500).json({
        error: { message: "GEMINI_API_KEY is not configured on the server." },
      });
      return;
    }

    const { plateDataUrl, prompt } = req.body ?? {};
    if (!plateDataUrl || typeof plateDataUrl !== "string" || !prompt || typeof prompt !== "string") {
      res.status(400).json({
        error: { message: "Both plateDataUrl and prompt are required." },
      });
      return;
    }

    const ownerKey = getClientKey(req);
    if (countPendingJobs(ownerKey) >= MAX_PENDING_PER_CLIENT) {
      res.status(429).json({
        error: { message: "Too many concurrent video jobs for your session. Please wait for the current clip to finish." },
      });
      return;
    }
    if (countPendingJobs() >= MAX_PENDING_GLOBAL) {
      res.status(429).json({
        error: { message: "Too many concurrent video jobs on server. Please try again shortly." },
      });
      return;
    }

    const jobId = crypto.randomUUID();
    activeJobs.set(jobId, { ownerKey, startedAt: Date.now() });

    const upstreamBody = JSON.stringify({
      model: MODEL,
      input: [
        { type: "image", data: rawBase64(plateDataUrl), mime_type: "image/jpeg" },
        { type: "text", text: prompt },
      ],
    });

    try {
      const upstream = await fetch(GEMINI_INTERACTIONS_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: upstreamBody,
        signal: AbortSignal.timeout(STALE_JOB_MS),
      });

      const responseText = await upstream.text();
      let safePayload: any = null;
      try {
        safePayload = JSON.parse(responseText);
        for (const step of safePayload?.steps ?? []) {
          for (const part of step?.content ?? []) {
            if (part?.type === "video") {
              part.mime_type = safeVideoMimeType(part.mime_type);
              if (typeof part.data === "string" && part.data.length > 0) {
                const videoId = crypto.randomUUID();
                const buf = Buffer.from(part.data, "base64");
                storeCachedVideo(videoId, {
                  ownerKey,
                  mimeType: part.mime_type,
                  data: buf,
                  createdAt: Date.now(),
                });
                part.video_url = `/api/videos/${videoId}`;
              }
            }
          }
        }
      } catch {
        safePayload = null;
      }

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      if (safePayload !== null) {
        res.status(upstream.status).json(safePayload);
      } else {
        res.status(upstream.status).json({
          error: { message: `Upstream returned non-JSON status ${upstream.status}` },
        });
      }
    } catch (err) {
      res.status(502).json({
        error: {
          message: `Upstream error reaching Gemini: ${err instanceof Error ? err.message : String(err)}`,
        },
      });
    } finally {
      activeJobs.delete(jobId);
    }
  });

  app.get("/api/videos/:id", (req: Request, res: Response) => {
    cleanupJobsAndVideos();
    const stored = cachedVideos.get(String(req.params.id || ""));
    if (!stored) {
      res.status(404).json({ error: { message: "Video not found." } });
      return;
    }
    if (stored.ownerKey !== getClientKey(req)) {
      res.status(404).json({ error: { message: "Video not found." } });
      return;
    }
    res.setHeader("Content-Type", safeVideoMimeType(stored.mimeType));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; media-src 'self'; sandbox");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(stored.data);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
