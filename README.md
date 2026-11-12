# Listing Walk-in — AI Studio app

The working version of the product both films depict. Drop the listing photos a
property already has, choose a camera move per room, press Generate, and each
photo becomes the **exact first frame** of a ten-second clip that walks the space.

**NDA: client work for R/GA via Addition.ml. Do not publish without approval** —
not to the portfolio, Substack, or YouTube.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ + a credential scan (see "Keys" below)
```

No key is needed to try it: switch the header to **Demo** and the whole interface
runs against five clips that are already generated. Live generation needs a
Gemini API key, entered in the app (gear → API key) and kept in `localStorage`.

## What it actually does

1. **Plate.** Each uploaded photo is centre-cropped to exactly 1280×720 *in the
   browser*, before anything is sent. This is not cosmetic. Omni renders 1280×720
   hard; hand it a 3:2 photo and it decides the reframing itself, invisibly, and
   the frame-0 pin becomes unmeasurable. Crop first and a correct pin is
   pixel-identical, so any drift afterwards is real drift.
2. **Prompt.** A camera-move block, plus Fidelity Lock, plus the camera-continuity
   rules. `lib/prompt.ts` carries the text verbatim from `probe/walk.py` — see the
   comments there for why each clause exists; several were paid for in failed
   generations.
3. **Generate.** One `POST /v1beta/interactions` per room, straight from the
   browser. About 40 seconds each. Video returns inline as base64 in the response,
   not as a handle to poll.
4. **Check.** "Compare to source" splits the canvas: the clip on the left, the
   untouched photograph on the right. At the first frame the seam is invisible.

## Model

`models/gemini-omni-1.1-flash` — **public**, deliberately.

The films were prototyped on `models/omni-1.2-eap`, which has since been withdrawn
from the key entirely (`404 Model not found`, verified 2026-08-24). An AI Studio
app runs on whatever key the environment injects, and injected keys generally
cannot see confidential codenames, so an EAP model was never a safe foundation
here. Measured on the public model with this project's own plate and prompt:
**10.0s / 1280×720 / 24fps, frame-0 pin MAE 3.11 (EXACT), 0 cuts** — the same band
the EAP build held across ~40 clips.

## Keys — read this before building

`loadEnv(mode, cwd, "")` with an **empty prefix reads the ambient shell**, not just
`.env` files. Anyone with `GEMINI_API_KEY` exported — i.e. anyone who uses the
Gemini CLI — compiles their personal key into the client bundle just by running
`npm run build`. It is a plain string in a public JS file. This happened on the
first build of this app and was caught only by grepping `dist`.

So:

- Embedding is **off** unless you set `EMBED_API_KEY=1`.
- `npm run build` runs `scripts/check-bundle.mjs` afterwards and **fails** on
  anything key-shaped that was not opted into.
- Without an embedded key the app asks the operator for one and keeps it in
  `localStorage`. That is the normal path.

```bash
npm run build                    # safe: no key in dist, scan enforces it
EMBED_API_KEY=1 npm run build    # AI Studio deploy: embeds, warns loudly
```

## The key must come from a project with the Interactions API

**The endpoint and the model are two separate permissions.** A Gemini key from a
project without the Interactions allowlist authenticates fine, lists
`gemini-omni-1.1-flash` fine, and then fails the first real call with a bare
`404 Requested entity was not found`. The model being public does not mean any
key can generate video.

Read the status code — a bad key **never** produces a 404, so a 404 is never a
key typo:

| Response | Means |
|---|---|
| `400 API key not valid` | key does not exist |
| `401 invalid authentication credentials` | key malformed or truncated |
| `404 Model 'x' not found. Did you mean…` | bad model *name* |
| `404 Requested entity was not found.` | valid key, **project lacks the API surface** |

Gear → **API key** → **Test key** distinguishes all of these. It probes the
interactions endpoint, not just `models.list`, because a key that lists the model
but cannot reach the endpoint would otherwise get a green tick.

## Deploying to AI Studio

`npm run build`, then upload `listing-walkin-aistudio.zip` (built by
`../tools/package_aistudio.sh`). AI Studio runs a Node buildpack and injects its
own key into the environment.

**Do not count on that injected key working.** It will almost certainly be a
general AI Studio key, whose project lacks the Interactions allowlist — so the
deployed app will list the model and then 404 on Generate. Ship it
bring-your-own-key: leave `EMBED_API_KEY` unset, let the operator paste a key
from a project that has the surface, and lean on Demo mode for anyone who does
not have one.

The whole app is client-side — the Interactions endpoint sends
`access-control-allow-origin` for browser origins and takes the key in
`x-goog-api-key`, so there is no server, no job store, and nothing to lose on
scale-to-zero.

## What is deliberately NOT here

- **4K upscaling.** It runs in a desktop pipeline (Real-ESRGAN), after the fact.
  It is not a Gemini capability, is not available in a browser, and is not claimed
  here. See the About panel.
- **A stitched single-file tour.** "Preview tour" plays the clips back to back;
  "Download clips" gives you the individual mp4s. Concatenating in-browser needs
  ffmpeg.wasm, which is a large dependency for something `ffmpeg` does in a second
  on the desktop.
- **Automatic tail-trimming.** A lateral move outruns a real room in about four
  seconds, so the back half of an arc clip is often unusable. The desktop pipeline
  measures this (`probe/content.py`); the app hands you the full ten seconds.

## Layout

```
lib/prompt.ts     the generation prompt, verbatim from probe/walk.py
lib/omni.ts       Interactions API client: retry on 5xx only, errors surface the body
lib/plate.ts      client-side 1280x720 crop, port of probe/plate.py
lib/demo.ts       the five pre-generated rooms
components/       Stage (canvas + compare + tour), Panels (rail, moves, bar), Modals
scripts/          post-build credential scan
public/demo/      five real omni clips, ~5.8 MB
public/plates/    the exact source photographs those clips were generated from
qa/               screenshots from the browser QA runs
```

## QA

Run from the parent project (which has Playwright):

```bash
npm run preview -- --port 4178        # in aistudio/
node ../tools/qa_app.mjs              # demo mode, compare, prompt, tour, key gate, narrow
node ../tools/qa_sizes.mjs            # canvas fits at three window heights
node ../tools/qa_live.mjs             # ONE REAL GENERATION through the UI (~40s, costs tokens)
```

`qa_app.mjs` asserts the thing most worth asserting: that Fidelity Lock genuinely
changes the prompt (2396 → 1760 characters), that the fidelity paragraph is present
when on and absent when off, and that the camera-continuity rules survive both —
turning the lock off must not also switch off the one-way camera rule.
