import React, { useCallback, useEffect, useRef, useState } from "react";
import { Back, Gear } from "./components/Icons";
import { RoomRail, MovePanel, BottomBar } from "./components/Panels";
import { Stage, type StageView } from "./components/Stage";
import { PromptView, About, UploadDisclaimer } from "./components/Modals";
import { makePlate, makeThumb, loadDemoPlate } from "./lib/plate";
import { generateClip, OmniError } from "./lib/omni";
import { buildPrompt, type MoveId } from "./lib/prompt";
import { DEMO_ROOMS } from "./lib/demo";
import type { Room } from "./types";

const MAX_ROOMS = 6;

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fidelity, setFidelity] = useState(true);
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [view, setView] = useState<StageView>("clip");
  const [tour, setTour] = useState<Room[] | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [busyNote, setBusyNote] = useState("");
  const abort = useRef<AbortController | null>(null);

  const [modal, setModal] = useState<null | "prompt" | "about" | "disclaimer">(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  const selected = rooms.find((r) => r.id === selectedId) ?? null;

  /* Object URLs are owned by us; a room removed or replaced must not leak one. */
  useEffect(() => {
    return () => {
      rooms.forEach((r) => {
        if (r.source === "generated" && r.clipUrl) URL.revokeObjectURL(r.clipUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((id: string, next: Partial<Room>) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, []);

  /* ------------------------------------------------------------- uploads */

  const processFiles = useCallback(async (fileList: File[]) => {
    if (!fileList.length) return;
    setBusy(true);
    setBusyLabel("Preparing plates");
    setBusyNote("Cropping to 1280×720 so frame 0 can be pinned exactly.");
    try {
      const made: Room[] = [];
      for (const file of fileList.slice(0, MAX_ROOMS - rooms.length)) {
        const plate = await makePlate(file);
        made.push({
          id: `${Date.now()}-${made.length}-${Math.round(performance.now())}`,
          name: prettyName(file.name),
          plate,
          thumb: await makeThumb(plate),
          move: "push",
          status: "ready",
        });
      }
      setRooms((prev) => [...prev, ...made]);
      setSelectedId((cur) => cur ?? made[0]?.id ?? null);
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Could not read those images.");
    } finally {
      setBusy(false);
      setBusyNote("");
    }
  }, [rooms.length]);

  const addFiles = useCallback((files: FileList) => {
    const room = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!room.length) return;
    setPendingFiles(room);
    setModal("disclaimer");
  }, []);

  const confirmUpload = useCallback(() => {
    if (pendingFiles) {
      const filesToProcess = pendingFiles;
      setPendingFiles(null);
      setModal(null);
      processFiles(filesToProcess);
    }
  }, [pendingFiles, processFiles]);

  const cancelUpload = useCallback(() => {
    setPendingFiles(null);
    setModal(null);
  }, []);

  const removeRoom = useCallback((id: string) => {
    setRooms((prev) => {
      const gone = prev.find((r) => r.id === id);
      if (gone?.source === "generated" && gone.clipUrl) URL.revokeObjectURL(gone.clipUrl);
      return prev.filter((r) => r.id !== id);
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  /* ---------------------------------------------------------------- demo */

  const loadDemo = useCallback(async () => {
    setBusy(true);
    setBusyLabel("Loading demo home");
    setBusyNote("Five rooms of one Ottawa renovation, already generated.");
    try {
      const made: Room[] = [];
      for (const d of DEMO_ROOMS) {
        const plate = await loadDemoPlate(d.plate);
        made.push({
          id: d.id,
          name: d.name,
          plate,
          thumb: await makeThumb(plate),
          move: d.move,
          status: "done",
          clipUrl: d.clip,
          source: "demo",
          note: d.note,
        });
      }
      setRooms(made);
      setSelectedId(made[0].id);
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Could not load the demo home.");
    } finally {
      setBusy(false);
      setBusyNote("");
    }
  }, []);

  /* ---------------------------------------------------------- generation */

  const generate = useCallback(async () => {
    if (mode === "demo") { await loadDemo(); return; }

    const queue = rooms.filter((r) => r.status !== "done");
    if (!queue.length) return;

    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setTour(null);
    setRooms((prev) => prev.map((r) => (r.status !== "done" ? { ...r, status: "queued", error: undefined, note: undefined } : r)));

    try {
      for (let i = 0; i < queue.length; i++) {
        if (controller.signal.aborted) break;
        const room = queue[i];
        setSelectedId(room.id);
        patch(room.id, { status: "generating", note: undefined });
        setBusyLabel(`Generating ${room.name} — ${i + 1} of ${queue.length}`);
        setBusyNote("One 10-second clip, about 40 seconds. Frame 0 will be the photograph.");

        try {
          const out = await generateClip({
            plateDataUrl: room.plate.dataUrl,
            prompt: buildPrompt(room.move, fidelity),
            signal: controller.signal,
            onRetry: (attempt, wait, reason) => {
              setBusyNote(`${reason} — retrying in ${wait}s (attempt ${attempt} of 2). Video calls time out under load.`);
              patch(room.id, { note: `retrying after ${reason}` });
            },
          });
          patch(room.id, {
            status: "done",
            clipUrl: out.url,
            clipBlob: out.blob,
            genSeconds: out.seconds,
            source: "generated",
            note: undefined,
          });
        } catch (err) {
          if (controller.signal.aborted) { patch(room.id, { status: "ready" }); break; }
          const msg = err instanceof OmniError ? err.message
            : err instanceof Error ? err.message : String(err);
          patch(room.id, { status: "failed", error: msg });
        }
      }
    } finally {
      abort.current = null;
      setBusy(false);
      setBusyNote("");
      setRooms((prev) => prev.map((r) => (r.status === "queued" ? { ...r, status: "ready" } : r)));
    }
  }, [fidelity, loadDemo, mode, patch, rooms]);

  const cancel = useCallback(() => abort.current?.abort(), []);

  /* -------------------------------------------------------------- output */

  const done = rooms.filter((r) => r.status === "done");

  const downloadClips = useCallback(async () => {
    for (const r of done) {
      const a = document.createElement("a");
      a.href = r.clipUrl!;
      a.download = `${slug(r.name)}_${r.move}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((res) => setTimeout(res, 350)); // browsers throttle bursts
    }
  }, [done]);

  /* --------------------------------------------------------------- render */

  return (
    <div className="app">
      <header className="hdr">
        <span className="icon"><Back /></span>
        <div className="mode-pill">
          <button className={mode === "live" ? "on" : ""} onClick={() => setMode("live")}>Live</button>
          <button className={mode === "demo" ? "on" : ""} onClick={() => setMode("demo")}>Demo</button>
        </div>
        <h1>AI Property Video Generator</h1>
        <span style={{ fontSize: 11, color: "#7d7873", whiteSpace: "nowrap" }}>
          {mode === "demo" ? "Pre-generated" : "Server API"}
        </span>
        <button className="icon" onClick={() => setModal("about")} aria-label="About"><Gear /></button>
      </header>

      <div className="work">
        <RoomRail
          rooms={rooms}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setTour(null); }}
          onAdd={addFiles}
          onRemove={removeRoom}
          busy={busy}
          max={MAX_ROOMS}
        />

        <Stage
          room={selected}
          view={view}
          onView={setView}
          busy={busy}
          busyLabel={busyLabel}
          busyNote={busyNote}
          tour={tour}
          onTourEnd={() => setTour(null)}
        />

        <MovePanel
          room={selected}
          disabled={busy || selected?.source === "demo"}
          fidelityDisabled={busy}
          demo={selected?.source === "demo"}
          onMove={(m: MoveId) => selected && patch(selected.id, {
            move: m,
            // Changing the move invalidates the clip that proved the old one.
            ...(selected.status === "done" && selected.source === "generated"
              ? { status: "ready", clipUrl: undefined, clipBlob: undefined }
              : {}),
          })}
          fidelity={fidelity}
          onFidelity={setFidelity}
          onShowPrompt={() => setModal("prompt")}
        />
      </div>

      <BottomBar
        rooms={rooms}
        busy={busy}
        mode={mode}
        onGenerate={generate}
        onCancel={cancel}
        onPlayTour={() => { setTour(done); setView("clip"); }}
        onDownload={downloadClips}
      />

      {modal === "prompt" && (
        <PromptView move={selected?.move ?? "push"} fidelity={fidelity} onClose={() => setModal(null)} />
      )}
      {modal === "about" && (
        <About onClose={() => setModal(null)} />
      )}
      {modal === "disclaimer" && (
        <UploadDisclaimer onConfirm={confirmUpload} onClose={cancelUpload} />
      )}
    </div>
  );
}

function prettyName(filename: string) {
  const stem = filename
    .replace(/\.[^.]+$/, "")
    // listing exports are usually numbered (2_living.jpg, 01-kitchen.png); the
    // index is a sort key, not part of the room's name.
    .replace(/^\d+[\s._-]+/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return stem.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40) || "Room";
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
