/**
 * The generation prompt, ported VERBATIM from probe/walk.py.
 *
 * These strings are the expensive part of this project. Every clause was paid
 * for in failed generations and measured with optical flow, so do not "tidy"
 * them:
 *
 *  - The one-way paragraph exists because clips reversed mid-shot -- retreating
 *    for four seconds and then pushing back in. Only optical flow caught it.
 *  - It says "further along its PATH", not "further from where it started",
 *    because an arc must never increase its distance from the opening framing.
 *    An earlier phrasing demanded exactly that and collapsed every arc into a
 *    push, 0 for 3.
 *  - The arc is written as what the VIEWER SEES, never as what the camera does.
 *    Rig language ("the camera crabs sideways on a curved track") scored 0/3
 *    and could not hold a direction. "The whole room slides across the frame"
 *    scored 3/3. Omni renders a description; it does not simulate a camera.
 */

/** Always sent: what the shot is, and that the plate is frame 0. */
const FRAME = `This is real estate videography of a room that already exists. The photograph provided is the opening frame of the shot; the camera starts exactly there and moves from there.`;

/**
 * Fidelity Lock. This block IS the product's promise -- "it adds no furniture
 * or details that don't exist" -- so the UI toggle genuinely adds and removes
 * these paragraphs rather than setting a flag that does nothing.
 */
const FIDELITY = `Everything visible in the shot is already present in the photograph. Do not add, remove, replace, restyle or rearrange any furniture, rug, artwork, plant, lamp, cushion, book, fixture, appliance, window, door, moulding or architectural feature. No new object enters the frame at any point. Surfaces keep their exact material, colour and pattern. The room's proportions and layout stay as photographed.

The light is unchanged: same time of day, same direction, same warmth, same shadows, same view through the windows.

Nothing in the room is animated. No people, no pets, no moving curtains, no flickering screens, no water, no fire.`;

/** Always sent: output hygiene. Nothing to do with fidelity, so never toggled. */
const CLEAN = `The frame stays clean and photographic: no text, no caption, no title, no label, no watermark, no logo, no interface element, no border, no letterboxing, no vignette added.`;

/** Always sent: one continuous, evenly-paced, one-way move. */
const CAMERA = `One continuous shot, held on a smooth motorised gimbal. No cut, no dissolve, no jump, no change of lens. The motion is slow, even and confident from the first frame to the last, the way an estate agent's tour moves. The camera covers about the same amount of ground in every second of the shot: it is already moving at its full steady pace in the opening frame, it never lurches or speeds up part way through, and it never eases off toward the end.

The camera travels in one single unbroken direction for the whole shot. It does not slow to a halt, does not hesitate, does not double back, does not return toward where it started, and does not end on the framing it began with. It moves further along its path with every second and never retraces any part of that path, so the final frame is the furthest the shot ever gets from the framing it opened on. It is a one-way journey, still under way when it ends.`;

export type MoveId = "push" | "arc" | "arc_rev" | "pull";

export const MOVES: Record<MoveId, string> = {
  push: `The camera pushes slowly forward into the room, travelling along the natural sightline of the space toward the brightest far side. Foreground furniture drifts past the edges of frame as the camera advances between it. The far wall and the window grow larger and the space opens up around the lens. The move is a straight, level dolly in -- no tilt, no pan, no rotation -- and it is still gliding forward when the shot ends.`,

  arc: `The whole room slides across the frame from right to left, at a steady pace, for the entire shot. Furniture that starts in the middle of frame ends up at the left edge and then leaves the frame altogether. Parts of the room that were outside the right edge of frame at the start come into view from the right as the shot goes on. Nothing in the frame grows larger or smaller as this happens -- everything simply travels leftward across the picture, near things sweeping past faster than far things.`,

  arc_rev: `The whole room slides across the frame from left to right, at a steady pace, for the entire shot. Furniture that starts in the middle of frame ends up at the right edge and then leaves the frame altogether. Parts of the room that were outside the left edge of frame at the start come into view from the left as the shot goes on. Nothing in the frame grows larger or smaller as this happens -- everything simply travels rightward across the picture, near things sweeping past faster than far things.`,

  pull: `The camera pulls slowly backward, retreating from the space so that more of the room enters the frame from every edge -- the near edge of the ceiling, the flanking walls, the foreground furniture the shot began inside. The move is a straight, level dolly out -- no tilt, no pan, no rotation -- revealing the room's full breadth, and it is still retreating when the shot ends.`,
};

/** Human-facing labels. `arc_rev` is a direction of `arc`, not a fourth button. */
export const MOVE_LABELS: Record<MoveId, string> = {
  push: "Push",
  arc: "Arc",
  arc_rev: "Arc",
  pull: "Pull",
};

export function buildPrompt(move: MoveId, fidelityLock: boolean): string {
  const blocks = [MOVES[move], FRAME];
  if (fidelityLock) blocks.push(FIDELITY);
  blocks.push(CLEAN, CAMERA);
  return blocks.join("\n\n");
}

/** Shown in the UI so the operator can read exactly what is being sent. */
export const FIDELITY_TEXT = FIDELITY;
