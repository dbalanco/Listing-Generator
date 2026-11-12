/**
 * Demo mode.
 *
 * Every clip here is real `omni` output generated from the plate sitting next
 * to it -- not a stand-in, not a stock tour. That matters: the app's central
 * claim is that frame 0 of the clip IS the listing photo, and in demo mode you
 * can still check it, because the plate we shipped is the exact image the clip
 * was generated from. Measured pin MAE on these five: 2.0-3.7 (EXACT).
 *
 * Demo mode exists so the interface can be shown on bad wifi, with no key, and
 * without spending 40 seconds per room in front of an audience. It is labelled
 * in the UI; it never pretends a cached clip was generated just now.
 */
import type { MoveId } from "./prompt";

export interface DemoRoom {
  id: string;
  name: string;
  plate: string;
  clip: string;
  move: MoveId;
  /** Seconds of the clip that stay usable before the move runs out of room. */
  usable: number;
  note: string;
}

const base = import.meta.env.BASE_URL ?? "/";

export const DEMO_ROOMS: DemoRoom[] = [
  {
    id: "living",
    name: "Living Room",
    plate: `${base}plates/2_living.jpg`,
    clip: `${base}demo/2_living.mp4`,
    move: "push",
    usable: 5.55,
    note: "Dollies in along the sightline toward the windows; gets denser as it travels.",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    plate: `${base}plates/3_kitchen.jpg`,
    clip: `${base}demo/3_kitchen.mp4`,
    move: "push",
    usable: 4.55,
    note: "Travels through the kitchen into the living room — shows the open plan, and that it is one house.",
  },
  {
    id: "bedroom",
    name: "Master Bedroom",
    plate: `${base}plates/4_bedroom.jpg`,
    clip: `${base}demo/4_bedroom.mp4`,
    move: "arc",
    usable: 3.35,
    note: "The only lateral move. Short by nature — a sweep outruns a real room in about four seconds.",
  },
  {
    id: "bathroom",
    name: "Bathroom",
    plate: `${base}plates/5_bathroom.jpg`,
    clip: `${base}demo/5_bathroom.mp4`,
    move: "push",
    usable: 4.95,
    note: "Pushes toward the tub and window.",
  },
  {
    id: "foyer",
    name: "Foyer",
    plate: `${base}plates/1_foyer.jpg`,
    clip: `${base}demo/1_foyer.mp4`,
    move: "push",
    usable: 5.0,
    note: "The reverse angle of the living-room hero — the same house from the other end.",
  },
];

/** Photography credit for the bundled rooms. */
export const DEMO_CREDIT =
  "One Ottawa renovation, photographed by Point3D Commercial Imaging Ltd. (Unsplash License).";
