// input.js — keyboard + mouse state for Solmar City.
// One clear job: track which keys are down, mouse drag deltas for the camera,
// and click events for shooting. The game loop reads this, never the DOM directly.

export const keys = Object.create(null); // code -> true while held
export const pressed = Object.create(null); // code -> true only on the frame it went down
export const mouse = {
  dx: 0, dy: 0,       // accumulated drag delta since last consume
  down: false,        // left button held
  clicked: false,     // left button pressed this frame
  dragging: false,
  x: 0, y: 0,
};

let lastX = 0, lastY = 0;

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed[e.code] = true;
    keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    mouse.down = false; mouse.dragging = false;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouse.down = true; mouse.clicked = true; mouse.dragging = true;
    lastX = e.clientX; lastY = e.clientY; mouse.x = e.clientX; mouse.y = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!mouse.dragging) return;
    mouse.dx += e.clientX - lastX;
    mouse.dy += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    mouse.down = false; mouse.dragging = false;
  });
  // Keep the context menu from breaking camera drags.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Call once per frame after the game has read the state.
export function endFrameInput() {
  for (const k of Object.keys(pressed)) pressed[k] = false;
  mouse.dx = 0; mouse.dy = 0; mouse.clicked = false;
}

export function axisPos() {
  // WASD as a -1..1 movement vector (x = strafe right, y = forward).
  let x = 0, y = 0;
  if (keys.KeyW || keys.ArrowUp) y += 1;
  if (keys.KeyS || keys.ArrowDown) y -= 1;
  if (keys.KeyD || keys.ArrowRight) x += 1;
  if (keys.KeyA || keys.ArrowLeft) x -= 1;
  return { x, y };
}
