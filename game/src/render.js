// Renderer: software 3D on a 2D canvas. Projects the terrain grid, the
// runway, the rings and the clouds through a chase camera, then draws the
// aircraft in frame. No images, no network — every pixel is drawn here.
import { clamp, degToRad, lerp, radToDeg, wrapAngleDeg } from './util.js';
import {
  ISLAND_STRIP, RING_COURSES, RUNWAY, distToRunway, groundHeight, isWater, terrainColor,
} from './terrain.js';

// Camera: sits behind and above the plane, looks along its heading.
function cameraBasis(plane) {
  const h = degToRad(plane.headingDeg);
  const forward = { x: Math.sin(h), y: 0, z: Math.cos(h) };
  const right = { x: Math.cos(h), y: 0, z: -Math.sin(h) };
  const up = { x: 0, y: 1, z: 0 };
  return { forward, right, up };
}

function cameraPos(plane) {
  const h = degToRad(plane.headingDeg);
  const back = 16 + plane.speed * 0.06;
  const up = 5.5 + plane.speed * 0.012;
  return {
    x: plane.x - Math.sin(h) * back,
    y: plane.y + up,
    z: plane.z - Math.cos(h) * back,
  };
}

/** Project a world point to screen space. Returns null when behind camera. */
function project(pt, cam, basis, view) {
  const dx = pt.x - cam.x;
  const dy = pt.y - cam.y;
  const dz = pt.z - cam.z;
  const cx = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
  const cy = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
  const cz = dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z;
  if (cz < 2) return null;
  const scale = view.focal / cz;
  return {
    x: view.cx + cx * scale,
    y: view.cy - cy * scale - view.pitchPixels,
    depth: cz,
    scale,
  };
}

function drawSky(ctx, w, h, plane, time) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const alt = clamp(plane.y / 600, 0, 1);
  g.addColorStop(0, lerpColor('#2b6cb0', '#1a3a6b', alt));
  g.addColorStop(0.45, lerpColor('#7db4e2', '#4a7fb8', alt));
  g.addColorStop(0.62, lerpColor('#cfe6f5', '#9dbfd9', alt));
  g.addColorStop(1, lerpColor('#e8f2f8', '#c8d8e6', alt));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sun.
  const sunX = w * 0.78;
  const sunY = h * 0.16;
  const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
  sg.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
  sg.addColorStop(0.25, 'rgba(255, 230, 150, 0.55)');
  sg.addColorStop(1, 'rgba(255, 230, 150, 0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sunX - 90, sunY - 90, 180, 180);

  // Distant mountain ridge silhouettes (parallax by heading).
  drawRidge(ctx, w, h, plane.headingDeg, 0.55, '#7d9bb8', 0.42, time);
  drawRidge(ctx, w, h, plane.headingDeg, 0.3, '#5f7fa3', 0.5, time);
}

