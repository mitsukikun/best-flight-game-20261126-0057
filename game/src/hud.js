// HUD: altitude, speed, heading, throttle, fuel, damage, compass,
// artificial horizon, waypoint arrow, mission panel and menus.
// Everything is drawn on the same canvas, so screenshots show it all.
import { clamp, radToDeg, wrapAngleDeg } from './util.js';
import { bearingTo } from './flight.js';
import { currentWaypoint } from './missions.js';

function panel(ctx, x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(8, 18, 32, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.18)') {
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = color;
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, fw, h, 4);
    ctx.fill();
  }
}

function fmtAlt(m) {
  return Math.round(m) + ' m';
}

function fmtSpeed(ms) {
  return Math.round(ms * 3.6) + ' km/h';
}

function compassLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function drawCompass(ctx, w, plane) {
  const cx = w / 2;
  const y = 26;
  panel(ctx, cx - 190, 10, 380, 44);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 184, 14, 368, 36);
  ctx.clip();
  ctx.fillStyle = '#cfe6ff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -90; d <= 90; d += 15) {
    const deg = Math.round((plane.headingDeg + d + 360) % 360);
    const x = cx + d * 2.1;
    const major = deg % 45 === 0;
    ctx.fillStyle = major ? '#ffd23e' : '#cfe6ff';
    ctx.font = major ? 'bold 14px system-ui, sans-serif' : '12px system-ui, sans-serif';
    const label = major
      ? (deg % 90 === 0 ? compassLabel(deg) : String(deg).padStart(3, '0'))
      : String(deg).padStart(3, '0');
    ctx.fillText(label, x, y + 8);
    ctx.fillRect(x - 0.5, y + 14, 1, major ? 8 : 4);
  }
  ctx.restore();
  // Heading readout + centre caret.
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(String(Math.round(plane.headingDeg)).padStart(3, '0') + '°', cx, y + 32);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(cx - 7, 12);
  ctx.lineTo(cx + 7, 12);
  ctx.lineTo(cx, 20);
  ctx.closePath();
  ctx.fill();
}

function drawArtificialHorizon(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate((-plane.rollDeg * Math.PI) / 180);
  const pitchPx = clamp(plane.pitchDeg, -25, 25) * (r / 28);
  ctx.fillStyle = '#3d7ab8';
  ctx.fillRect(-r, -r + pitchPx, r * 2, r);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(-r, pitchPx, r * 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  for (let p = -20; p <= 20; p += 10) {
    const yy = pitchPx - p * (r / 28);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, yy);
    ctx.lineTo(r * 0.45, yy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#ffd23e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker (drawn relative to the translated origin).
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0);
  ctx.lineTo(-r * 0.15, 0);
  ctx.moveTo(r * 0.15, 0);
  ctx.lineTo(r * 0.55, 0);
  ctx.stroke();
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLeftInstruments(ctx, plane) {
  panel(ctx, 14, 14, 218, 148);
  ctx.fillStyle = '#8fc4ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ALTITUDE', 28, 36);
  ctx.fillText('SPEED', 28, 74);
  ctx.fillText('VERTICAL SPEED', 28, 112);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(fmtAlt(plane.y), 28, 60);
  ctx.fillText(fmtSpeed(plane.speed), 28, 98);
  const vs = plane.verticalSpeed;
  ctx.fillStyle = vs > 0.5 ? '#7dffa8' : vs < -0.5 ? '#ff9a7d' : '#ffffff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText((vs >= 0 ? '+' : '') + vs.toFixed(1) + ' m/s', 28, 136);
  // Stall warning.
  if (!plane.onGround && plane.speed < 26) {
    ctx.fillStyle = '#ff5a4e';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('⚠ STALL — LOWER NOSE', 28, 156 - 6);
  }
}

function drawRightGauges(ctx, plane, missionState) {
  panel(ctx, 1048, 14, 218, 148);
  ctx.fillStyle = '#8fc4ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', 1062, 36);
  ctx.fillText('FUEL', 1062, 74);
  ctx.fillText('DAMAGE', 1062, 112);
  bar(ctx, 1062, 42, 190, 12, plane.throttle, '#ffd23e');
  bar(ctx, 1062, 80, 190, 12, plane.fuel / 100, plane.fuel < 25 ? '#ff5a4e' : '#7dffa8');
  bar(ctx, 1062, 118, 190, 12, plane.damage / 100, '#ff8a5a');
  ctx.fillStyle = '#0b1220';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(Math.round(plane.throttle * 100) + '%', 1248, 51);
  ctx.fillText(Math.round(plane.fuel) + ' L', 1248, 89);
  ctx.fillText(Math.round(plane.damage) + '%', 1248, 127);
  ctx.textAlign = 'left';
  // Score + timer.
  panel(ctx, 1048, 172, 218, 64);
  ctx.fillStyle = '#8fc4ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('SCORE', 1062, 194);
  ctx.fillText('TIME', 1062, 222);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(String(missionState.score), 1130, 196);
  const t = missionState.time;
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(Math.floor(t % 60)).padStart(2, '0');
  ctx.fillText(mm + ':' + ss, 1130, 224);
}

