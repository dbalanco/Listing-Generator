import React, { useEffect, useRef, useState } from "react";
import type { Room } from "../types";
import { MOVE_LABELS } from "../lib/prompt";

export type StageView = "clip" | "compare";

/**
 * The hero canvas.
 *
 * Three states: the plate on its own (nothing generated yet), the clip, and the
 * comparison — generated frame on the left, untouched source photograph on the
 * right. The comparison is the whole argument of the product, so it is a first
 * class view rather than a hidden toggle.
 */
export function Stage({
  room, view, onView, busy, busyLabel, busyNote, tour, onTourEnd,
}: {
  room: Room | null;
  view: StageView;
  onView: (v: StageView) => void;
  busy: boolean;
  busyLabel: string;
  busyNote: string;
  /** When set, the canvas plays this list back to back instead of one room. */
  tour: Room[] | null;
  onTourEnd: () => void;
}) {
  const [tourIndex, setTourIndex] = useState(0);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => { setTourIndex(0); }, [tour]);

  // A tour is sequential playback, not a stitched file: advance on `ended`.
  useEffect(() => {
    if (!tour || !video.current) return;
    const v = video.current;
    v.play().catch(() => { /* autoplay refusal is not fatal; the control is there */ });
  }, [tour, tourIndex]);

  const playing = tour ? tour[tourIndex] : room;
  const showClip = playing?.clipUrl && (tour || view === "clip");

  return (
    <div className="stagewrap">
      <div className="collabel">
        <span>Hero canvas</span>
        {room?.status === "done" && !tour && (
          <span>
            <button
              className="reveal"
              style={{ textTransform: "uppercase", letterSpacing: ".08em", fontSize: 10, fontWeight: 600 }}
              onClick={() => onView(view === "clip" ? "compare" : "clip")}
            >
              {view === "clip" ? "Compare to source" : "Show clip"}
            </button>
          </span>
        )}
      </div>

      <div className="canvasbox">
      <div className="canvas">
        {!room && !tour && (
          <div className="empty">
            <div>No rooms yet.</div>
            <div style={{ fontSize: 11.5, color: "#7d7972" }}>
              Drop listing photos on the left, or switch to Demo to load a finished home.
            </div>
          </div>
        )}

        {playing && !showClip && view !== "compare" && (
          <img src={playing.plate.dataUrl} alt={playing.name} />
        )}

        {playing && showClip && (
          <video
            ref={video}
            key={playing.clipUrl}
            src={playing.clipUrl}
            muted
            playsInline
            autoPlay
            loop={!tour}
            controls={!tour}
            onEnded={() => {
              if (!tour) return;
              if (tourIndex + 1 < tour.length) setTourIndex(tourIndex + 1);
              else onTourEnd();
            }}
          />
        )}

        {playing && !tour && view === "compare" && (
          <div className="split">
            <div>
              <span className="tag" style={{ left: 9 }}>Generated</span>
              {playing.clipUrl ? (
                <video src={playing.clipUrl} muted playsInline autoPlay loop
                       style={{ width: "200%", height: "100%", objectFit: "cover" }} />
              ) : (
                <img src={playing.plate.dataUrl} alt=""
                     style={{ width: "200%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div>
              <span className="tag" style={{ right: 9 }}>Source photo</span>
              <img src={playing.plate.dataUrl} alt=""
                   style={{ width: "200%", height: "100%", objectFit: "cover",
                            marginLeft: "-100%" }} />
            </div>
            <span className="divider" />
          </div>
        )}

        {playing && !busy && (
          <>
            <span className="corner l">{playing.name}</span>
            <span className="corner r">
              {tour
                ? `${tourIndex + 1} / ${tour.length}`
                : playing.status === "done"
                  ? `Moving — ${MOVE_LABELS[playing.move]}`
                  : "Still"}
            </span>
          </>
        )}

        {busy && (
          <div className="busy">
            <span className="spinner" />
            <span className="big">{busyLabel}</span>
            {busyNote && <span className="sub">{busyNote}</span>}
          </div>
        )}
      </div>
      </div>

      {!tour && view === "compare" && room && (
        <p className="splitnote">
          Same frame, split down the middle: the clip on the left, the untouched
          photograph on the right. At the first frame the seam is invisible — that is
          the pin. It opens as the camera travels, and nothing crosses it that was not
          already in the room.
        </p>
      )}

      <StageMeta room={tour ? null : room} />
    </div>
  );
}

function StageMeta({ room }: { room: Room | null }) {
  if (!room) return <div className="stagemeta" />;
  return (
    <div className="stagemeta">
      <span><span className="k">Plate</span> 1280×720{room.plate.cropped &&
        <span className="k"> (cropped from {room.plate.sourceW}×{room.plate.sourceH})</span>}</span>
      <span><span className="k">Move</span> {MOVE_LABELS[room.move]}
        {room.move === "arc_rev" ? " (L→R)" : room.move === "arc" ? " (R→L)" : ""}</span>
      {room.status === "done" && (
        <span>
          <span className="k">Output</span> 10.0s · 1280×720 · 24fps
          {room.source === "demo"
            ? <span className="k"> · pre-generated</span>
            : room.genSeconds ? <span className="k"> · took {room.genSeconds.toFixed(0)}s</span> : null}
        </span>
      )}
      {room.error && <span className="err">{room.error}</span>}
      {room.note && !room.error && <span className="k">{room.note}</span>}
    </div>
  );
}
