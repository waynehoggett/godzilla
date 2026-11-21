// Rig liveness check: every fighter's limbs must actually move when idle, walking and attacking.
// Run the dev server (npm run dev), then: node tools/rig-check.cjs [http://localhost:5173]
// Needs Playwright (npx playwright install chromium). Exits non-zero if any rig is frozen.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5173';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const errs = []; page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); }); page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
  let failed = 0;
  for (const m of ['godzilla', 'kong', 'mecha', 'ghidorah', 'rodan']) {
    errs.length = 0;
    await page.goto(BASE + '/?lite&scene=view&m=' + m);
    await page.waitForFunction(() => window.__game && window.__game.current && window.__game.current.m, null, { timeout: 180000 });
    const res = await page.evaluate(async () => {
      const s = __game.current, model = s.m, V = s.camera.position.constructor; __game.paused = true;
      const bones = []; model.root.traverse((o) => { if (o.isBone && /hand|foot|wing_[lr]00[38]|wing_[lr]005|head|jaw|tail/i.test(o.name) && !/end/i.test(o.name)) bones.push(o); });
      // how far the tracked bones travel (model units) over `secs` of animation
      const travel = (secs, each) => { let d = 0; const last = bones.map((b) => b.getWorldPosition(new V())); for (let t = 0; t < secs; t += 1 / 30) { if (each) each(t); model.update(1 / 30, 4); model.root.updateMatrixWorld(true); bones.forEach((b, i) => { const p = b.getWorldPosition(new V()); d += p.distanceTo(last[i]); last[i].copy(p); }); } return +(d / bones.length).toFixed(2); };
      const out = { bones: bones.length };
      Object.assign(model.set, { walk: 0, speed: 0 }); out.idle = travel(2);
      Object.assign(model.set, { walk: 1, speed: 25 }); out.walk = travel(2);
      Object.assign(model.set, { walk: 0, speed: 0 });
      const moves = model.moves ? Object.keys(model.moves) : ['claw1', 'claw2', 'bite', 'tail', 'roar'];
      out.moves = {}; for (const id of moves) { model.move(id); travel(0.2); /* skip the cross-fade into the move */ out.moves[id] = travel(0.9); if (model.stop) model.stop(); else model.rig.stop(); travel(0.4); }
      if (model.set.fly !== undefined) { model.set.fly = 1; model.set.flap = 1; out.flying = travel(2); model.set.dive = 1; out.dive = travel(1); model.set.dive = 0; model.set.fly = 0; out.standing = travel(2); }
      return out;
    });
    const vals = [res.idle, res.walk, ...Object.values(res.moves), ...(res.flying !== undefined ? [res.flying] : [])];
    const procedural = m === 'rodan';
    const bad = [];
    if (!(res.bones >= 4)) bad.push('too few tracked bones');
    if (!procedural) { if (res.idle < 0.15) bad.push('idle is frozen'); if (res.walk < 1) bad.push('walk is frozen'); for (const [k, v] of Object.entries(res.moves)) if (v < 0.5) bad.push(`move ${k} is frozen`); }
    else { if (res.flying < 3) bad.push('wings do not flap'); if (res.standing < 0.1) bad.push('standing is frozen'); }
    if (bad.length || errs.length) failed++;
    console.log((bad.length || errs.length ? 'FAIL ' : 'ok   ') + m, JSON.stringify(res), bad.join('; '), errs.join(' | '));
  }
  console.log(failed ? `LIVENESS: ${failed} FAILED` : 'LIVENESS: PASS');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
