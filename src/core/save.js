const KEY = 'gmo-fan-game-v1';

export class Save {
  constructor() {
    this.data = { chapter: 0, brawl: {}, ladder: false, finished: false, muted: false, lite: false };
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage unavailable */ }
  }
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }
  unlock(i) { if (i > this.data.chapter) { this.data.chapter = i; this.write(); } }
  set(k, v) { this.data[k] = v; this.write(); }
  beat(rival) { this.data.brawl[rival] = true; this.write(); }
}
