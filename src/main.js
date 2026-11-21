import * as THREE from 'three/webgpu';
import './style.css';
import { Input } from './core/input.js';
import { AudioSys } from './core/audio.js';
import { UI } from './core/ui.js';
import { Save } from './core/save.js';
import { loadAssets, need } from './core/assets.js';
import { MenuScene } from './menuScene.js';
import { ViewerScene } from './viewerScene.js';
import { GlbView } from './glbView.js';
import { BrawlScene } from './brawl/brawlScene.js';
import { RIVALS, LADDER, ARENAS } from './brawl/roster.js';
import { CHAPTERS, ENDING } from './story/script.js';
import { SCENES } from './story/chapters/index.js';

const FOOT = 'Unofficial, non-commercial fan project. Godzilla and related characters are trademarks of Toho Co., Ltd. This game is not affiliated with or endorsed by Toho.';

class Game {
  constructor() {
    const canvas = document.getElementById('c'), q0 = new URLSearchParams(location.search);
    this.save = new Save();
    // WebGPU where the browser has it, WebGL 2 otherwise (same code path either way)
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance', forceWebGL: new URLSearchParams(location.search).has('webgl') });
    this.setGraphics(this.save.data.lite || q0.has('lite'));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input(canvas);
    this.audio = new AudioSys();
    this.audio.muted = this.save.data.muted;
    this.ui = new UI(this.input, this.audio);
    this.current = null; this.paused = false; this.busy = false; this.mode = 'menu'; this.arena = null;
    this.last = performance.now();
    this.speed = Math.max(1, Math.min(60, +(q0.get('speed') || 1)));
    this.input.onPause = () => this.togglePause();
    document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode !== 'menu' && !this.paused && !this.busy) this.togglePause(); });
    this.start();
  }

  async start() {
    const el = document.getElementById('loading'), bar = el.querySelector('i');
    try {
      await this.renderer.init();
      await loadAssets((k) => { bar.style.width = Math.round(k * 100) + '%'; });
    } catch (e) { el.querySelector('span').textContent = 'Could not start: ' + (e.message || e); throw e; }
    el.remove();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    this.boot();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.current) { this.current.camera.aspect = innerWidth / innerHeight; this.current.camera.updateProjectionMatrix(); }
  }

  frame() {
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const s = this.current;
    if (!s) return;
    // ?speed=N runs N simulation steps per frame (used by the automated play-through checks)
    if (!this.paused) for (let i = 0; i < this.speed && this.current === s && !this.paused; i++) { this.input.update(); s.tick(dt); }
    s.render();
  }

  // Fade out, tear down the current scene, optionally show story cards, then build the next scene.
  async swap(make, cards, prepare) {
    if (this.busy) return;
    this.busy = true;
    this.ui.closeMenu();
    await this.ui.fade(true);
    if (this.current) { this.current.dispose(); this.current = null; }
    this.paused = false; this.input.clear(); this.ui.hud(false); this.ui.reset();
    if (cards && cards.length && !this.ui.skipCards) {
      this.audio.music('dread');
      const done = this.ui.cards(cards);
      await this.ui.fade(false);
      await done;
      await this.ui.fade(true);
      this.ui.hideCards();
    }
    if (prepare) await prepare(); // e.g. fetch a rival's model while the screen is dark
    this.current = make();
    this.resize();
    this.input.update();
    this.current.tick(0.016);
    await this.ui.fade(false, 700);
    this.busy = false;
  }

  boot() {
    const q = new URLSearchParams(location.search), sc = q.get('scene');
    if (sc === 'glb') return this.swap(() => new GlbView(this, q));
    if (sc === 'view') return this.swap(() => new ViewerScene(this, q), null, () => need(q.get('m')));
    if (sc === 'brawl') { this.botSkill = q.has('bot') ? +(q.get('bot') || 0.75) : 0; return this.startBrawl(q.get('rival') || 'rodan', false, q.get('arena')); }
    const i = CHAPTERS.findIndex((c) => c.id === sc);
    if (i >= 0) return this.startChapter(i, { skipIntro: true, checkpoint: +(q.get('cp') || 0) });
    this.toMenu();
  }

  // ---------- menus ----------
  async toMenu(screen = 'main', cards) {
    await this.swap(() => new MenuScene(this), cards);
    this.mode = 'menu';
    this[screen === 'story' ? 'showStory' : screen === 'brawl' ? 'showBrawl' : 'showMain']();
  }
  showMain() {
    this.ui.menu({
      title: 'GODZILLA<br><em>MINUS ONE</em>', sub: 'An unofficial fan game',
      items: [
        { label: 'Story Mode', small: 'You are Koichi Shikishima. Odo Island to Sagami Bay, 1945–1947.', go: () => this.showStory() },
        { label: 'Kaiju Brawl', small: 'You are Godzilla. Fight Rodan, King Kong, Mechagodzilla and King Ghidorah.', go: () => this.showBrawl() },
        { label: 'How to Play', go: () => this.showHelp() },
        { label: 'Send Feedback', small: 'Report a bug or tell us what you think.', go: () => this.showFeedback(() => this.showMain()) },
        { label: 'Sound: ' + (this.audio.muted ? 'Off' : 'On'), go: () => { this.toggleSound(); this.showMain(); } },
        { label: 'Graphics: ' + (this.lite ? 'Low' : 'High'), small: 'Low turns off bloom and shadows and renders at lower resolution.', go: () => { this.save.set('lite', !this.lite); this.setGraphics(!this.lite); this.toMenu(); } },
      ],
      foot: FOOT,
    });
  }
  // Low: no bloom or shadows, half-resolution rendering. Takes effect on the next scene.
  setGraphics(lite) {
    this.lite = !!lite;
    this.renderer.shadowMap.enabled = !this.lite;
    this.renderer.setPixelRatio(this.lite ? Math.min(devicePixelRatio || 1, 1) * 0.6 : Math.min(devicePixelRatio || 1, 1.5));
    if (this.current) this.resize();
  }
  // What the feedback form attaches: where the player is and what they are running. Nothing personal.
  feedbackContext() {
    const s = this.current, c = { mode: this.mode, graphics: this.lite ? 'low' : 'high', renderer: this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2' };
    if (this.mode === 'story') c.chapter = `${this.chapter + 1} ${CHAPTERS[this.chapter].title}`;
    if (this.mode === 'brawl' && s) { c.rival = s.key; c.arena = s.arena; }
    if (s && s.phase) c.phase = s.phase;
    if (s && this.mode !== 'menu') c.time = s.t.toFixed(0) + 's';
    c.viewport = `${innerWidth}x${innerHeight} @${(devicePixelRatio || 1).toFixed(1)}`;
    c.touch = this.input.isTouch ? 'yes' : 'no';
    c.userAgent = navigator.userAgent;
    c.build = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
    return c;
  }
  showFeedback(done) {
    this.input.clear();
    this.ui.feedback({
      context: this.feedbackContext(), done,
      send: async (payload) => {
        try {
          const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const j = await r.json().catch(() => ({}));
          return r.ok && j.ok ? { ok: true } : { ok: false, error: j.error || 'Could not send (the feedback service is not reachable here).' };
        } catch { return { ok: false, error: 'Could not send. Check your connection and try again.' }; }
      },
    });
  }
  toggleSound() { this.audio.setMuted(!this.audio.muted); this.save.set('muted', this.audio.muted); }
  showHelp() {
    this.ui.menu({
      title: 'How to Play', sub: 'Keyboard and mouse, or touch',
      html: `<table>
        <tr><td>Move / steer / aim</td><td>WASD or arrow keys &nbsp;·&nbsp; left thumb stick on touch</td></tr>
        <tr><td>Main action</td><td>Space, J or left click (fire, claw, dodge)</td></tr>
        <tr><td>Second action</td><td>K or right click (tail sweep)</td></tr>
        <tr><td>Special</td><td>E or L (heat ray, release mine, eject)</td></tr>
        <tr><td>Guard / sprint / boost</td><td>Shift</td></tr>
        <tr><td>Roar</td><td>R</td></tr>
        <tr><td>Pause, switch mode</td><td>Esc or the II button</td></tr>
      </table>`,
      plain: true,
      items: [{ label: 'Back', back: true, go: () => this.showMain() }],
      foot: 'Each scene shows its own controls at the bottom of the screen. Red rings on the ground mark where an attack is about to land: get out of them.',
    });
  }
  showStory() {
    const un = this.save.data.chapter;
    const items = [];
    if (un > 0 && un < CHAPTERS.length) items.push({ label: 'Continue', small: `Chapter ${un + 1}: ${CHAPTERS[un].title}`, go: () => this.startChapter(un) });
    items.push({ label: un > 0 ? 'Start from the beginning' : 'Begin', small: 'Chapter 1: Odo Island, 1945', go: () => this.startChapter(0) });
    CHAPTERS.forEach((c, i) => items.push({ label: `${i + 1}. ${c.title}`, small: i <= un ? `${c.sub} — ${c.blurb}` : 'Locked', disabled: i > un, go: () => this.startChapter(i) }));
    items.push({ label: 'Back', back: true, go: () => this.showMain() });
    this.ui.menu({ title: 'Story Mode', sub: 'Koichi Shikishima', items, grid: true });
  }
  showBrawl() {
    const beat = this.save.data.brawl, arenaName = this.arena ? ARENAS[this.arena].name : 'Rival\'s home ground';
    const items = [{ label: 'Ladder' + (this.save.data.ladder ? ' ✓' : ''), small: 'All four rivals in a row. Some health carries over.', go: () => this.startBrawl(LADDER[0], true) }];
    for (const k of LADDER) items.push({ label: RIVALS[k].name + (beat[k] ? ' ✓' : ''), small: RIVALS[k].tag, go: () => this.startBrawl(k, false, this.arena) });
    items.push({ label: 'Arena: ' + arenaName, small: 'Tap to change', go: () => { const ks = [null, ...Object.keys(ARENAS)]; this.arena = ks[(ks.indexOf(this.arena) + 1) % ks.length]; this.showBrawl(); } });
    items.push({ label: 'Back', back: true, go: () => this.showMain() });
    this.ui.menu({ title: 'Kaiju Brawl', sub: 'You are Godzilla', items, grid: true });
  }

  // ---------- story ----------
  async startChapter(i, o = {}) {
    const ch = CHAPTERS[i];
    this.mode = 'story'; this.chapter = i;
    await this.swap(() => new SCENES[ch.id](this, { index: i, checkpoint: o.checkpoint || 0 }), o.skipIntro ? null : (o.cards || ch.intro));
    if (!o.checkpoint) this.ui.banner(ch.title, ch.sub, 3000);
  }
  chapterDone(i) {
    const next = i + 1;
    this.save.unlock(Math.min(next, CHAPTERS.length - 1));
    if (next < CHAPTERS.length) this.startChapter(next, { cards: [...CHAPTERS[i].outro, ...CHAPTERS[next].intro] });
    else { this.save.set('finished', true); this.audio.music('hope'); this.toMenu('main', ENDING); }
  }
  storyFail(i, text, checkpoint) {
    this.paused = true; this.audio.engineSet(1, 0);
    this.ui.menu({
      title: 'You fell', sub: text, plain: true,
      items: [
        { label: 'Try again', small: checkpoint ? 'From the last checkpoint' : 'From the start of the chapter', go: () => this.startChapter(i, { skipIntro: true, checkpoint }) },
        { label: 'Chapter select', go: () => this.toMenu('story') },
        { label: 'Main menu', go: () => this.toMenu() },
      ],
    });
  }

  // ---------- brawl ----------
  async startBrawl(rival, ladder = false, arena = null, hp) {
    this.mode = 'brawl'; this.ladder = ladder;
    await this.swap(() => new BrawlScene(this, { rival, arena: arena || undefined, hp, diff: ladder ? LADDER.indexOf(rival) : undefined, bot: this.botSkill || 0 }), null, () => need(rival));
  }
  brawlOver(scene, won) {
    const k = scene.key, name = RIVALS[k].name, i = LADDER.indexOf(k);
    this.paused = true;
    if (won) this.save.beat(k);
    if (won && this.ladder && i < LADDER.length - 1) {
      const hp = Math.min(scene.P.max, scene.P.hp + scene.P.max * 0.45), next = LADDER[i + 1];
      return this.ui.menu({ title: 'Victory', sub: `${name} is down. Next: ${RIVALS[next].name}`, items: [{ label: 'Next fight', small: RIVALS[next].tag, go: () => this.startBrawl(next, true, null, hp) }, { label: 'Brawl menu', go: () => this.toMenu('brawl') }] });
    }
    if (won && this.ladder) this.save.set('ladder', true);
    this.ui.menu({
      title: won ? (this.ladder ? 'King of the Monsters' : 'Victory') : 'Defeated',
      sub: won ? (this.ladder ? 'Every rival has fallen.' : `${name} is down.`) : `${name} wins this round.`,
      items: [
        { label: won ? 'Fight again' : 'Try again', go: () => this.startBrawl(k, this.ladder && !won, scene.opts.arena, this.ladder && !won ? scene.opts.hp : undefined) },
        { label: 'Brawl menu', go: () => this.toMenu('brawl') },
        { label: 'Main menu', go: () => this.toMenu() },
      ],
    });
  }

  // ---------- pause ----------
  togglePause() {
    if (this.busy || this.mode === 'menu' || !this.current) return;
    if (this.paused) { if (this.pauseOpen) { this.pauseOpen = false; this.ui.closeMenu(); this.paused = false; } return; }
    this.paused = true; this.pauseOpen = true; this.audio.engineSet(1, 0);
    const story = this.mode === 'story', close = (fn) => () => { this.pauseOpen = false; fn(); };
    this.ui.menu({
      title: 'Paused', sub: story ? `Chapter ${this.chapter + 1}: ${CHAPTERS[this.chapter].title}` : 'Kaiju Brawl',
      items: [
        { label: 'Resume', go: () => this.togglePause() },
        { label: story ? 'Restart chapter' : 'Restart fight', go: close(() => (story ? this.startChapter(this.chapter, { skipIntro: true }) : this.startBrawl(this.current.key, this.ladder, this.current.opts.arena, this.current.opts.hp))) },
        { label: story ? 'Switch to Kaiju Brawl' : 'Switch to Story Mode', small: story ? 'Play as Godzilla. Your story progress is kept.' : 'Play as Koichi.', go: close(() => this.toMenu(story ? 'brawl' : 'story')) },
        { label: 'Send feedback', small: 'Report a bug or tell us what you think.', go: () => this.showFeedback(() => { this.pauseOpen = false; this.paused = false; this.togglePause(); }) },
        { label: 'Sound: ' + (this.audio.muted ? 'Off' : 'On'), go: () => { this.toggleSound(); this.pauseOpen = false; this.paused = false; this.togglePause(); } },
        { label: 'Main menu', go: close(() => this.toMenu()) },
      ],
    });
  }
}

window.__game = new Game();
