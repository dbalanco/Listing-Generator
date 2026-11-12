import React, { useRef, useState } from "react";
import type { Room } from "../types";
import type { MoveId } from "../lib/prompt";
import { MOVE_LABELS } from "../lib/prompt";
import { Check, Dots, Warn, Lock } from "./Icons";

/* ------------------------------------------------------------- room rail */

export function RoomRail({
  rooms, selectedId, onSelect, onAdd, onRemove, busy, max,
}: {
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (files: FileList) => void;
  onRemove: (id: string) => void;
  busy: boolean;
  max: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [hot, setHot] = useState(false);
  const full = rooms.length >= max;

  return (
    <div className="col">
      <div className="collabel">
        <span>Uploaded rooms</span>
        <span>{rooms.length}/{max}</span>
      </div>
      <div className="col-scroll">
        <div className="rail">
          {rooms.map((r) => (
            <button
              key={r.id}
              className={`room${r.id === selectedId ? " sel" : ""}`}
              onClick={() => onSelect(r.id)}
              title={r.name}
            >
              <img src={r.thumb} alt={r.name} />
              <span className="scrim" />
              <span className="movetag">{MOVE_LABELS[r.move]}</span>
              <span className="lbl">{r.name}</span>
              <StatusBadge room={r} />
              {!busy && (
                <span
                  className="kill"
                  role="button"
                  aria-label={`Remove ${r.name}`}
                  onClick={(e) => { e.stopPropagation(); onRemove(r.id); }}
                >×</span>
              )}
            </button>
          ))}

          {!full && (
            <>
              <button
                className={`dropzone${hot ? " hot" : ""}`}
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setHot(true); }}
                onDragLeave={() => setHot(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setHot(false);
                  if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
                }}
              >
                <b>{rooms.length ? "Add a room" : "Drop listing photos"}</b>
                Any size. Cropped to 1280×720 here, before anything is sent.
              </button>
              <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }}
              />
            </>
          )}

          <div className="rail-disclaimer">
            <p>
              By using this feature, you confirm that you have the necessary rights to any content that you upload. Do not generate content that infringes on others’ intellectual property or privacy rights. Your use of this generative AI service is subject to our{" "}
              <a
                href="https://policies.google.com/terms/generative-ai/use-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Prohibited Use Policy
              </a>
              .
            </p>
            <p>
              Please note that uploads from Google Workspace may be used to develop and improve Google products and services in accordance with our{" "}
              <a
                href="https://policies.google.com/terms/generative-ai/use-policy"
                target="_blank"
                rel="noopener noreferrer"
              >
                terms
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ room }: { room: Room }) {
  if (room.status === "done") return <span className="badge"><Check /></span>;
  if (room.status === "failed") return <span className="badge failed"><Warn /></span>;
  if (room.status === "generating" || room.status === "queued")
    return <span className="badge pending"><Dots /></span>;
  return null;
}

/* ------------------------------------------------------- movement panel */

/** Push and Pull are opposites and Arc is lateral, so exactly one applies. */
const MOVE_ORDER: { id: MoveId; label: string; blurb: string }[] = [
  { id: "push", label: "Push", blurb: "Dolly in along the room's sightline." },
  { id: "arc", label: "Arc", blurb: "The room slides across frame. Lateral." },
  { id: "pull", label: "Pull", blurb: "Dolly out, revealing the room's breadth." },
];

