// Terrain of the Skyline Courier valley: heightfield, runway, river,
// fields and the ring courses. All coordinates are metres; y is up.
// The home airfield sits at the origin, runway along +Z (heading 000).
import { clamp, fbm2, lerp, smoothstep } from './util.js';

export const RUNWAY = {
  // Centre of the home runway strip.
  x: 0,
  z: 0,
  headingDeg: 0,
  length: 900,
  width: 46,
  // Touchdown zone centre (where a landing is scored).
  touchdownZ: 120,
};

// Island strip for the cargo mission, 4.2 km north-east of home.
export const ISLAND_STRIP = {
  x: 2600,
  z: 3400,
  headingDeg: 35,
  length: 620,
  width: 38,
  touchdownZ: 0,
};

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/** Distance from a point to the home runway centreline (metres). */
export function distToRunway(x, z) {
  const half = RUNWAY.length / 2;
  return distToSegment(x, z, RUNWAY.x, RUNWAY.z - half, RUNWAY.x, RUNWAY.z + half);
}

export function distToIslandStrip(x, z) {
  const half = ISLAND_STRIP.length / 2;
  const rad = (ISLAND_STRIP.headingDeg * Math.PI) / 180;
  const sx = Math.sin(rad);
  const sz = Math.cos(rad);
  return distToSegment(
    x, z,
    ISLAND_STRIP.x - sx * half, ISLAND_STRIP.z - sz * half,
    ISLAND_STRIP.x + sx * half, ISLAND_STRIP.z + sz * half,
  );
}

/**
 * Ground height in metres at (x, z).
 * A flat valley floor around the home runway, rising hills and a
 * mountain ridge to the north-west, a river winding through the east,
 * and a low island plateau at the cargo strip.
 */
export function groundHeight(x, z) {
  // Base rolling hills.
  let h = fbm2(x * 0.00045, z * 0.00045) * 90 + 26;
  // Mountain ridge far to the north-west.
  const ridge = smoothstep(((-x - z * 0.6) - 1200) / 1800);
  h += ridge * (260 + fbm2(x * 0.0011 + 40, z * 0.0011) * 120);
  // Gentle hills to the south-east.
  const se = smoothstep(((x + z * 0.4) - 1500) / 2000);
  h += se * 70;
  // River valley carving through the east (x ~ 1400).
  const riverD = Math.abs(x - (1400 + Math.sin(z * 0.0006) * 260));
  h -= Math.max(0, 1 - riverD / 260) * 34;
  // Flatten the home airfield.
  const flat = 1 - smoothstep((distToRunway(x, z) - 90) / 320);
  h = lerp(h, 4, flat);
  // Flatten the island strip plateau.
  const flatI = 1 - smoothstep((distToIslandStrip(x, z) - 70) / 260);
  h = lerp(h, 18, flatI);
  return h;
}

/** True when the point is in the river (water surface). */
export function isWater(x, z) {
  const riverD = Math.abs(x - (1400 + Math.sin(z * 0.0006) * 260));
  if (riverD < 55) return true;
  // Lake south-west of the field.
  const dx = x + 1500;
  const dz = z + 1900;
  return dx * dx + dz * dz < 520 * 520;
}

/** Colour of a terrain patch, by height and water. */
export function terrainColor(x, z, h) {
  if (isWater(x, z)) return '#2f6fb4';
  if (h > 300) return '#e8eef2'; // snow
  if (h > 210) return '#8a7a5e'; // rock
  if (h > 120) return '#5d7a3a'; // high grass
  // Patchwork fields near the valley floor.
  const cell = Math.floor(x / 260) + Math.floor(z / 260) * 7;
  const pick = ((cell % 5) + 5) % 5;
  const fields = ['#7fae4e', '#8fb45a', '#6f9e46', '#a8b45a', '#7aa653'];
  return fields[pick];
}

/** Ring course definitions: each ring is a circle the plane flies through. */
export const RING_COURSES = {
  // Training circuit around the home field.
  training: [
    { x: 0, z: 900, y: 150, r: 42 },
    { x: -700, z: 1500, y: 190, r: 42 },
    { x: -1100, z: 400, y: 170, r: 42 },
    { x: -500, z: -600, y: 150, r: 42 },
    { x: 300, z: -900, y: 160, r: 42 },
  ],
  // Low canyon run along the river.
  canyon: [
    { x: 1300, z: 300, y: 90, r: 38 },
    { x: 1550, z: 1100, y: 80, r: 38 },
    { x: 1200, z: 1900, y: 85, r: 38 },
    { x: 1650, z: 2700, y: 95, r: 38 },
    { x: 1400, z: 3500, y: 110, r: 38 },
    { x: 1900, z: 4300, y: 130, r: 38 },
  ],
  // Island hop: rings guide the plane to the island strip.
  island: [
    { x: 900, z: 1200, y: 220, r: 46 },
    { x: 1700, z: 2100, y: 240, r: 46 },
    { x: 2300, z: 2900, y: 200, r: 46 },
    { x: 2600, z: 3400, y: 90, r: 46 },
  ],
};
