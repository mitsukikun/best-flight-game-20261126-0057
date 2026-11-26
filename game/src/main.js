// Skyline Courier — entry point and game loop.
// States: menu -> flying -> result. A `?shot=N` URL parameter stages a
// fixed scene for screenshots (real renders of this same code).
import { createPlane, stepPlane } from './flight.js';
import { MISSIONS, createMissionState, setMessage, stepMission } from './missions.js';
import { renderWorld } from './render.js';
import { drawHUD, drawMenu, drawResult } from './hud.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { groundHeight } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const audio = createAudio();
const input = createInput(canvas);

const BEST_KEY = 'skyline-courier-best';
let bestScores = {};
try {
  bestScores = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
} catch (e) {
  bestScores = {};
}

function saveBest(missionId, score) {
  if (bestScores[missionId] == null || score > bestScores[missionId]) {
    bestScores[missionId] = score;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(bestScores));
    } catch (e) {
      // Storage may be unavailable; best scores are a nicety.
    }
  }
}

let state = 'menu'; // 'menu' | 'flying' | 'result'
let selectedMission = 0;
let plane = createPlane();
let missionState = createMissionState(MISSIONS[0]);
let time = 0;

function startMission(index) {
  selectedMission = index;
  plane = createPlane();
  plane.fuel = MISSIONS[index].fuelStart;
  missionState = createMissionState(MISSIONS[index]);
  state = 'flying';
  audio.unlock();
  audio.click();
}

function restart() {
  startMission(selectedMission);
}

function toMenu() {
  state = 'menu';
  plane = createPlane();
  missionState = createMissionState(MISSIONS[selectedMission]);
}

// --- Screenshot staging -------------------------------------------------
// ?shot=1  chase view over the valley, rings ahead, on the runway roll
// ?shot=2  airborne through the canyon, low over the river
// ?shot=3  final approach to Runway 36, threshold in sight
// ?shot=4  island hop: high over the fields, island strip ahead
// Each stage uses the game's own physics/render state, frozen mid-flight.
function stageShot(n) {
  const shot = Number(n) || 1;
  if (shot === 2) {
    startMission(1);
    plane.x = 1450;
    plane.z = 900;
    plane.y = 95;
    plane.headingDeg = 12;
    plane.speed = 62;
    plane.throttle = 0.72;
    plane.pitchDeg = 1;
    missionState.ringIndex = 1;
    missionState.ringsHit = 1;
    missionState.score = 500;
    missionState.time = 42;
  } else if (shot === 3) {
    startMission(0);
    plane.x = 60;
    plane.z = -1150;
    plane.y = 95;
    plane.headingDeg = 2;
    plane.speed = 48;
    plane.throttle = 0.45;
    plane.pitchDeg = -4;
    plane.fuel = 61;
    missionState.ringIndex = 5;
    missionState.ringsHit = 5;
    missionState.score = 2500;
    missionState.time = 188;
    setMessage(missionState, 'All rings clear! Now land at Runway 36.', 30);
  } else if (shot === 4) {
    startMission(2);
    plane.x = 1500;
    plane.z = 1800;
    plane.y = 260;
    plane.headingDeg = 38;
    plane.speed = 66;
    plane.throttle = 0.8;
    plane.fuel = 55;
    missionState.ringIndex = 1;
    missionState.ringsHit = 1;
    missionState.score = 500;
    missionState.time = 96;
  } else {
    // Cover: rolling down Runway 36 at takeoff speed, first ring ahead.
    startMission(0);
    plane.x = 0;
    plane.z = -260;
    plane.y = 6;
    plane.headingDeg = 0;
    plane.speed = 38;
    plane.throttle = 1;
    missionState.time = 6;
    setMessage(missionState, 'Take off from Runway 36, fly through all 5 rings, then land back on the runway.', 30);
  }
  // Freeze the staged frame: no physics, no input, just one render.
  state = 'shot';
  document.title = 'Skyline Courier — shot ' + shot;
}

const params = new URLSearchParams(location.search);
if (params.has('shot')) {
  stageShot(params.get('shot'));
}

// --- Input edges --------------------------------------------------------
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'KeyM') {
    if (state !== 'menu') toMenu();
    else state = 'flying';
    return;
  }
  if (e.code === 'KeyR' && state !== 'menu') {
    restart();
    return;
  }
  if (state === 'menu') {
    if (e.code === 'Digit1') selectedMission = 0;
    if (e.code === 'Digit2') selectedMission = 1;
    if (e.code === 'Digit3') selectedMission = 2;
    if (e.code === 'Enter' || e.code === 'Space') startMission(selectedMission);
    return;
  }
  if (state === 'result') {
    if (e.code === 'Digit1') startMission(0);
    if (e.code === 'Digit2') startMission(1);
    if (e.code === 'Digit3') startMission(2);
    return;
  }
  if (e.code === 'Digit1') startMission(0);
  if (e.code === 'Digit2') startMission(1);
  if (e.code === 'Digit3') startMission(2);
});

canvas.addEventListener('click', (e) => {
  if (state !== 'menu') return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top) * (H / rect.height);
  for (let i = 0; i < MISSIONS.length; i++) {
    const y = 280 + i * 92;
    if (mx > W / 2 - 330 && mx < W / 2 + 330 && my > y - 34 && my < y + 42) {
      startMission(i);
      return;
    }
  }
});

// --- Main loop ----------------------------------------------------------
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (state === 'flying') {
    const controls = input.readFlight(dt);
    const event = stepPlane(plane, controls, dt);
    const mEvent = stepMission(missionState, plane, dt);
    if (event === 'ring' || mEvent === 'ring') audio.ring();
    if (event === 'touchdown') audio.touchdown();
    if (event === 'crash') audio.crash();
    if (mEvent === 'complete') {
      state = 'result';
      saveBest(missionState.mission.id, missionState.score);
      if (missionState.result === 'success') audio.success();
    }
    audio.setEngine(plane.throttle, plane.speed, !plane.onGround);
    // Keep the plane inside the playable valley.
    if (Math.abs(plane.x) > 6500 || Math.abs(plane.z) > 6500) {
      setMessage(missionState, 'Turn back — you are leaving the valley!', 3);
      plane.headingDeg = (plane.headingDeg + 180) % 360;
    }
  } else if (state === 'menu') {
    // Gentle idle orbit over the field behind the menu.
    plane.headingDeg = (plane.headingDeg + dt * 4) % 360;
    plane.x = Math.sin((plane.headingDeg * Math.PI) / 180) * 900;
    plane.z = Math.cos((plane.headingDeg * Math.PI) / 180) * 900;
    plane.y = groundHeight(plane.x, plane.z) + 180;
    plane.speed = 55;
    plane.throttle = 0.6;
  }

  renderWorld(ctx, W, H, plane, missionState, time);
  if (state === 'menu') {
    drawMenu(ctx, W, H, MISSIONS, selectedMission, bestScores);
  } else if (state === 'result') {
    drawHUD(ctx, W, H, plane, missionState, time);
    drawResult(ctx, W, H, missionState, plane);
  } else {
    drawHUD(ctx, W, H, plane, missionState, time);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
