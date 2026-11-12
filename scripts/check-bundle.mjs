#!/usr/bin/env node
/**
 * Post-build credential scan.
 *
 * Runs after every `npm run build` and fails the build if the output contains
 * anything key-shaped that was not explicitly opted into with EMBED_API_KEY=1.
 * The first build of this app silently baked a real GEMINI_API_KEY out of the
 * ambient shell; a build that can leak a credential without saying so is worth
 * one grep.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;

/** Google API keys, OAuth-ish blobs, and the private-key header. */
const PATTERNS = [
  { name: "Google API key", re: /\bAIza[A-Za-z0-9_\-]{30,}\b/g },
  { name: "Google OAuth token", re: /\bAQ\.[A-Za-z0-9_\-]{20,}\b/g },
  { name: "PEM private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "Bearer secret", re: /\bya29\.[A-Za-z0-9_\-]{20,}\b/g },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|css|html|json|map)$/.test(entry)) out.push(p);
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error("check-bundle: no dist/ to scan — run the build first.");
  process.exit(1);
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const { name, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits.push({ file: file.replace(DIST, ""), name, sample: `${m[0].slice(0, 6)}…${m[0].slice(-4)}` });
    }
  }
}

if (!hits.length) {
  console.log(`check-bundle: ${files.length} files scanned, no credentials in the bundle.`);
  process.exit(0);
}

console.error(`\ncheck-bundle: FAILED — ${hits.length} credential(s) in the built bundle:\n`);
for (const h of hits) console.error(`  ${h.file}: ${h.name} ${h.sample}`);
console.error(
  "\nThese are readable by anyone who opens the page. Credentials must remain strictly on the backend.\n",
);
process.exit(1);
