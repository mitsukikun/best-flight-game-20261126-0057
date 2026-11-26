// Small math + deterministic-noise helpers shared by the flight game.
// Nothing here touches the network or the DOM.
export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function degToRad(d) {
  return (d * Math.PI) / 180;
}

export function radToDeg(r) {
  return (r * 180) / Math.PI;
}

/** Wrap an angle in degrees to [-180, 180). */
export function wrapAngleDeg(a) {
  let r = a % 360;
  if (r >= 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

/** Smoothstep 0..1. */
export function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// --- Deterministic value noise (hash based, no Math.random in world gen) ---
function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** 2D value noise in [-1, 1], smooth. */
export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const u = fade(fx);
  const v = fade(fz);
  const val = lerp(lerp(a, b, u), lerp(c, d, u), v);
  return val * 2 - 1;
}

/** Fractal noise, 3 octaves. */
export function fbm2(x, z) {
  return (
    noise2(x, z) * 0.55 +
    noise2(x * 2.13 + 7.3, z * 2.13 - 3.1) * 0.3 +
    noise2(x * 4.31 - 11.7, z * 4.31 + 5.9) * 0.15
  );
}
