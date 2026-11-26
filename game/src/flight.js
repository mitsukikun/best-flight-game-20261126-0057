// Flight model for Skyline Courier: a forgiving arcade sim with real
// trade-offs — throttle and turn discipline, stall, fuel burn, damage.
import { clamp, degToRad, lerp, radToDeg, wrapAngleDeg } from './util.js';
import { groundHeight } from './terrain.js';

export const PLANE = {
  maxSpeed: 92, // m/s
  cruiseSpeed: 58,
  stallSpeed: 24,
  maxThrottle: 1,
  fuelCapacity: 100,
  maxDamage: 100,
};

/** Fresh plane state, parked on the home runway threshold. */
export function createPlane() {
  return {
    x: 0,
    y: 6,
    z: -330,
    headingDeg: 0, // 0 = north (+Z), 90 = east
    pitchDeg: 0,
    rollDeg: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    onGround: true,
    verticalSpeed: 0,
    gForce: 1,
    crashed: false,
    landed: false,
    airtime: 0,
  };
}

/**
 * Advance the plane one step (dt seconds) from pilot inputs.
 * inputs: { pitch: -1..1 (pull up positive), roll: -1..1 (right positive),
 *           throttleDelta, brake, flaps }
 * Returns an event string ('stall' | 'touchdown' | 'crash' | 'takeoff' | null).
 */
export function stepPlane(p, inputs, dt) {
  if (p.crashed) return null;
  const ground = groundHeight(p.x, p.z);

  // Throttle.
  p.throttle = clamp(p.throttle + inputs.throttleDelta * dt, 0, PLANE.maxThrottle);

  // Roll and pitch authority scale with airspeed; on the ground the plane
  // steers gently with the rudder instead.
  const airAuthority = clamp((p.speed - 8) / 30, 0, 1);
  const targetRoll = clamp(inputs.roll * 62, -62, 62) * airAuthority;
  p.rollDeg = lerp(p.rollDeg, targetRoll, 1 - Math.exp(-dt * 2.4));

  const targetPitch = clamp(inputs.pitch * 18, -14, 18) * airAuthority;
  p.pitchDeg = lerp(p.pitchDeg, targetPitch, 1 - Math.exp(-dt * 2.0));

  // Turning: banked turn, tighter at low speed, sloppy at high speed.
  const turnRate = -Math.tan(degToRad(p.rollDeg)) * 9.81 / Math.max(p.speed, 12);
  p.headingDeg = (p.headingDeg + radToDeg(turnRate) * dt + 360) % 360;

  // Speed: thrust vs drag; drag grows with the square of speed and with
  // bank (turning bleeds speed — throttle discipline matters).
  const thrust = p.throttle * 26;
  const drag = 0.0032 * p.speed * p.speed + Math.abs(p.rollDeg) * 0.028 + (inputs.brake ? 14 : 0);
  let accel = thrust - drag;
  // Climbing bleeds speed, descending gains it.
  accel -= Math.sin(degToRad(p.pitchDeg)) * 9.81 * 0.55;
  p.speed = Math.max(0, p.speed + accel * dt);
  p.speed = Math.min(p.speed, PLANE.maxSpeed + 12);

  // Lift: enough speed and the wings carry the plane.
  const liftFactor = clamp((p.speed - PLANE.stallSpeed) / 26, 0, 1);
  const climbRate = Math.sin(degToRad(p.pitchDeg)) * p.speed * liftFactor;
  p.verticalSpeed = lerp(p.verticalSpeed, climbRate, 1 - Math.exp(-dt * 1.6));

  // Move.
  const hRad = degToRad(p.headingDeg);
  p.x += Math.sin(hRad) * p.speed * dt;
  p.z += Math.cos(hRad) * p.speed * dt;
  p.y += p.verticalSpeed * dt;

  // G force from the bank.
  p.gForce = 1 / Math.max(Math.cos(degToRad(p.rollDeg)), 0.4);

  // Fuel burn: throttle-heavy, worse at full power.
  p.fuel = Math.max(0, p.fuel - (0.22 + p.throttle * p.throttle * 1.05) * dt);
  if (p.fuel <= 0 && p.throttle > 0) p.throttle = 0;

  // Ground contact.
  const wasAirborne = !p.onGround;
  if (p.y <= ground + 2) {
    p.y = ground + 2;
    const hard = Math.abs(p.verticalSpeed) > 7 || Math.abs(p.rollDeg) > 28;
    const fast = p.speed > 62;
    if (wasAirborne) {
      if (hard || fast) {
        p.crashed = true;
        p.damage = PLANE.maxDamage;
        return 'crash';
      }
      p.onGround = true;
      p.verticalSpeed = 0;
      p.pitchDeg = 0;
      p.rollDeg = 0;
      p.landed = true;
      return 'touchdown';
    }
    p.onGround = true;
    p.verticalSpeed = 0;
    if (p.speed > 4) p.speed = Math.max(0, p.speed - 6 * dt); // rolling friction
  } else {
    p.onGround = false;
    if (wasAirborne === false && p.speed > 10) {
      // Just lifted off.
    }
    p.airtime += dt;
  }

  // Stall warning event (not a crash — recover by lowering the nose).
  if (!p.onGround && p.speed < PLANE.stallSpeed && p.y > ground + 30) {
    return 'stall';
  }
  // Terrain collision with a hillside while airborne.
  if (!p.onGround && p.y < ground + 2) {
    p.crashed = true;
    p.damage = PLANE.maxDamage;
    return 'crash';
  }
  return null;
}

/** Distance and bearing from the plane to a target point. */
export function bearingTo(p, tx, tz) {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const dist = Math.hypot(dx, dz);
  const bearing = (radToDeg(Math.atan2(dx, dz)) + 360) % 360;
  return { dist, rel: wrapAngleDeg(bearing - p.headingDeg) };
}
