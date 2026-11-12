/**
 * Browser client for the local backend Gemini Interactions proxy (/api/*).
 *
 * The shared GEMINI_API_KEY lives strictly on the backend (server.ts) and is
 * never exposed to the browser bundle.
 */

export const MODEL = "models/gemini-omni-1.1-flash";

const GENERATE_ENDPOINT = "/api/generate";
const VERIFY_ENDPOINT = "/api/verify";

let fallbackClientId = "";
function getClientId(): string {
  const key = "aistudio_client_id";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9._-]{8,128}$/.test(existing)) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    if (!fallbackClientId) {
      fallbackClientId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
    return fallbackClientId;
  }
}

function safeVideoMimeType(mime?: unknown): string {
  if (typeof mime === "string") {
    const normalized = mime.split(";")[0].trim().toLowerCase();
    if (/^video\/(mp4|webm)$/i.test(normalized)) return normalized;
  }
  return "video/mp4";
}

/** Omni's hard output, not a request parameter. Used for UI math only. */
export const CLIP_SECONDS = 10;
export const CLIP_W = 1280;
export const CLIP_H = 720;

export interface GenerateResult {
  /** Object URL for the returned mp4. Caller owns it; revoke when done. */
  url: string;
  blob: Blob;
  bytes: number;
  seconds: number;
}

export class OmniError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
    this.name = "OmniError";
  }
}

async function readError(res: Response): Promise<OmniError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* keep the status at least */
  }
  let detail = body.slice(0, 400);
  try {
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? detail;
  } catch {
    /* not JSON; the raw text is better than nothing */
  }

  if (res.status === 404 && /requested entity was not found/i.test(detail)) {
    detail =
      "the Interactions API is not enabled for this project. The server key's " +
      "project cannot reach the video endpoint.";
  } else if (res.status === 400 && /api key not valid/i.test(detail)) {
    detail = "the server API key is not valid.";
  } else if (res.status === 401 || res.status === 403) {
    detail = `${detail} (the server key was rejected)`;
  }

  return new OmniError(`Gemini returned ${res.status}: ${detail}`, res.status, body);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface GenerateOptions {
  /** 1280x720 JPEG data URL. Must be exactly that -- see lib/plate.ts. */
  plateDataUrl: string;
  prompt: string;
  signal?: AbortSignal;
  /** Called before each retry so the UI can say what is happening. */
  onRetry?: (attempt: number, waitSeconds: number, reason: string) => void;
}

/**
 * Generate one clip via the local server proxy (/api/generate).
 *
 * Retries 5xx only. Video generation regularly takes 40s+ and the gateway
 * returns 504 "Deadline expired" under load; without a retry a whole run is
 * thrown away by a blip that succeeds on the next attempt. 4xx is never
 * retried.
 */
export async function generateClip(opts: GenerateOptions): Promise<GenerateResult> {
  const { plateDataUrl, prompt, signal, onRetry } = opts;
  const body = JSON.stringify({
    plateDataUrl,
    prompt,
  });

  const RETRIES = 3;
  const started = performance.now();

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(GENERATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": getClientId() },
        body,
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt === RETRIES - 1) {
        throw new OmniError(
          `Network error reaching backend proxy: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const wait = 5 * (attempt + 1);
      onRetry?.(attempt + 1, wait, "network error");
      await sleep(wait * 1000, signal);
      continue;
    }

    if (!res.ok) {
      const error = await readError(res);
      if (res.status < 500 || attempt === RETRIES - 1) throw error;
      const wait = 5 * (attempt + 1);
      onRetry?.(attempt + 1, wait, `HTTP ${res.status}`);
      await sleep(wait * 1000, signal);
      continue;
    }

    const json = await res.json();
    const video = findVideo(json);
    if (!video) {
      throw new OmniError(
        `Gemini returned no video. It replied: ${findText(json).slice(0, 300) || "(nothing)"}`,
      );
    }
    const blob = base64ToBlob(video.data, safeVideoMimeType(video.mime_type));
    return {
      url: URL.createObjectURL(blob),
      blob,
      bytes: blob.size,
      seconds: (performance.now() - started) / 1000,
    };
  }

  throw new OmniError("Exhausted retries without a response.");
}

interface MediaPart {
  type: string;
  data: string;
  mime_type?: string;
}

/** Walk steps[].content[] for the first video part. */
function findVideo(interaction: any): MediaPart | null {
  for (const step of interaction?.steps ?? []) {
    for (const part of step?.content ?? []) {
      if (part?.type === "video" && part?.data) return part as MediaPart;
    }
  }
  return null;
}

/** Model-visible text, skipping the thinking steps. */
function findText(interaction: any): string {
  const out: string[] = [];
  for (const step of interaction?.steps ?? []) {
    if (step?.type === "thought") continue;
    for (const part of step?.content ?? []) {
      if (part?.type === "text" && part?.text) out.push(part.text);
    }
  }
  return out.join(" ").trim();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function verifyServerKey(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      headers: { "x-client-id": getClientId() },
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      detail: data?.detail || (res.ok ? "Server key verified." : `HTTP ${res.status}`),
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