export function MovePanel({
  room, onMove, fidelity, onFidelity, onShowPrompt, disabled, fidelityDisabled, demo,
}: {
  room: Room | null;
  onMove: (m: MoveId) => void;
  fidelity: boolean;
  onFidelity: (v: boolean) => void;
  onShowPrompt: () => void;
  /** Move rows: disabled on a demo clip, where changing them would be a lie. */
  disabled: boolean;
  /** Fidelity Lock stays live in demo mode — flipping it only changes the
      prompt the reveal shows, which is the whole point of the control. */
  fidelityDisabled: boolean;
  demo: boolean;
}) {
  const active: MoveId | null = room ? (room.move === "arc_rev" ? "arc" : room.move) : null;

  return (
    <div className="col">
      <div className="collabel"><span>Camera movement</span></div>
      <div className="col-scroll">
        {MOVE_ORDER.map((m) => {
          const on = active === m.id;
          return (
            <div key={m.id}>
              <button
                className={`moverow ${on ? "on" : "off"}`}
                disabled={disabled || !room}
                onClick={() => onMove(m.id)}
                title={m.blurb}
              >
                <span className="name">{m.label}</span>
                <span className={`toggle${on ? " on" : ""}`}><span className="knob" /></span>
              </button>

              {/* Direction is a COMPOSITION decision, not a style one: a sweep away
                  from the room's subject walks the camera onto a blank wall. */}
              {m.id === "arc" && on && room && (
                <div className="dirrow">
                  <button
                    className={room.move === "arc" ? "on" : ""}
                    disabled={disabled}
                    onClick={() => onMove("arc")}
                  >Right → Left</button>
                  <button
                    className={room.move === "arc_rev" ? "on" : ""}
                    disabled={disabled}
                    onClick={() => onMove("arc_rev")}
                  >Left → Right</button>
                </div>
              )}
            </div>
          );
        })}

        <div className={`fidelity${fidelity ? "" : " off"}`} style={{ marginTop: 12 }}>
          <div className="top">
            <span className="lockicon"><Lock /></span>
            <span className="name">Fidelity Lock</span>
            <span style={{ marginLeft: "auto" }}>
              <button
                className={`toggle${fidelity ? " on" : ""}`}
                disabled={fidelityDisabled}
                aria-label="Fidelity Lock"
                onClick={() => onFidelity(!fidelity)}
              ><span className="knob" /></button>
            </span>
          </div>
          <p>
            {fidelity
              ? "Generates only from provided footage. No furniture, light or fixture that is not in the photograph."
              : "OFF — the model may invent furniture, change the light, or restyle surfaces."}
          </p>
          <button className="reveal" onClick={onShowPrompt}>See the exact text</button>
        </div>

        <p className="hint">
          {demo
            ? "Demo clips are already generated, so the movement rows are fixed. Fidelity Lock still works — flip it and read the prompt."
            : "Each room generates one 10-second 1280×720 clip. Frame 0 is the photograph itself — that is the mechanic, not a claim."}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- bottom bar */

export function BottomBar({
  rooms, busy, onGenerate, onCancel, onPlayTour, onDownload, mode,
}: {
  rooms: Room[];
  busy: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  onPlayTour: () => void;
  onDownload: () => void;
  mode: "live" | "demo";
}) {
  const done = rooms.filter((r) => r.status === "done");
  const pending = rooms.filter((r) => r.status !== "done").length;
  // Clips run 10s each, but a move outruns a real room well before that, so the
  // honest number is the sum of what stays usable. Live clips are not measured
  // in-browser, so they count full length.
  const seconds = done.length * 10;

  return (
    <div className="bar">
      <button className="btn ghost" disabled={!done.length} onClick={onPlayTour}>
        Preview tour
      </button>
      <button className="btn ghost" disabled={!done.length} onClick={onDownload}>
        Download clips
      </button>

      <span className="spacer" />

      <span className="meta">
        Duration <b>{fmt(seconds)}</b>
        {done.length > 0 && <> · {done.length} of {rooms.length} rooms</>}
      </span>

      {busy ? (
        <button className="btn" onClick={onCancel}>Cancel</button>
      ) : (
        <button
          className="btn primary"
          // Demo is always clickable: pressing it is what loads the rooms in the
          // first place, so gating it on rooms.length locks the mode shut.
          disabled={mode === "demo" ? false : !rooms.length || pending === 0}
          onClick={onGenerate}
        >
          {mode === "demo"
            ? rooms.length ? "Reload demo tour" : "Load demo tour"
            : pending === 0 ? "All rooms generated" : "Generate video"}
        </button>
      )}
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}s`;
}