function drawWaypoint(ctx, w, h, plane, missionState) {
  const wp = currentWaypoint(missionState);
  const b = bearingTo(plane, wp.x, wp.z);
  const cx = w / 2;
  const cy = h * 0.5;
  const arrowR = 130;
  const aRad = (b.rel * Math.PI) / 180;
  const ax = cx + Math.sin(aRad) * arrowR;
  const ay = cy - Math.cos(aRad) * arrowR;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(aRad);
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(11, 10);
  ctx.lineTo(0, 4);
  ctx.lineTo(-11, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const distText = b.dist >= 1000 ? (b.dist / 1000).toFixed(1) + ' km' : Math.round(b.dist) + ' m';
  ctx.fillText(wp.label + ' · ' + distText, cx, cy - arrowR - 18);
}

function drawMissionPanel(ctx, missionState) {
  const m = missionState.mission;
  panel(ctx, 14, 640, 420, 138, 0.66);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(m.name.toUpperCase(), 28, 664);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Rings ${missionState.ringsHit}/${missionState.ringsTotal}`, 28, 688);
  // Ring pips.
  for (let i = 0; i < missionState.ringsTotal; i++) {
    ctx.fillStyle = i < missionState.ringsHit ? '#ffd23e' : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(34 + i * 22, 706, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  if (missionState.messageTime > 0) {
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '13px system-ui, sans-serif';
    const lines = wrapText(missionState.message, 46);
    lines.forEach((ln, i) => ctx.fillText(ln, 28, 734 + i * 17));
  }
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = (cur + ' ' + word).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function drawControlsHint(ctx, w) {
  ctx.fillStyle = 'rgba(234, 242, 255, 0.85)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'W/S throttle · ↑/↓ pitch · ←/→ bank · SPACE brake · 1/2/3 missions · R restart · C camera',
    w / 2,
    788,
  );
}

/** Draw the whole HUD for a frame. */
export function drawHUD(ctx, w, h, plane, missionState, time) {
  drawCompass(ctx, w, plane);
  drawLeftInstruments(ctx, plane);
  drawRightGauges(ctx, plane, missionState);
  drawArtificialHorizon(ctx, 108, 232, 46, plane);
  ctx.fillStyle = '#8fc4ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', 108, 296);
  if (!missionState.done) drawWaypoint(ctx, w, h, plane, missionState);
  drawMissionPanel(ctx, missionState);
  drawControlsHint(ctx, w);
  // Low fuel warning.
  if (plane.fuel < 20 && !missionState.done) {
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ff5a4e' : '#ffb04e';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL — ' + Math.round(plane.fuel) + ' L LEFT', w / 2, 120);
  }
}

/** Title / menu screen drawn over the world. */
export function drawMenu(ctx, w, h, missions, selectedMission, bestScores) {
  ctx.fillStyle = 'rgba(6, 14, 26, 0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('SKYLINE COURIER', w / 2, 150);
  ctx.fillStyle = '#ffd23e';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('A little airline with one plane, three routes, and a fuel gauge.', w / 2, 186);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Fly the rings, mind the throttle, and bring her home in one piece.', w / 2, 216);

  const y0 = 280;
  const list = missions;
  list.forEach((m, i) => {
    const y = y0 + i * 92;
    const sel = i === selectedMission;
    panel(ctx, w / 2 - 330, y - 34, 660, 76, sel ? 0.9 : 0.55);
    if (sel) {
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(w / 2 - 330, y - 34, 660, 76, 10);
      ctx.stroke();
    }
    ctx.fillStyle = sel ? '#ffd23e' : '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText((i + 1) + ' · ' + m.name, w / 2 - 306, y - 6);
    ctx.fillStyle = '#cfe6ff';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(m.brief, w / 2 - 306, y + 18);
    const best = bestScores[m.id];
    if (best != null) {
      ctx.fillStyle = '#7dffa8';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('BEST ' + best, w / 2 + 306, y - 6);
      ctx.textAlign = 'left';
    }
  });
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Press 1, 2 or 3 — or click a mission — then ENTER to fly.  Mouse steers too: hold and drag.', w / 2, y0 + 3 * 92 + 30);
  ctx.fillText('W/S throttle · Arrow keys pitch & bank · SPACE airbrake · R restart · M menu', w / 2, y0 + 3 * 92 + 56);
}

/** End-of-mission screen. */
export function drawResult(ctx, w, h, missionState, plane) {
  ctx.fillStyle = 'rgba(6, 14, 26, 0.66)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  const win = missionState.result === 'success';
  ctx.fillStyle = win ? '#7dffa8' : '#ff8a7d';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(
    missionState.result === 'success'
      ? 'MISSION COMPLETE'
      : missionState.result === 'crashed'
        ? 'CRASHED'
        : 'OUT OF FUEL',
    w / 2,
    300,
  );
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('Score ' + missionState.score, w / 2, 350);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '15px system-ui, sans-serif';
  const t = missionState.time;
  ctx.fillText(
    `Rings ${missionState.ringsHit}/${missionState.ringsTotal} · Time ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · Fuel left ${Math.round(plane.fuel)} L`,
    w / 2,
    384,
  );
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText('Press R to fly again, M for the mission menu, 1/2/3 to switch mission.', w / 2, 430);
}
