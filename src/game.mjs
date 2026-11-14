// "Can You Tell?" game: a self-contained offline HTML page. Each round shows
// the message someone sent, then two replies: the real one and the clone's.
// The player picks the real one. Order is seeded so the page is reproducible.
import fs from 'node:fs';
import { rng, shuffle, jsonForScript, escapeHtml } from './util.mjs';

// Springs and press feedback (face/lib/fluid.js), inlined so the page stays one offline file.
const FLUID = fs.readFileSync(new URL('../face/lib/fluid.js', import.meta.url), 'utf8').replace(/<\/script/gi, '<\\/script');

export function buildRounds({ sealed, clone, rounds = 10, seed = 'selfclone' }) {
  const cloneMap = clone instanceof Map ? clone : new Map(Object.entries(clone || {}));
  const rand = rng(`${seed}:game`);
  const pool = shuffle(sealed.filter((s) => cloneMap.has(s.id) && s.context), rand);
  return pool.slice(0, rounds).map((s) => {
    const realFirst = rand() < 0.5;
    const real = s.reply;
    const fake = cloneMap.get(s.id);
    return {
      id: s.id,
      context: s.context,
      replies: realFirst ? [real, fake] : [fake, real],
      real: realFirst ? 0 : 1,
    };
  });
}

export function gameHtml({ rounds, name = 'this person', title } = {}) {
  const pageTitle = title || `Can You Tell? ${name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<title>${escapeHtml(pageTitle)}</title>
<style>
:root {
  --bg: #f7f7f5; --surface: #ffffff; --surface-2: #f0f0ed; --line: #e3e3df; --line-strong: #c9c9c3;
  --ink: #111110; --ink-2: #3a3a37; --muted: #6f6f69; --faint: #a3a39c;
  --accent: #0065fd; --accent-press: #0654c8; --on-accent: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e0e0d; --surface: #171716; --surface-2: #1f1f1d; --line: #2b2b29; --line-strong: #3d3d3a;
    --ink: #f4f4f2; --ink-2: #d6d6d2; --muted: #9a9a94; --faint: #6a6a65;
    --accent: #5b9cff; --accent-press: #3f86ff; --on-accent: #0e0e0d;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body {
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  -webkit-tap-highlight-color: transparent;
}
::selection { background: var(--accent); color: var(--on-accent); }
main { max-width: 640px; margin: 0 auto; }
h1 { font-size: 1.75rem; line-height: 1.2; letter-spacing: -0.01em; margin: 0 0 6px; }
.sub { color: var(--muted); margin: 0; }
.bar { display: flex; justify-content: space-between; align-items: baseline; color: var(--muted); font-size: .875rem; margin: 20px 0 8px; font-variant-numeric: tabular-nums; }
.progress { height: 3px; background: var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 24px; }
.progress > i { display: block; height: 100%; width: 100%; background: var(--ink); transform-origin: 0 50%; transform: scaleX(0); }
#game { will-change: transform, opacity; }
.label { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 6px; }
.them {
  background: var(--surface-2); border-radius: 10px 10px 10px 4px; padding: 12px 14px;
  white-space: pre-wrap; overflow-wrap: anywhere; margin-bottom: 24px;
}
.choices { display: grid; gap: 12px; }
button.reply {
  all: unset; box-sizing: border-box; display: block; width: 100%; cursor: pointer;
  background: var(--surface); color: var(--ink); border: 1px solid var(--line);
  border-radius: 10px 10px 4px 10px; padding: 12px 16px;
  transition: border-color .15s, box-shadow .15s;
}
button.reply .text { display: block; white-space: pre-wrap; overflow-wrap: anywhere; }
button.reply:hover { border-color: var(--line-strong); }
button.reply:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button.reply[disabled] { cursor: default; }
button.reply[disabled]:hover { border-color: var(--line); }
button.reply[data-picked], button.reply[data-picked]:hover { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
.meta { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.chip {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 20px; padding: 0 9px;
  border-radius: 999px; font-size: .75rem; font-weight: 600; letter-spacing: .02em; line-height: 1; white-space: nowrap;
}
.l3 { background: var(--ink); color: var(--bg); }
.l2 { border: 1.5px solid var(--ink); color: var(--ink); padding: 0 8px; }
.chip.glyph { width: 20px; padding: 0; }
.chip svg, .ok svg { width: 12px; height: 12px; }
.ok { display: inline-flex; color: var(--muted); }
.ok svg { width: 16px; height: 16px; }
.mine { font-size: .8125rem; color: var(--muted); }
.verdict { display: flex; align-items: center; gap: 8px; min-height: 1.6em; margin: 14px 0 10px; font-weight: 600; }
.next, .again {
  all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; height: 40px; padding: 0 18px;
  background: var(--accent); color: var(--on-accent); border-radius: 6px; font-weight: 600; transition: background-color .15s;
}
.next:hover, .again:hover { background: var(--accent-press); }
.next:focus-visible, .again:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.end { text-align: center; padding: 24px 0; }
.big { font-size: 3.5rem; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; margin: 8px 0; font-variant-numeric: tabular-nums; }
.end .sub { margin-bottom: 24px; }
footer { color: var(--muted); font-size: .8125rem; margin-top: 40px; border-top: 1px solid var(--line); padding-top: 12px; }
</style>
</head>
<body>
<main>
  <h1>Can You Tell?</h1>
  <p class="sub">One reply is really ${escapeHtml(name)}. The other is an AI clone. Pick the real one.</p>
  <div class="bar" id="bar"><span id="round"></span><span class="score" id="score"></span></div>
  <div class="progress" aria-hidden="true"><i id="fill"></i></div>
  <section id="game" aria-live="polite"></section>
  <footer>
    Made with selfclone. Offline page, no tracking. It contains real messages that were scrubbed for secrets;
    share it only with people who could already read them. The clone is an AI and says so when asked.
  </footer>
</main>
<script id="rounds" type="application/json">${jsonForScript(rounds)}</script>
<script>
${FLUID}
(function () {
  var rounds = JSON.parse(document.getElementById('rounds').textContent);
  var root = document.getElementById('game');
  var roundEl = document.getElementById('round');
  var scoreEl = document.getElementById('score');
  var fill = document.getElementById('fill');
  var n = rounds.length;
  var i = 0, fooled = 0, answered = false, leaving = false;
  var CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  var CROSS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function glyph(cls, svg) { var e = el('span', cls); e.innerHTML = svg; return e; }

  // Progress: a scaleX spring on the fill (data, so critically damped).
  var prog = Fluid.spring({ value: 0, response: 0.4, damping: 1, onUpdate: function (s) {
    fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, s)).toFixed(4) + ')';
  } });
  prog.set(0);

  // Rounds slide along X: out to -24 px, in from +24 px, on one spring that any press retargets.
  var slide = Fluid.spring({ value: 0, response: 0.4, damping: 1, onUpdate: function (x) {
    root.style.transform = Math.abs(x) < 0.01 ? '' : 'translateX(' + x.toFixed(2) + 'px)';
    root.style.opacity = String(Math.max(0, 1 - Math.abs(x) / 24));
    if (leaving && x <= -21) { leaving = false; Promise.resolve().then(enter); }
  } });
  function enter() {
    var v = slide.velocity;
    show();
    slide.set(24);
    slide.to(0, { velocity: v });
  }
  function go(update) {
    // A second press while the old round is still leaving brings the next one in at once: never a dead click.
    if (leaving) { leaving = false; enter(); return; }
    update();
    if (Fluid.reduce()) {
      show();
      root.style.transition = 'none'; root.style.opacity = '0';
      void root.offsetWidth;
      root.style.transition = 'opacity 120ms linear'; root.style.opacity = '1';
      return;
    }
    root.style.transition = '';
    leaving = true;
    slide.to(-24);
  }
  // Tags and the verdict materialise on springs: scale 0.9 to 1, or 6 px up, with opacity.
  function materialise(node, rise) {
    var s = Fluid.spring({ value: 0, response: rise ? 0.3 : 0.25, damping: 1, onUpdate: function (p) {
      var q = Math.min(1, Math.max(0, p));
      node.style.opacity = String(q);
      node.style.transform = q >= 1 ? '' : rise ? 'translateY(' + (6 * (1 - q)).toFixed(2) + 'px)' : 'scale(' + (0.9 + 0.1 * q).toFixed(4) + ')';
    } });
    s.set(0);
    s.to(1);
  }
  function show() {
    root.innerHTML = '';
    if (!n) { document.getElementById('bar').hidden = true; root.appendChild(el('p', null, 'No rounds yet. Run selfclone test first.')); return; }
    if (i >= n) return end();
    var r = rounds[i]; answered = false;
    roundEl.textContent = 'Round ' + (i + 1) + ' of ' + n;
    scoreEl.textContent = 'Fooled so far: ' + fooled;
    prog.to(i / n);
    root.appendChild(el('p', 'label', 'They wrote'));
    root.appendChild(el('div', 'them', r.context));
    root.appendChild(el('p', 'label', 'Which reply is real?'));
    var box = el('div', 'choices');
    r.replies.forEach(function (text, k) {
      var b = el('button', 'reply'); b.type = 'button'; b.setAttribute('data-k', k);
      b.appendChild(el('span', 'text', text));
      Fluid.pressable(b, { scale: 0.98 });
      b.addEventListener('click', function () { pick(k, box); });
      box.appendChild(b);
    });
    root.appendChild(box);
    root.appendChild(el('p', 'verdict'));
  }
  function pick(k, box) {
    if (answered) return; answered = true;
    var r = rounds[i];
    var ok = k === r.real;
    if (!ok) fooled++;
    Array.prototype.forEach.call(box.children, function (b, j) {
      var real = j === r.real;
      b.disabled = true;
      b.classList.add(real ? 'real' : 'fake');
      b.setAttribute('data-truth', real ? 'real' : 'clone');
      if (j === k) b.setAttribute('data-picked', 'true');
      var meta = el('span', 'meta');
      var tag = el('span', 'tag chip ' + (real ? 'l2' : 'l3'), real ? 'Real' : 'AI clone');
      meta.appendChild(tag);
      if (j === k) meta.appendChild(el('span', 'mine', 'Your pick'));
      b.appendChild(meta);
      materialise(tag);
    });
    var v = root.querySelector('.verdict');
    v.setAttribute('data-status', ok ? 'pass' : 'fail');
    v.appendChild(ok ? glyph('ok', CHECK) : glyph('chip l3 glyph', CROSS));
    v.appendChild(el('span', null, ok ? 'Correct. You spotted the real one.' : 'The clone fooled you on this one.'));
    materialise(v, true);
    var next = el('button', 'next', i + 1 < n ? 'Next round' : 'See result'); next.type = 'button';
    Fluid.pressable(next);
    next.addEventListener('click', function () { go(function () { i++; }); });
    root.appendChild(next); next.focus();
    scoreEl.textContent = 'Fooled so far: ' + fooled;
    prog.to((i + 1) / n);
  }
  function end() {
    var pct = Math.round(100 * fooled / n);
    roundEl.textContent = 'All ' + n + ' rounds played';
    scoreEl.textContent = '';
    prog.to(1);
    var d = el('div', 'end');
    d.appendChild(el('p', 'label', 'Result'));
    d.appendChild(el('p', 'big', pct + '%'));
    d.appendChild(el('p', null, 'The clone fooled you ' + pct + '% of the time (' + fooled + ' of ' + n + ' rounds).'));
    d.appendChild(el('p', 'sub', fooled === 0 ? 'You know them well.' : pct >= 50 ? 'That is a convincing clone. Remember it is still an AI.' : 'The clone got close a few times.'));
    var again = el('button', 'again', 'Play again'); again.type = 'button';
    Fluid.pressable(again);
    again.addEventListener('click', function () { go(function () { i = 0; fooled = 0; }); });
    d.appendChild(again);
    root.appendChild(d);
    window.__selfcloneGame = { fooled: fooled, rounds: n, percent: pct };
  }
  show();
})();
</script>
</body>
</html>
`;
}
