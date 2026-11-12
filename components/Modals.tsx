import React from "react";
import { MODEL } from "../lib/omni";
import { buildPrompt } from "../lib/prompt";
import type { MoveId } from "../lib/prompt";
import { DEMO_CREDIT } from "../lib/demo";

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="scrim-full" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

/** Shows the operator the exact text being sent. No hidden prompt. */
export function PromptView({
  move, fidelity, onClose,
}: {
  move: MoveId;
  fidelity: boolean;
  onClose: () => void;
}) {
  return (
    <Shell onClose={onClose}>
      <h2>Prompt sent for this room</h2>
      <p>
        Fidelity Lock is <b>{fidelity ? "on" : "off"}</b>. The lock is not a flag — it
        adds and removes the three paragraphs that forbid inventing anything, so turning
        it off genuinely changes what the model is allowed to do.
      </p>
      <pre>{buildPrompt(move, fidelity)}</pre>
      <div className="row">
        <button className="btn" onClick={() => navigator.clipboard?.writeText(buildPrompt(move, fidelity))}>
          Copy
        </button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Shell>
  );
}

export function About({ onClose }: { onClose: () => void }) {
  return (
    <Shell onClose={onClose}>
      <h2>Listing Walk-in</h2>
      <p>
        Every listing already has photographs. Guests want to walk the space. This turns
        the photographs you already have into a moving tour — and adds nothing that is
        not in them.
      </p>
      <p>
        <b>How it works.</b> Each photo is cropped to exactly 1280×720 in this browser,
        then sent via the backend server proxy to <code>{MODEL}</code> with a camera-move
        direction. The model returns a 10-second clip whose <b>first frame is the photograph</b>.
        That pin is measurable: across roughly forty clips in testing it held at a mean
        absolute error of 2.0–3.7 out of 255, which reads as pixel-identical.
      </p>
      <p>
        <b>Fidelity Lock</b> is the three paragraphs that forbid adding, removing or
        restyling anything, and forbid changing the light. Turn it off and the model is
        free to invent. It is on by default.
      </p>
      <p>
        <b>4K upscaling is not part of this app.</b> It runs in a desktop pipeline
        (Real-ESRGAN) after the fact. It is not a Gemini capability and is not claimed
        as one here.
      </p>
      <p style={{ color: "#7c7871" }}>{DEMO_CREDIT}</p>
      <div className="row">
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Shell>
  );
}

export function UploadDisclaimer({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Shell onClose={onClose}>
      <h2>Disclaimer</h2>
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
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={onConfirm}>
          Agree & Continue
        </button>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Shell>
  );
}