function lerpColor(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function drawRidge(ctx, w, h, headingDeg, parallax, color, baseY, time) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  const horizon = h * baseY;
  ctx.moveTo(0, horizon);
  for (let sx = 0; sx <= w; sx += 16) {
    const ang = (sx / w) * 120 - 60 + headingDeg * parallax;
    const n = Math.sin(ang * 0.11 + time * 0.0) * 0.5 +
      Math.sin(ang * 0.031 + 2.1) * 0.8 + Math.sin(ang * 0.073 + 5.0) * 0.4;
    ctx.lineTo(sx, horizon - (n * 34 + 26));
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawClouds(ctx, w, h, plane, time) {
  // Puffy billboard clouds drifting slowly; drawn as soft ellipses.
  ctx.save();
  for (let i = 0; i < 14; i++) {
    const seed = i * 137.5;
    const cx = ((seed * 3.7 + plane.x * 0.02 + time * 2) % (w + 400)) - 200;
    const cy = h * 0.10 + ((seed * 7.3) % 100) * 0.9 - (plane.y * 0.02 % 40);
    const s = 60 + (seed % 70);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s, s * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.5, cy + 6, s * 0.7, s * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - s * 0.5, cy + 8, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw the terrain as a projected grid of quads ahead of the plane. */
function drawTerrain(ctx, plane, cam, basis, view) {
  const hRad = degToRad(plane.headingDeg);
  const fx = Math.sin(hRad);
  const fz = Math.cos(hRad);
  const rx = Math.cos(hRad);
  const rz = -Math.sin(hRad);
  const step = 100;
  const rows = 30;
  const cols = 17;
  // Grid points in camera-relative space, stored row by row. The first rows
  // start behind the camera so the ground fills the bottom of the screen.
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    const ahead = -100 + r * step;
    for (let c = 0; c < cols; c++) {
      const side = (c - (cols - 1) / 2) * step;
      const wx = plane.x + fx * ahead + rx * side;
      const wz = plane.z + fz * ahead + rz * side;
      const wy = groundHeight(wx, wz);
      const p = project({ x: wx, y: wy, z: wz }, cam, basis, view);
      row.push({ p, wx, wz, wy });
    }
    grid.push(row);
  }
  // Painter's algorithm: far rows first.
  for (let r = rows - 2; r >= 0; r--) {
    for (let c = 0; c < cols - 1; c++) {
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const cc = grid[r + 1][c];
      const d = grid[r + 1][c + 1];
      if (!a.p || !b.p || !cc.p || !d.p) continue;
      const midX = (a.wx + d.wx) / 2;
      const midZ = (a.wz + d.wz) / 2;
      const midH = (a.wy + d.wy) / 2;
      ctx.fillStyle = terrainColor(midX, midZ, midH);
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.lineTo(d.p.x, d.p.y);
      ctx.lineTo(cc.p.x, cc.p.y);
      ctx.closePath();
      ctx.fill();
      // Stroke with the same colour so neighbouring quads never leave a seam.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // River shimmer: draw the river as a projected ribbon where it crosses.
  drawRiver(ctx, plane, cam, basis, view);
}

function drawRiver(ctx, plane, cam, basis, view) {
  ctx.strokeStyle = '#3a7cc0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  let started = false;
  for (let z = plane.z - 400; z < plane.z + 5200; z += 140) {
    const x = 1400 + Math.sin(z * 0.0006) * 260;
    const p = project({ x, y: groundHeight(x, z) + 1, z }, cam, basis, view);
    if (!p) continue;
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Draw a runway strip (home or island) with centreline and thresholds. */
function drawStrip(ctx, strip, cam, basis, view, label) {
  const rad = (strip.headingDeg * Math.PI) / 180;
  const sx = Math.sin(rad);
  const sz = Math.cos(rad);
  const half = strip.length / 2;
  const hw = strip.width / 2;
  const px = -sz;
  const pz = sx;
  // Draw the strip in short segments along its length so a corner behind
  // the camera only drops its own segment, never the whole runway.
  for (let d = -half; d < half; d += 60) {
    const d0 = d;
    const d1 = Math.min(d + 60, half);
    const corners = [
      { x: strip.x + sx * d0 + px * -hw, y: 5, z: strip.z + sz * d0 + pz * -hw },
      { x: strip.x + sx * d0 + px * hw, y: 5, z: strip.z + sz * d0 + pz * hw },
      { x: strip.x + sx * d1 + px * hw, y: 5, z: strip.z + sz * d1 + pz * hw },
      { x: strip.x + sx * d1 + px * -hw, y: 5, z: strip.z + sz * d1 + pz * -hw },
    ];
    const pts = corners.map((c) => project(c, cam, basis, view));
    if (pts.some((p) => !p)) continue;
    ctx.fillStyle = '#3c3f45';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }
  // Centreline dashes.
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 3;
  for (let d = -half + 60; d < half - 40; d += 90) {
    const a = project({ x: strip.x + sx * d, y: 5.4, z: strip.z + sz * d }, cam, basis, view);
    const b = project({ x: strip.x + sx * (d + 42), y: 5.4, z: strip.z + sz * (d + 42) }, cam, basis, view);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Threshold bars.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  for (const end of [-half + 26, half - 26]) {
    const a = project({ x: strip.x + sx * end + px * -hw * 0.8, y: 5.4, z: strip.z + sz * end + pz * -hw * 0.8 }, cam, basis, view);
    const b = project({ x: strip.x + sx * end + px * hw * 0.8, y: 5.4, z: strip.z + sz * end + pz * hw * 0.8 }, cam, basis, view);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Label.
  const lp = project({ x: strip.x, y: 12, z: strip.z + sz * (half + 60) }, cam, basis, view);
  if (lp) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, lp.x, lp.y);
  }
}

/** Draw a target ring as a glowing circle facing the flight direction. */
function drawRing(ctx, ring, cam, basis, view, isNext, time) {
  const centre = project({ x: ring.x, y: ring.y, z: ring.z }, cam, basis, view);
  if (!centre) return;
  const radiusPx = ring.r * centre.scale;
  if (radiusPx < 3 || radiusPx > 900) return;
  const pulse = isNext ? 0.75 + Math.sin(time * 5) * 0.25 : 0.35;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = isNext ? '#ffd23e' : '#7fd4ff';
  ctx.lineWidth = Math.max(3, radiusPx * 0.09);
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, radiusPx, radiusPx * 0.96, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = pulse * 0.5;
  ctx.lineWidth = Math.max(1, radiusPx * 0.03);
  ctx.beginPath();
  ctx.ellipse(centre.x, centre.y, radiusPx * 1.12, radiusPx * 1.08, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  if (isNext) {
    ctx.fillStyle = '#ffd23e';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEXT RING', centre.x, centre.y - radiusPx - 10);
  }
}

/** The courier plane, drawn in chase view, banking with the turn. */
function drawAircraft(ctx, w, h, plane, time) {
  const cx = w / 2;
  const cy = h * 0.66;
  const scale = 1 + clamp(plane.speed / 160, 0, 0.5);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(degToRad(-plane.rollDeg) * 0.9);
  ctx.scale(scale, scale);
  // Shadow on the ground when low.
  const ground = groundHeight(plane.x, plane.z);
  const alt = plane.y - ground;
  if (alt < 120 && !plane.onGround) {
    ctx.save();
    ctx.globalAlpha = clamp(0.35 - alt / 400, 0.05, 0.35);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 118 - alt * 0.35, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Wings.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.lineTo(-30, -8);
  ctx.lineTo(30, -8);
  ctx.lineTo(118, 6);
  ctx.lineTo(30, 16);
  ctx.lineTo(-30, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b03028';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.lineTo(-96, 10);
  ctx.lineTo(-30, 14);
  ctx.lineTo(-30, 16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(118, 6);
  ctx.lineTo(96, 10);
  ctx.lineTo(30, 14);
  ctx.lineTo(30, 16);
  ctx.closePath();
  ctx.fill();
  // Tail.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-34, -52);
  ctx.lineTo(34, -52);
  ctx.lineTo(20, -30);
  ctx.lineTo(-20, -30);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const fg = ctx.createLinearGradient(-14, 0, 14, 0);
  fg.addColorStop(0, '#f4f6f8');
  fg.addColorStop(0.5, '#ffffff');
  fg.addColorStop(1, '#cfd8e0');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(0, -78);
  ctx.quadraticCurveTo(13, -40, 13, 8);
  ctx.quadraticCurveTo(13, 34, 0, 40);
  ctx.quadraticCurveTo(-13, 34, -13, 8);
  ctx.quadraticCurveTo(-13, -40, 0, -78);
  ctx.fill();
  // Canopy (lit instruments glow through it).
  ctx.fillStyle = '#12324e';
  ctx.beginPath();
  ctx.ellipse(0, -34, 8.5, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 220, 255, 0.75)';
  ctx.beginPath();
  ctx.ellipse(-2, -38, 3.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose stripe + registration.
  ctx.fillStyle = '#d8433a';
  ctx.fillRect(-13, 2, 26, 5);
  ctx.fillStyle = '#12324e';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SK-01', 0, 30);
  // Propeller blur when the engine runs.
  if (plane.throttle > 0.05 && !plane.crashed) {
    ctx.fillStyle = 'rgba(200, 210, 220, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -78, 4, 26 + plane.throttle * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Smoke when damaged.
  if (plane.damage > 35 && !plane.crashed) {
    ctx.fillStyle = 'rgba(60,60,60,0.5)';
    const t = time * 2;
    for (let i = 0; i < 3; i++) {
      const oy = -90 - ((t * 30 + i * 22) % 70);
      ctx.beginPath();
      ctx.arc((i - 1) * 8, oy, 7 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Top-level world render for one frame. */
export function renderWorld(ctx, w, h, plane, missionState, time) {
  const view = {
    cx: w / 2,
    cy: h * 0.52,
    focal: h * 0.9,
    pitchPixels: -plane.pitchDeg * 6,
  };
  const cam = cameraPos(plane);
  const basis = cameraBasis(plane);
  drawSky(ctx, w, h, plane, time);
  drawClouds(ctx, w, h, plane, time);
  drawTerrain(ctx, plane, cam, basis, view);
  drawStrip(ctx, RUNWAY, cam, basis, view, 'RUNWAY 36 · HOME');
  drawStrip(ctx, ISLAND_STRIP, cam, basis, view, 'ISLAND STRIP');
  const rings = missionState.mission.rings;
  rings.forEach((ring, i) => {
    drawRing(ctx, ring, cam, basis, view, i === missionState.ringIndex, time);
  });
  drawAircraft(ctx, w, h, plane, time);
  // Crash overlay: smoke burst + tilted wreck hint.
  if (plane.crashed) {
    ctx.fillStyle = 'rgba(40, 20, 10, 0.25)';
    ctx.fillRect(0, 0, w, h);
  }
}
