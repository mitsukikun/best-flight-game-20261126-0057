// Missions: three sorties with different goals, scoring and fuel/damage
// decisions. Each mission is a small state machine over the flight model.
import { ISLAND_STRIP, RING_COURSES, RUNWAY } from './terrain.js';
import { bearingTo } from './flight.js';

export const MISSIONS = [
  {
    id: 'training',
    name: '1 · Training Circuit',
    short: 'Training Circuit',
    brief: 'Take off from Runway 36, fly through all 5 rings, then land back on the runway. Gentle turns save fuel.',
    rings: RING_COURSES.training,
    target: { x: RUNWAY.x, z: RUNWAY.touchdownZ, label: 'Runway 36' },
    parTime: 240,
    fuelStart: 100,
  },
  {
    id: 'canyon',
    name: '2 · Canyon River Run',
    short: 'Canyon River Run',
    brief: 'Six rings down the river canyon, low and fast. Stay under 150 m for the bonus — but the canyon walls bite.',
    rings: RING_COURSES.canyon,
    target: { x: 1900, z: 4300, label: 'Canyon Exit' },
    parTime: 210,
    fuelStart: 100,
    lowBonus: true,
  },
  {
    id: 'island',
    name: '3 · Island Cargo Hop',
    short: 'Island Cargo Hop',
    brief: 'Carry the cargo crate to the island strip. Three guide rings, then a short-field landing. Watch the fuel gauge.',
    rings: RING_COURSES.island,
    target: { x: ISLAND_STRIP.x, z: ISLAND_STRIP.z, label: 'Island Strip' },
    parTime: 300,
    fuelStart: 78,
    cargo: true,
  },
];

/** Fresh mission progress. */
export function createMissionState(mission) {
  return {
    mission,
    ringIndex: 0,
    ringsHit: 0,
    ringsTotal: mission.rings.length,
    time: 0,
    score: 0,
    lowTime: 0,
    done: false,
    result: null, // 'success' | 'crashed' | 'out-of-fuel'
    message: mission.brief,
    messageTime: 0,
  };
}

export function setMessage(ms, text, seconds = 4) {
  ms.message = text;
  ms.messageTime = seconds;
}

/**
 * Advance mission logic one step. Returns 'ring' when a ring is flown
 * through, 'complete' when the mission is finished.
 */
export function stepMission(ms, plane, dt) {
  if (ms.done) return null;
  ms.time += dt;
  if (ms.messageTime > 0) ms.messageTime -= dt;
  const m = ms.mission;

  // Low-altitude bonus timer for the canyon run.
  if (m.lowBonus && !plane.onGround && plane.y < 150) ms.lowTime += dt;

  // Ring checks.
  if (ms.ringIndex < m.rings.length) {
    const ring = m.rings[ms.ringIndex];
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ring.r) {
      ms.ringIndex += 1;
      ms.ringsHit += 1;
      ms.score += 500;
      if (ms.ringIndex < m.rings.length) {
        setMessage(ms, `Ring ${ms.ringsHit}/${ms.ringsTotal} — nice flying! Next ring ahead.`);
      } else {
        setMessage(ms, 'All rings clear! Now land at ' + m.target.label + '.');
      }
      return 'ring';
    }
  }

  // Landing check: on the ground, slow, near the target strip.
  if (ms.ringIndex >= m.rings.length && plane.onGround && plane.speed < 18) {
    const b = bearingTo(plane, m.target.x, m.target.z);
    if (b.dist < 320) {
      ms.done = true;
      ms.result = 'success';
      const timeBonus = Math.max(0, Math.round((m.parTime - ms.time) * 5));
      const lowBonus = Math.round(ms.lowTime * 4);
      const fuelBonus = Math.round(plane.fuel * 6);
      ms.score += timeBonus + lowBonus + fuelBonus;
      setMessage(ms, `LANDED! Time bonus ${timeBonus} · fuel bonus ${fuelBonus}` +
        (lowBonus ? ` · low-flying bonus ${lowBonus}` : '') + ` — score ${ms.score}.`, 8);
      return 'complete';
    }
  }

  // Out of fuel while airborne with no thrust left.
  if (plane.fuel <= 0 && !plane.onGround && plane.speed < 12 && plane.y < 40) {
    ms.done = true;
    ms.result = 'out-of-fuel';
    setMessage(ms, 'Out of fuel — forced landing. The crate is safe, the pride is not.', 8);
    return 'complete';
  }

  // Crash ends the mission.
  if (plane.crashed) {
    ms.done = true;
    ms.result = 'crashed';
    setMessage(ms, 'CRASHED. The courier walks home. Press R to try again.', 8);
    return 'complete';
  }
  return null;
}

/** Next waypoint for the HUD arrow: current ring, else the landing target. */
export function currentWaypoint(ms) {
  const m = ms.mission;
  if (ms.ringIndex < m.rings.length) {
    const r = m.rings[ms.ringIndex];
    return { x: r.x, z: r.z, y: r.y, label: 'RING ' + (ms.ringIndex + 1) };
  }
  return { x: m.target.x, z: m.target.z, y: 0, label: m.target.label };
}
