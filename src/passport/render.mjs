// Voice Passport renderers: one offline HTML file (Ink palette, one accent for what you can act on,
// status by ink weight, springs from face/lib/fluid.js inlined) and a script-free SVG for a README or a
// post. Every value is escaped. The page loads nothing: its Content-Security-Policy allows only inline
// styles, data: images and the one inline script, by hash.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { escapeHtml } from '../util.mjs';

const FLUID = fs.readFileSync(new URL('../../face/lib/fluid.js', import.meta.url), 'utf8').replace(/<\/script/gi, '<\\/script');

const COVERAGE_CHIP = { supported: 'l2', partial: 'l1', limited: 'l0' };
const COVERAGE_TEXT = { supported: 'Well covered', partial: 'Partly covered', limited: 'Thin evidence' };
const BAND_TEXT = { '<100': 'Fewer than 100 messages', '100–499': '100 to 499 messages', '500+': '500 or more messages' };

const traits = (r) => `${r.length} · ${r.casing} · ${r.punctuation} punctuation`;

const PAGE_SCRIPT = `
(function () {
  var btn = document.getElementById('what-toggle');
  var body = document.getElementById('what-body');
  var inner = body.firstElementChild;
  var open = false;
  Fluid.pressable(btn);
  var h = Fluid.spring({ value: 0, response: 0.35, damping: 1, epsilon: 0.5, onUpdate: function (x) {
    body.style.height = Math.max(0, x) + 'px';
    inner.style.opacity = String(Math.min(1, Math.max(0, x / (inner.offsetHeight || 1))));
  }, onRest: function (x) { if (!open) body.hidden = true; else body.style.height = 'auto'; } });
  btn.addEventListener('click', function () {
    open = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) body.hidden = false;
    var target = open ? inner.offsetHeight : 0;
    if (Fluid.reduce()) { body.style.height = open ? 'auto' : '0px'; inner.style.opacity = '1'; if (!open) body.hidden = true; return; }
    if (body.style.height === 'auto') h.set(inner.offsetHeight);
    h.to(target);
  });
})();
`;

const CSS = `
:root {
  --bg: #f7f7f5; --surface: #ffffff; --surface-2: #f0f0ed; --line: #e3e3df; --line-strong: #c9c9c3;
  --ink: #111110; --ink-2: #3a3a37; --muted: #6f6f69; --faint: #a3a39c;
  --accent: #0065fd; --accent-press: #0654c8; --accent-soft: rgba(0,101,253,.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e0e0d; --surface: #171716; --surface-2: #1f1f1d; --line: #2b2b29; --line-strong: #3d3d3a;
    --ink: #f4f4f2; --ink-2: #d6d6d2; --muted: #9a9a94; --faint: #6a6a65;
    --accent: #5b9cff; --accent-press: #3f86ff; --accent-soft: rgba(91,156,255,.14);
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
main { max-width: 640px; margin: 0 auto; }
.eyebrow { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 4px; }
h1 { font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.01em; margin: 0 0 6px; }
.lede { color: var(--ink-2); margin: 0 0 24px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 24px; }
.card-head { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; justify-content: space-between; }
.card h2 { font-size: 1.375rem; line-height: 1.25; margin: 0; }
.disclaimer { color: var(--ink-2); margin: 8px 0 16px; font-size: .9375rem; }
.chip { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: .8125rem; line-height: 1.5; white-space: nowrap; font-variant-numeric: tabular-nums; }
.l3 { background: var(--ink); color: var(--bg); }
.l2 { border: 1.5px solid var(--ink); color: var(--ink); padding: 0.5px 8.5px; }
.l1 { background: var(--surface-2); color: var(--muted); }
.l0 { border: 1px dashed var(--line-strong); color: var(--muted); padding: 1px 9px; }
h3 { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 24px 0 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
ul.registers, ul.habits, ul.notes { list-style: none; margin: 0; padding: 0; }
ul.registers li { display: grid; grid-template-columns: 1fr auto; align-content: start; gap: 2px 12px; padding: 10px 0; border-top: 1px solid var(--line); }
ul.registers li:first-child { border-top: 0; }
.reg-name { font-weight: 600; }
.traits { grid-column: 1 / -1; color: var(--muted); font-size: .875rem; }
ul.registers .chip { align-self: start; justify-self: end; }
ul.habits li, ul.notes li { padding: 4px 0 4px 18px; position: relative; color: var(--ink-2); }
ul.habits li::before, ul.notes li::before { content: ""; position: absolute; left: 2px; top: 13px; width: 6px; height: 6px; border-radius: 50%; background: var(--ink); }
ul.notes li::before { background: transparent; border: 1.5px solid var(--muted); }
.digest { margin: 24px 0 0; color: var(--muted); font-size: .8125rem; overflow-wrap: anywhere; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .8125rem; background: var(--surface-2); border-radius: 4px; padding: 1px 4px; }
.empty { border: 1px dashed var(--line-strong); border-radius: 10px; padding: 16px; color: var(--muted); }
.more { margin-top: 24px; }
.toggle { font: inherit; font-weight: 600; color: var(--accent); background: transparent; border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 14px; cursor: pointer; transition: background-color .15s; }
.toggle:hover { background: var(--accent-soft); }
.toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.disclosure { overflow: hidden; height: 0; }
.disclosure > div { padding-top: 12px; }
.disclosure p { color: var(--ink-2); margin: 12px 0 0; }
footer { margin-top: 32px; color: var(--muted); font-size: .8125rem; }
html.png-mode body { padding: 0; background: var(--bg); }
html.png-mode main { max-width: none; }
html.png-mode .top, html.png-mode .more, html.png-mode footer { display: none; }
html.png-mode .card { width: 600px; height: 600px; overflow: hidden; border-radius: 0; border: 0; padding: 28px; font-size: 14px; }
html.png-mode .card h2 { font-size: 1.25rem; }
html.png-mode .disclaimer { margin: 6px 0 12px; font-size: .875rem; }
html.png-mode h3 { margin: 16px 0 4px; }
html.png-mode ul.registers { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; }
html.png-mode ul.registers li { padding: 7px 0; gap: 0 8px; }
html.png-mode ul.registers li:nth-child(2) { border-top: 0; }
html.png-mode .reg-name { font-size: .875rem; }
html.png-mode .traits { font-size: .6875rem; }
html.png-mode .chip { font-size: .6875rem; }
html.png-mode ul.habits li { padding: 2px 0 2px 16px; font-size: .875rem; }
html.png-mode ul.habits li::before { top: 10px; }
html.png-mode .digest { margin-top: 14px; font-size: .6875rem; }
@media (min-width: 1200px) { main { max-width: 720px; } }
`;

