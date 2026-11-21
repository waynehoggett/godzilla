// Vercel serverless function: receives player feedback from the game.
// Every report is written to the function log. If GITHUB_TOKEN is set (a fine-grained token with
// "Issues: read and write" on the repo), it is also filed as a GitHub issue labelled player-feedback.
//   GITHUB_TOKEN   optional  token used to create issues
//   FEEDBACK_REPO  optional  "owner/name", defaults to waynehoggett/godzilla

const CATEGORIES = ['bug', 'idea', 'other'];
const CONTEXT_KEYS = ['mode', 'chapter', 'rival', 'arena', 'phase', 'time', 'graphics', 'renderer', 'viewport', 'touch', 'userAgent', 'build'];
const WINDOW_MS = 10 * 60 * 1000, LIMIT = 5;
const hits = new Map(); // best effort: lives as long as this function instance does

export function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON body.' };
  if (body.website) return { error: 'Rejected.' }; // honeypot field, hidden from people
  const category = CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) return { error: 'Unknown category.' };
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < 5) return { error: 'Please write a little more.' };
  if (message.length > 2000) return { error: 'Please keep it under 2000 characters.' };
  const context = {};
  if (body.context && typeof body.context === 'object') {
    for (const k of CONTEXT_KEYS) {
      const v = body.context[k];
      if (v !== undefined && v !== null && v !== '') context[k] = String(v).replace(/[\r\n|`]/g, ' ').slice(0, 200);
    }
  }
  return { category, message, context };
}

export function limited(ip, now = Date.now()) {
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function issuePayload({ category, message, context }) {
  const first = message.split('\n')[0].slice(0, 60);
  // keep player text from pinging people or closing the table
  const safe = message.replace(/@/g, '@\u200b');
  const rows = Object.entries(context).map(([k, v]) => `| ${k} | \`${v}\` |`).join('\n');
  return {
    title: `[Feedback/${category}] ${first}${message.length > first.length ? '…' : ''}`,
    body: `${safe}\n\n---\n| | |\n| --- | --- |\n${rows || '| context | none |'}\n\n_Sent from the in-game feedback form._`,
    labels: ['player-feedback', category],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'POST only.' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (body && JSON.stringify(body).length > 8192) return res.status(413).json({ ok: false, error: 'Too large.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'Too many reports from this connection. Try again in a few minutes.' });
  const v = validate(body);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  console.log('[feedback]', JSON.stringify({ at: new Date().toISOString(), ...v }));

  const token = process.env.GITHUB_TOKEN, repo = process.env.FEEDBACK_REPO || 'waynehoggett/godzilla';
  if (!token) return res.status(200).json({ ok: true, stored: 'log' });
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'godzilla-fan-game-feedback', 'Content-Type': 'application/json' },
      body: JSON.stringify(issuePayload(v)),
    });
    if (!r.ok) { console.error('[feedback] GitHub refused the issue:', r.status, (await r.text()).slice(0, 300)); return res.status(200).json({ ok: true, stored: 'log' }); }
    const issue = await r.json();
    return res.status(200).json({ ok: true, stored: 'issue', issue: issue.number });
  } catch (e) {
    console.error('[feedback] could not reach GitHub:', e && e.message);
    return res.status(200).json({ ok: true, stored: 'log' });
  }
}
