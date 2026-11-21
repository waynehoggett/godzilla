// Dev tool (/?scene=brawl&rival=kong&bot): plays Godzilla with roughly human reactions so fights can
// be measured for length and fairness. It stands in for the Input object the scene normally reads.
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Bot {
  constructor(scene, skill = 0.75) {
    this.S = scene; this.skill = skill; this.move = { x: 0, y: 0 }; this.down = {}; this.pressed = {};
    this.seen = 0; this.strafe = 1; this.strafeT = 0; this.tapT = 0; this.isTouch = false; this.tapFire = false;
  }
  held(n) { return !!this.down[n]; }
  hit(n) { return !!this.pressed[n]; }
  clear() {}
  update(dt) {
    const S = this.S, P = S.P, R = S.R;
    this.pressed = {}; this.move.x = 0; this.move.y = 0; this.down.d = false;
    if (S.phase !== 'fight') { this.down.c = false; return; }
    const dist = flat(P.pos, R.pos), reach = dist - R.radius;
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = 1 + Math.random() * 2; }
    this.tapT -= dt;
    const tap = (b) => { if (this.tapT <= 0) { this.pressed[b] = true; this.tapT = 0.09; } };

    // --- threats (noticed after a short reaction delay, and not always) ---
    const A = R.state === 'attack' ? R.atk : null, ph = A ? (R.st < A.wind ? 0 : R.st < A.wind + A.act ? 1 : 2) : -1;
    let threat = null;
    if (A && ph <= 1) {
      const d = A.d;
      if ((d.type === 'melee' || d.type === 'dive') && A.warned && flat(P.pos, A.target) < d.r + 5) threat = 'strike';
      if (d.type === 'gust' && dist < d.r) threat = 'gust';
      if (d.type === 'beam') threat = 'beam';
    }
    for (const s of S.shots) if (s.warned && flat(P.pos, s.target) < s.r + 6) threat = 'strike';
    this.seen = threat ? this.seen + dt : 0;
    const reacting = threat && this.seen > 0.22 - this.skill * 0.1 && (this.react ??= Math.random() < 0.55 + this.skill * 0.4);
    if (!threat) this.react = undefined;
    if (reacting) {
      this.down.c = false;
      if (threat === 'gust') { this.down.d = true; return; }
      this.move.x = this.strafe; this.move.y = threat === 'beam' ? 0 : -0.4;
      if (threat === 'strike' && P.dashCd <= 0 && P.state === 'idle') this.pressed.d = true;
      else if (threat === 'beam' && dist > 80) this.down.d = false;
      return;
    }

    // --- offence ---
    const open = R.state === 'down' || R.state === 'land' || R.state === 'flinch' || (A && ph === 2);
    if (this.down.c) { if (P.charge >= 0.85 || P.state !== 'charge') this.down.c = false; return; }
    if (R.alt > 24) {
      if (P.energy >= 60 && dist < 380 && P.state === 'idle') { this.down.c = true; return; }
      if (P.roarCd <= 0 && dist < 125) { tap('e'); return; }
      this.move.x = this.strafe * 0.7; this.move.y = dist > 90 ? 0.8 : -0.2;
      return;
    }
    if (reach > 27) {
      if (P.energy >= 85 && reach > 90 && P.state === 'idle' && Math.random() < dt * 0.6) { this.down.c = true; return; }
      this.move.y = 1; this.move.x = open ? 0 : this.strafe * 0.25;
      return;
    }
    // in range: combo, and finish with the tail when the rival is reeling
    if (P.state === 'bite' && P.hitDone && (open || R.poise < 35)) tap('b');
    else tap('a');
  }
}
