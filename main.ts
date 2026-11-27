// Skyline Courier — a complete flight game for make.fun
// (best-flight-game-20261126-0057).
//
// main.ts (Node 22, standard library only) hands the entry in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json with buildDossier from vendor/makefun-game.ts.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
// The grader mounts the repo read-only and gives us one writable directory.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// Pre-flight: fail fast with a clear message when an input the hand-in
// needs is missing beside this file, instead of copying a partial entry
// and letting buildDossier fail later on an empty output directory.
// (Round 1 was rejected exactly this way: the submitted repo had no
// screenshots/ directory, so the hand-in died inside buildDossier.)
function requireInputDir(dir: string, label: string): void {
  if (!existsSync(dir)) {
    throw new Error(`${label} is missing beside main.ts (expected ${dir})`);
  }
  if (!statSync(dir).isDirectory()) {
    throw new Error(`${label} is not a directory (found ${dir})`);
  }
}

// This program writes only under `out`: every destination below is built
// from it, and any failure is reported without writing anywhere else.
try {
  requireInputDir(join(here, 'game'), 'game/');
  requireInputDir(join(here, 'screenshots'), 'screenshots/');

  // The entry hands in 3 or 4 renders of its game (the first by name the
  // cover); check the count up front so a short or over-full screenshots/
  // fails here with the input named, not inside buildDossier.
  const shotNames = readdirSync(join(here, 'screenshots'))
    .filter((name) => /\.(png|jpe?g)$/i.test(name));
  if (shotNames.length < 3 || shotNames.length > 4) {
    throw new Error(
      `screenshots/ holds ${shotNames.length} image file(s), expected 3 or 4: ${shotNames.join(', ') || '(none)'}`,
    );
  }

  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }

  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, {
      text_max_bytes: 163840,
      screenshots: { max: 4, max_bytes: 262144 },
      game_max_files: 993,
      game_max_bytes: 50331648,
      game_path_max_bytes: 1000,
    }),
  );
} catch (err) {
  console.error('Skyline Courier hand-in failed:', err);
  process.exit(1);
}
