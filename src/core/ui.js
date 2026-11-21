// DOM overlay: HUD, subtitles, title cards, menus and touch buttons.
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(input, audio) {
    this.input = input; this.audio = audio;
    this.skipCards = new URLSearchParams(location.search).has('skip');
    this.subT = 0; this.bannerT = 0; this.menuOpen = false;
    addEventListener('keydown', (e) => {
      if (!this.menuOpen || /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
      const btns = [...$('screen').querySelectorAll('button:not(:disabled)')];
      const i = btns.indexOf(document.activeElement);
      if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { btns[(i + 1) % btns.length]?.focus(); e.preventDefault(); }
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { btns[(i - 1 + btns.length) % btns.length]?.focus(); e.preventDefault(); }
    });
  }

  hud(on) { $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !on || !this.input.isTouch); }

  reset() {
    this.objective(''); this.bar('L', null); this.bar('R', null); this.meter(null); this.prompt(null);
    this.reticle(null); this.marker(null); this.timing(null); this.controls([], ''); this.vignette(0);
    $('subtitle').classList.remove('on'); $('banner').classList.remove('on');
  }

  objective(t) { $('objective').textContent = t || ''; }

  bar(side, name, v, v2) {
    const el = $('bar' + side);
    el.classList.toggle('off', name == null);
    if (name == null) return;
    el.querySelector('.barname').textContent = name;
    el.querySelector('.hp i').style.width = Math.max(0, Math.min(1, v)) * 100 + '%';
    const en = el.querySelector('.en');
    if (en) { en.classList.toggle('off', v2 == null); if (v2 != null) en.firstElementChild.style.width = Math.max(0, Math.min(1, v2)) * 100 + '%'; }
  }

  meter(label, v, color) {
    const el = $('meter');
    el.style.display = label == null ? 'none' : 'block';
    if (label == null) return;
    el.querySelector('span').textContent = label;
    const i = el.querySelector('i');
    i.style.width = Math.max(0, Math.min(1, v)) * 100 + '%';
    i.style.background = color || '';
  }

  subtitle(who, text, dur = 3.6) {
    const el = $('subtitle');
    el.innerHTML = (who ? `<b>${who}</b>` : '') + text;
    el.classList.add('on');
    clearTimeout(this.subT);
    this.subT = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }

  prompt(text, danger) { const el = $('prompt'); el.textContent = text || ''; el.classList.toggle('danger', !!danger); }

  reticle(x, y, hot) {
    const el = $('reticle');
    if (x == null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = (x * 0.5 + 0.5) * 100 + '%'; el.style.top = (-y * 0.5 + 0.5) * 100 + '%';
    el.classList.toggle('hot', !!hot);
  }

  marker(x, y, text, ok) {
    const el = $('marker');
    if (x == null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = (x * 0.5 + 0.5) * 100 + '%'; el.style.top = (-y * 0.5 + 0.5) * 100 + '%';
    el.querySelector('span').textContent = text || '';
    el.classList.toggle('ok', !!ok);
  }

  timing(p, z0, z1) {
    const el = $('timing');
    if (p == null) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const zone = el.querySelector('.zone');
    zone.style.left = z0 * 100 + '%'; zone.style.width = (z1 - z0) * 100 + '%';
    el.querySelector('.cursor').style.left = p * 100 + '%';
  }

  // list: [{ b: 'a', label: 'Fire', key: 'Space' }]
  controls(list, moveHint) {
    const wrap = $('btns'); wrap.innerHTML = '';
    for (const c of list) {
      const el = document.createElement('button');
      el.className = 'b' + c.b; el.textContent = c.label;
      this.input.bindButton(el, c.b);
      wrap.appendChild(el);
    }
    const move = moveHint === undefined ? 'Move' : moveHint;
    $('hint').innerHTML = (move ? `<kbd>WASD</kbd>${move}` : '') +
      list.map((c) => `<kbd>${c.key}</kbd>${c.label}`).join('') + (list.length ? '<kbd>Esc</kbd>Pause' : '');
  }

  flash(color = '#fff', ms = 600, peak = 1) {
    const el = $('flash');
    el.style.transition = 'none'; el.style.background = color; el.style.opacity = peak;
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms ease-out`; el.style.opacity = 0;
  }

  vignette(v) { $('vignette').style.opacity = v; }

  async fade(black, ms = 500) {
    const el = $('fade');
    el.style.transitionDuration = ms + 'ms';
    el.style.opacity = black ? 1 : 0;
    await wait(ms + 30);
  }

  banner(title, sub = '', ms = 2600) {
    const el = $('banner');
    el.querySelector('h2').textContent = title; el.querySelector('p').textContent = sub;
    el.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => el.classList.remove('on'), ms);
  }

  // Full-screen story cards. Resolves when the last one is dismissed.
  cards(list) {
    const el = $('cards');
    if (!list || !list.length || this.skipCards) return Promise.resolve();
    return new Promise((resolve) => {
      let i = -1, shownAt = 0;
      const card = el.querySelector('.card');
      const show = () => {
        i++;
        if (i >= list.length) { el.removeEventListener('pointerup', next); removeEventListener('keydown', key); resolve(); return; }
        const c = list[i];
        card.querySelector('h3').textContent = c.h || '';
        card.querySelector('p').textContent = c.t || '';
        card.querySelector('small').textContent = c.s || '';
        card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
        shownAt = performance.now();
      };
      const next = () => { if (performance.now() - shownAt > 450) { this.audio.click(); show(); } };
      const key = (e) => { if (['Space', 'Enter', 'KeyJ', 'KeyE'].includes(e.code)) next(); };
      el.classList.remove('hidden');
      el.addEventListener('pointerup', next); addEventListener('keydown', key);
      show();
    });
  }
  hideCards() { $('cards').classList.add('hidden'); }

  // opts: { title, sub, plain, items:[{label, small, disabled, go}], grid, foot, html }
  menu(opts) {
    const el = $('screen');
    el.innerHTML = '';
    const add = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; n.innerHTML = html; el.appendChild(n); return n; };
    if (opts.title) add('h1', '', opts.title);
    if (opts.sub) add('div', 'sub' + (opts.plain ? ' plain' : ''), opts.sub);
    if (opts.html) add('div', '', opts.html);
    const items = add('div', 'items' + (opts.grid ? ' grid' : ''), '');
    let first = null;
    for (const it of opts.items) {
      const b = document.createElement('button');
      if (it.back) b.className = 'back';
      b.innerHTML = it.label + (it.small ? `<small>${it.small}</small>` : '');
      b.disabled = !!it.disabled;
      b.addEventListener('click', () => { this.audio.click(); it.go(); });
      (it.back && opts.grid ? el : items).appendChild(b);
      if (!first && !it.disabled) first = b;
    }
    if (opts.foot) add('div', 'foot', opts.foot);
    el.classList.remove('hidden');
    el.scrollTop = 0;
    this.menuOpen = true;
    if (first && !this.input.isTouch) first.focus();
  }

  // Feedback form. opts: { context: {k: v}, send(payload) -> Promise<{ok, error?}>, done() }
  feedback(opts) {
    const el = $('screen'), esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = `<h1>Send feedback</h1>
      <div class="sub plain">Tell us what broke, what felt off, or what you would like to see.</div>
      <form class="fb" novalidate>
        <div class="fbcat">
          <label><input type="radio" name="cat" value="bug" checked><span>Something broke</span></label>
          <label><input type="radio" name="cat" value="idea"><span>Idea</span></label>
          <label><input type="radio" name="cat" value="other"><span>Other</span></label>
        </div>
        <textarea name="message" maxlength="2000" rows="6" placeholder="What happened? What did you expect?"></textarea>
        <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <details><summary>What is sent with your message</summary><pre>${Object.entries(opts.context).map(([k, v]) => esc(k + ': ' + v)).join('\n')}</pre><p>No name, email or location is collected.</p></details>
        <div class="fbstatus" role="status"></div>
        <div class="fbrow"><button type="submit">Send</button><button type="button" class="back">Cancel</button></div>
      </form>`;
    const form = el.querySelector('form'), status = el.querySelector('.fbstatus'), text = form.message, sendBtn = form.querySelector('[type=submit]');
    form.querySelector('.back').addEventListener('click', () => { this.audio.click(); opts.done(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = text.value.trim();
      if (message.length < 5) { status.textContent = 'Please write a little more.'; text.focus(); return; }
      sendBtn.disabled = true; status.textContent = 'Sending…';
      const r = await opts.send({ category: form.cat.value, message, website: form.website.value, context: opts.context });
      if (r.ok) { status.textContent = 'Thank you — your feedback was sent.'; setTimeout(() => opts.done(), 1400); }
      else { status.textContent = r.error || 'Could not send. Please try again.'; sendBtn.disabled = false; }
    });
    el.classList.remove('hidden'); el.scrollTop = 0; this.menuOpen = true;
    text.focus();
  }

  closeMenu() { $('screen').classList.add('hidden'); this.menuOpen = false; }
}
