// Keyboard + mouse input. Keys are read per frame by the game loop;
// mouse drag steers pitch/roll like a yoke.
export function createInput(canvas) {
  const keys = new Set();
  const mouse = { down: false, x: 0, y: 0, dx: 0, dy: 0 };

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseDown(e) {
    mouse.down = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.dx = 0;
    mouse.dy = 0;
  }

  function onMouseMove(e) {
    if (!mouse.down) return;
    mouse.dx = e.clientX - mouse.x;
    mouse.dy = e.clientY - mouse.y;
  }

  function onMouseUp() {
    mouse.down = false;
    mouse.dx = 0;
    mouse.dy = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Poll the continuous flight controls for this frame. */
    readFlight(dt) {
      let pitch = 0;
      let roll = 0;
      let throttleDelta = 0;
      if (keys.has('ArrowUp')) pitch += 1;
      if (keys.has('ArrowDown')) pitch -= 1;
      if (keys.has('ArrowLeft')) roll -= 1;
      if (keys.has('ArrowRight')) roll += 1;
      if (keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight')) throttleDelta += 0.55;
      if (keys.has('KeyS') || keys.has('ControlLeft')) throttleDelta -= 0.55;
      // Mouse yoke: drag steers, centred when released.
      if (mouse.down) {
        pitch += Math.max(-1, Math.min(1, -mouse.dy / 120));
        roll += Math.max(-1, Math.min(1, mouse.dx / 120));
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleDelta,
        brake: keys.has('Space'),
        flaps: keys.has('KeyF'),
      };
    },
    /** True once when the key was pressed (edge-triggered, per frame). */
    pressed(code) {
      return keys.has(code);
    },
    consume(code) {
      keys.delete(code);
    },
    mouse,
    keys,
  };
}