function cardHtml(p) {
  const name = p.displayName || p.title;
  const regs = p.registers.length
    ? `<ul class="registers">${p.registers
        .map((r) => `<li data-register="${escapeHtml(r.id)}" data-coverage="${escapeHtml(r.coverage)}"><span class="reg-name">${escapeHtml(r.label)}</span><span class="chip ${COVERAGE_CHIP[r.coverage]}">${escapeHtml(COVERAGE_TEXT[r.coverage])}</span><span class="traits">${escapeHtml(traits(r))}</span></li>`)
        .join('')}</ul>`
    : `<p class="empty" data-status="insufficient_data">Not enough data for a card: a public card needs ${escapeHtml('100')} or more training messages, and a register needs 30 messages in 10 conversations.</p>`;
  const habits = p.habits.length ? `<ul class="habits">${p.habits.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : '<p class="empty">No habit passes the fixed thresholds.</p>';
  const privacy = p.audience === 'public' ? 'Public card · no message text' : 'Private view · for this computer';
  return `<section class="card" id="card" aria-labelledby="card-title" data-audience="${escapeHtml(p.audience)}" data-status="${escapeHtml(p.status)}">
<div class="card-head"><h2 id="card-title">${escapeHtml(name)}</h2><span class="chip l2" data-privacy="${escapeHtml(p.audience)}">${escapeHtml(privacy)}</span></div>
<p class="disclaimer">${escapeHtml(p.disclaimer)}</p>
<div class="meta"><span class="chip l1" data-evidence="${escapeHtml(p.evidenceBand)}">${escapeHtml(BAND_TEXT[p.evidenceBand])}</span><span class="chip l1">${p.registers.length} of 7 registers</span></div>
<h3>Registers</h3>
${regs}
<h3>Habits</h3>
${habits}
<p class="digest">Projection digest <code>${escapeHtml(p.projectionDigest)}</code></p>
</section>`;
}

function detailsHtml(p) {
  if (p.audience !== 'private' || !p.details) return '';
  const rows = Object.entries(p.details.channels)
    .map(([id, c]) => `<li><span class="reg-name">${escapeHtml(id)}</span><span class="chip ${c.confidence === 'high' ? 'l2' : c.confidence === 'medium' ? 'l1' : 'l0'}">${escapeHtml(c.confidence)}</span><span class="traits">${c.messageCount} messages, ${c.threadCount} conversations${c.fallback ? `, blended with ${escapeHtml(c.fallback)}` : ''}; median ${c.medianWords} words, ${Math.round(c.lowercaseStartRate * 100)}% lowercase starts, ${Math.round(c.endPunctRate * 100)}% end in punctuation</span></li>`)
    .join('');
  return `<section class="card" style="margin-top:24px" aria-labelledby="private-title"><h2 id="private-title">Private Detail</h2><p class="disclaimer">${p.details.trainMessages} training messages. Exact counts appear only in this private view; never share it.</p><ul class="registers">${rows}</ul></section>`;
}

export function scriptHash(script) {
  return `sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}`;
}

export function passportHtml(p) {
  const script = `${FLUID}\n${PAGE_SCRIPT}`;
  const csp = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src '${scriptHash(script)}'; base-uri 'none'; form-action 'none'`;
  const notes = p.privacy.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<link rel="icon" href="data:,">
