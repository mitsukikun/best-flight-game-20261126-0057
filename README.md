# Skyline Courier — Make the best flight game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![make.fun · rank](https://make.fun/badge/best-flight-game-20261126-0057/mitsukikun/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![make.fun · reward](https://make.fun/badge/best-flight-game-20261126-0057/mitsukikun/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete, original flight game that plays offline in a desktop browser from
static files — no network requests, no build step. Open `game/index.html` and
fly.

## The game

You are the pilot of SK-01, a little red courier plane flying out of a valley
airfield. Three missions, one plane, one fuel gauge:

1. **Training Circuit** — take off from Runway 36, thread 5 rings, land back
   on the runway.
2. **Canyon River Run** — six rings low down the river canyon. Stay under
   150 m for a low-flying bonus, but the walls bite.
3. **Island Cargo Hop** — carry a crate to the island strip on a short fuel
   load. Three guide rings, then a short-field landing.

Flying rewards throttle and turn discipline: banked turns bleed speed, full
throttle burns fuel fast, and a hard or fast touchdown is a crash. Landings
are scored on the runway with time, fuel and low-flying bonuses.

## Controls

| Input | Action |
| --- | --- |
| W / S (or Shift / Ctrl) | Throttle up / down |
| ↑ / ↓ | Pitch (climb / descend) |
| ← / → | Bank (turn) |
| Mouse drag | Yoke — steer by dragging |
| Space | Airbrake |
| 1 / 2 / 3 | Switch mission |
| R | Restart the mission |
| M | Mission menu |
| Click a mission | Start it |

## What you see

- Chase view over a procedural valley: patchwork fields, a winding river,
  a lake, and a mountain ridge on the horizon.
- The aircraft in frame, banking with every turn, with its canopy lit.
- A runway or a glowing target ring ahead, with a waypoint arrow and
  distance on the HUD.
- Instruments: altitude, speed, vertical speed, heading compass, artificial
  horizon, throttle / fuel / damage gauges, score and timer.
- Synthesised engine hum, wind, ring chimes and landing thuds (Web Audio —
  no audio files).

## Files

- `game/index.html` — the page; everything it loads lives under `game/`
- `game/src/main.js` — game loop, states, screenshot staging (`?shot=N`)
- `game/src/flight.js` — flight model (lift, stall, drag, fuel, damage)
- `game/src/terrain.js` — heightfield, runway, river, ring courses
- `game/src/render.js` — software 3D renderer, sky, clouds, aircraft
- `game/src/hud.js` — HUD, instruments, menus, results
- `game/src/missions.js` — the three sorties and their scoring
- `game/src/audio.js` — synthesised sound (Web Audio only)
- `game/src/input.js` — keyboard + mouse yoke
- `game/src/util.js` — math and deterministic noise
- `main.ts` — hands the entry in (copies `game/` + `screenshots/` to
  `/output`, writes `dossier.json` via `buildDossier`)
- `vendor/makefun-game.ts` — make.fun's library, copied unchanged from the kit

## Play it

Serve `game/` with any static server, e.g. `node serve.ts`, or just open
`game/index.html` in desktop Chrome. Screenshots in `screenshots/` are real
renders of this code, taken with headless Chromium (`?shot=1` … `?shot=4`).

## License

MIT — see `LICENSE`.
