import type { MoveId } from "./lib/prompt";
import type { Plate } from "./lib/plate";

export type RoomStatus = "ready" | "queued" | "generating" | "done" | "failed";

export interface Room {
  id: string;
  name: string;
  plate: Plate;
  thumb: string;
  move: MoveId;
  status: RoomStatus;
  /** Object URL (live) or bundled path (demo) for the finished clip. */
  clipUrl?: string;
  clipBlob?: Blob;
  /** Seconds the generation took. Absent in demo mode, which is instant. */
  genSeconds?: number;
  /** Where the clip came from. The UI must never blur these two. */
  source?: "generated" | "demo";
  error?: string;
  /** Live progress note, e.g. a retry countdown. */
  note?: string;
}

export type KeySource = "injected" | "user" | "none";
