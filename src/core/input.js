// Unified input: keyboard + mouse on desktop, virtual stick + buttons on touch.
// Scenes read `move` (x: right, y: forward/up), `pointer` (NDC) and buttons a–e.
const KEYMAP = {
  a: ['Space', 'KeyJ'],
  b: ['KeyK'],
  c: ['KeyE', 'KeyL'],
  d: ['ShiftLeft', 'ShiftRight', 'KeyI'],
  e: ['KeyR', 'KeyU'],
};
const NAMES = ['a', 'b', 'c', 'd', 'e'];

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.pointer = { x: 0, y: 0, t: -1e9 }; // NDC, last-moved timestamp (s)
    this.mouse = { a: false, b: false };
    this.touchBtn = {};
    this.down = {};
    this.prev = {};
    this.isTouch = false;
    this.tapFire = false; // turret scenes: touching the view aims and fires
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.aimTouch = null;
    this.onPause = null;

    const typing = (e) => e.target && /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
    addEventListener('keydown', (e) => {
      if (typing(e)) return;
      if (e.code === 'Escape' || e.code === 'KeyP') { this.onPause && this.onPause(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.a = this.mouse.b = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const ndc = (e) => {
      this.pointer.x = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / innerHeight) * 2 - 1);
      this.pointer.t = performance.now() / 1000;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        ndc(e);
        if (e.button === 0) this.mouse.a = true;
        if (e.button === 2) this.mouse.b = true;
        return;
      }
      this.enableTouch();
      if (e.clientX < innerWidth * 0.45 && this.stick.id === null) {
        this.stick.id = e.pointerId; this.stick.ox = e.clientX; this.stick.oy = e.clientY; this.stick.x = this.stick.y = 0;
        this.drawStick();
      } else if (this.tapFire && this.aimTouch === null) {
        this.aimTouch = e.pointerId; ndc(e);
      }
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { ndc(e); return; }
      if (e.pointerId === this.stick.id) {
        let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy), max = 52;
        if (len > max) { dx *= max / len; dy *= max / len; }
        this.stick.x = dx / max; this.stick.y = -dy / max;
        this.drawStick();
      } else if (e.pointerId === this.aimTouch) ndc(e);
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse.a = false; if (e.button === 2) this.mouse.b = false; return; }
      if (e.pointerId === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; this.drawStick(); }
      if (e.pointerId === this.aimTouch) this.aimTouch = null;
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    if (matchMedia('(pointer: coarse)').matches) this.enableTouch();
  }

  enableTouch() {
    if (this.isTouch) return;
    this.isTouch = true;
    document.body.classList.add('touch');
  }

  drawStick() {
    const el = document.getElementById('stick'), nub = el.firstElementChild;
    if (this.stick.id !== null) { el.style.left = this.stick.ox + 'px'; el.style.top = this.stick.oy + 'px'; el.style.bottom = 'auto'; }
    else { el.style.left = ''; el.style.top = ''; el.style.bottom = ''; }
    nub.style.transform = `translate(${this.stick.x * 40}px, ${-this.stick.y * 40}px)`;
  }

  // Wire up an on-screen button element for one of a–e.
  bindButton(el, name) {
    const set = (v) => (e) => { e.preventDefault(); this.touchBtn[name] = v; el.classList.toggle('down', v); };
    el.addEventListener('pointerdown', set(true));
    el.addEventListener('pointerup', set(false));
    el.addEventListener('pointercancel', set(false));
    el.addEventListener('pointerleave', set(false));
  }

  clear() {
    this.touchBtn = {}; this.mouse.a = this.mouse.b = false; this.aimTouch = null; this.keys.clear();
    for (const n of NAMES) { this.down[n] = false; this.prev[n] = false; }
  }

  update() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x && y) { x *= 0.7071; y *= 0.7071; }
    if (this.stick.id !== null) { x = this.stick.x; y = this.stick.y; }
    this.move.x = x; this.move.y = y;
    for (const n of NAMES) {
      this.prev[n] = this.down[n];
      let d = !!this.touchBtn[n] || KEYMAP[n].some((c) => k.has(c));
      if (n === 'a') d = d || this.mouse.a || (this.tapFire && this.aimTouch !== null);
      if (n === 'b') d = d || this.mouse.b;
      this.down[n] = d;
    }
  }

  held(n) { return !!this.down[n]; }
  hit(n) { return !!this.down[n] && !this.prev[n]; }
  pointerFresh(sec = 2.5) { return performance.now() / 1000 - this.pointer.t < sec; }
}
