// Keyboard and mouse input. Keys are tracked as a held set; one-shot actions
// (shoot, enter car, pause, confirm) are queued so a fixed-step loop can
// consume them exactly once. Mouse aim is converted to world space by main.

export const ACT_SHOOT = 1;
export const ACT_ENTER = 2;
export const ACT_PAUSE = 4;
export const ACT_CONFIRM = 8;
export const ACT_HORN = 16;

const CODE_ACTIONS = {
  KeyE: ACT_ENTER,
  KeyF: ACT_SHOOT,
  Escape: ACT_PAUSE,
  KeyP: ACT_PAUSE,
  Enter: ACT_CONFIRM,
  KeyH: ACT_HORN,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;
  let gesture = false;

  window.addEventListener('keydown', (e) => {
    gesture = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat && CODE_ACTIONS[e.code]) actions |= CODE_ACTIONS[e.code];
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = e.clientX - r.left;
    mouseY = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    gesture = true;
    mouseDown = true;
    clicked = true;
    if (e.button === 0) actions |= ACT_SHOOT;
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });
  canvas.addEventListener('touchstart', () => { gesture = true; }, { passive: true });

  return {
    keys,
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    get mouseDown() { return mouseDown; },
    get clicked() { const c = clicked; clicked = false; return c; },
    get gesture() { return gesture; },
    down(code) { return keys.has(code); },
    axisX() { return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0); },
    axisY() { return (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0); },
    sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    handbrake() { return keys.has('Space'); },
    takeActions() { const a = actions; actions = 0; return a; },
    setKeys(codes) { keys.clear(); for (const c of codes) keys.add(c); },
    setAim(x, y) { mouseX = x; mouseY = y; },
    press(action) { actions |= action; },
  };
}