<title>Voice Passport</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header class="top"><p class="eyebrow">selfclone</p><h1>Voice Passport</h1><p class="lede">Coarse writing tendencies measured on this computer from the writer's own opted-in exports. Surface style only.</p></header>
${cardHtml(p)}
${detailsHtml(p)}
<section class="more">
<button class="toggle" id="what-toggle" type="button" aria-expanded="false" aria-controls="what-body">What this card leaves out</button>
<div class="disclosure" id="what-body" hidden><div><ul class="notes">${notes}</ul><p>Every value is rounded into a few buckets, channels with little evidence are left out, and the habits come from a fixed list of phrases with fixed thresholds. These are heuristics against casual leaks, not a formal anonymity guarantee, and the card is not proof of who wrote anything.</p></div></div>
</section>
<footer>Made with selfclone ${escapeHtml(p.generatedBy.replace(/^selfclone\//, ''))}. One offline file: it loads nothing and sends nothing.</footer>
</main>
<script>${script}</script>
</body>
</html>
`;
}

const xml = (s) => escapeHtml(s);

/** A script-free square SVG of the card (light palette), for a README or a social post. */
export function passportSvg(p) {
  const W = 600;
  const L = [];
  let y = 56;
  L.push(`<text x="32" y="${y}" font-size="24" font-weight="600" fill="#111110">${xml(p.displayName || p.title)}</text>`);
  y += 28;
  L.push(`<text x="32" y="${y}" font-size="14" fill="#3a3a37">${xml(p.disclaimer)}</text>`);
  y += 30;
  const chip = p.audience === 'public' ? 'Public card · no message text' : 'Private view · for this computer';
  L.push(`<rect x="32" y="${y - 16}" width="${chip.length * 7.2 + 20}" height="24" rx="12" fill="none" stroke="#111110" stroke-width="1.5"/><text x="42" y="${y + 1}" font-size="13" fill="#111110">${xml(chip)}</text>`);
  y += 40;
  L.push(`<text x="32" y="${y}" font-size="12" font-weight="600" letter-spacing="0.7" fill="#6f6f69">REGISTERS · ${xml(BAND_TEXT[p.evidenceBand].toUpperCase())}</text>`);
  y += 10;
  for (const r of p.registers) {
    y += 34;
    L.push(`<text x="32" y="${y}" font-size="15" font-weight="600" fill="#111110">${xml(r.label)}</text><text x="568" y="${y}" font-size="13" text-anchor="end" fill="#6f6f69">${xml(COVERAGE_TEXT[r.coverage])}</text>`);
    L.push(`<text x="32" y="${y + 17}" font-size="13" fill="#6f6f69">${xml(traits(r))}</text>`);
    y += 12;
  }
  y += 36;
  L.push(`<text x="32" y="${y}" font-size="12" font-weight="600" letter-spacing="0.7" fill="#6f6f69">HABITS</text>`);
  for (const h of p.habits.slice(0, 3)) {
    y += 24;
    L.push(`<circle cx="36" cy="${y - 5}" r="3" fill="#111110"/><text x="48" y="${y}" font-size="14" fill="#3a3a37">${xml(h)}</text>`);
  }
  const H = Math.max(W, y + 56);
  L.push(`<text x="32" y="${H - 24}" font-size="11" fill="#6f6f69" font-family="ui-monospace, Menlo, Consolas, monospace">${xml(p.projectionDigest)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" role="img" aria-label="Voice Passport: ${xml(p.title)}">
<rect width="${W}" height="${H}" fill="#ffffff"/>
${L.join('\n')}
</svg>
`;
}
