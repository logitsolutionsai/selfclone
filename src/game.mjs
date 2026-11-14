// "Can You Tell?" game: a self-contained offline HTML page. Each round shows
// the message someone sent, then two replies: the real one and the clone's.
// The player picks the real one. Order is seeded so the page is reproducible.
import { rng, shuffle, jsonForScript, escapeHtml } from './util.mjs';

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
  --bg: #f6f7f9; --card: #ffffff; --ink: #14161a; --muted: #5d6470; --line: #dfe3e8;
  --accent: #0065fd; --accent-ink: #ffffff; --them: #eef1f5; --good: #0f7b3f; --bad: #b42318;
  --pick: #e8f0ff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --card: #181b21; --ink: #eef1f5; --muted: #a2a9b4; --line: #2b3038;
    --accent: #5b9dff; --accent-ink: #0b0d10; --them: #222730; --good: #4cc38a; --bad: #ff7b72;
    --pick: #1d2a40;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body {
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
}
main { max-width: 640px; margin: 0 auto; }
h1 { font-size: 1.5rem; line-height: 1.25; margin: 8px 0 4px; }
.sub { color: var(--muted); margin: 0 0 20px; }
.bar { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: .9rem; margin-bottom: 10px; }
.progress { height: 4px; background: var(--line); border-radius: 2px; overflow: hidden; margin-bottom: 18px; }
.progress > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .25s ease; }
.label { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 6px; }
.them { background: var(--them); border-radius: 14px 14px 14px 4px; padding: 12px 14px; white-space: pre-wrap; overflow-wrap: anywhere; margin-bottom: 20px; }
.choices { display: grid; gap: 12px; }
button.reply {
  all: unset; display: block; cursor: pointer; background: var(--card); color: var(--ink);
  border: 1.5px solid var(--line); border-radius: 14px 14px 4px 14px; padding: 14px 16px;
  white-space: pre-wrap; overflow-wrap: anywhere; transition: border-color .15s, background .15s;
}
button.reply:hover, button.reply:focus-visible { border-color: var(--accent); background: var(--pick); }
button.reply:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
button.reply[disabled] { cursor: default; }
button.reply.real { border-color: var(--good); }
button.reply.fake { border-color: var(--bad); opacity: .85; }
.tag { display: block; font-size: .78rem; font-weight: 600; margin-top: 8px; }
.real .tag { color: var(--good); }
.fake .tag { color: var(--bad); }
.verdict { min-height: 1.6em; margin: 16px 0 8px; font-weight: 600; }
.next, .again {
  all: unset; cursor: pointer; display: inline-block; background: var(--accent); color: var(--accent-ink);
  padding: 10px 18px; border-radius: 10px; font-weight: 600;
}
.next:focus-visible, .again:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
.end { text-align: center; padding: 24px 0; }
.big { font-size: 3rem; font-weight: 700; line-height: 1.1; margin: 8px 0; }
footer { color: var(--muted); font-size: .8rem; margin-top: 32px; border-top: 1px solid var(--line); padding-top: 12px; }
</style>
</head>
<body>
<main>
  <h1>Can You Tell?</h1>
  <p class="sub">One reply is really ${escapeHtml(name)}. The other is an AI clone. Pick the real one.</p>
  <section id="game" aria-live="polite"></section>
  <footer>
    Made with selfclone. Offline page, no tracking. It contains real messages that were scrubbed for secrets;
    share it only with people who could already read them. The clone is an AI and says so when asked.
  </footer>
</main>
<script id="rounds" type="application/json">${jsonForScript(rounds)}</script>
<script>
(function () {
  var rounds = JSON.parse(document.getElementById('rounds').textContent);
  var root = document.getElementById('game');
  var i = 0, fooled = 0, answered = false;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function render() {
    root.innerHTML = '';
    if (!rounds.length) { root.appendChild(el('p', null, 'No rounds yet. Run selfclone test first.')); return; }
    if (i >= rounds.length) return end();
    var r = rounds[i]; answered = false;
    var bar = el('div', 'bar'); bar.appendChild(el('span', null, 'Round ' + (i + 1) + ' of ' + rounds.length)); bar.appendChild(el('span', 'score', 'Fooled so far: ' + fooled));
    root.appendChild(bar);
    var pr = el('div', 'progress'); var fill = el('i'); fill.style.width = (100 * i / rounds.length) + '%'; pr.appendChild(fill); root.appendChild(pr);
    root.appendChild(el('p', 'label', 'They wrote'));
    root.appendChild(el('div', 'them', r.context));
    root.appendChild(el('p', 'label', 'Which reply is real?'));
    var box = el('div', 'choices');
    r.replies.forEach(function (text, k) {
      var b = el('button', 'reply', text); b.type = 'button'; b.setAttribute('data-k', k);
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
      b.disabled = true;
      b.classList.add(j === r.real ? 'real' : 'fake');
      b.appendChild(el('span', 'tag', j === r.real ? 'Real' : 'AI clone'));
    });
    var v = root.querySelector('.verdict');
    v.textContent = ok ? 'Correct. You spotted the real one.' : 'The clone fooled you on this one.';
    var next = el('button', 'next', i + 1 < rounds.length ? 'Next round' : 'See result'); next.type = 'button';
    next.addEventListener('click', function () { i++; render(); });
    root.appendChild(next); next.focus();
    root.querySelector('.score').textContent = 'Fooled so far: ' + fooled;
  }
  function end() {
    var pct = Math.round(100 * fooled / rounds.length);
    var d = el('div', 'end');
    d.appendChild(el('p', 'label', 'Result'));
    d.appendChild(el('p', 'big', pct + '%'));
    d.appendChild(el('p', null, 'The clone fooled you ' + pct + '% of the time (' + fooled + ' of ' + rounds.length + ' rounds).'));
    d.appendChild(el('p', 'sub', fooled === 0 ? 'You know them well.' : pct >= 50 ? 'That is a convincing clone. Remember it is still an AI.' : 'The clone got close a few times.'));
    var again = el('button', 'again', 'Play again'); again.type = 'button';
    again.addEventListener('click', function () { i = 0; fooled = 0; render(); });
    d.appendChild(again);
    root.appendChild(d);
    window.__selfcloneGame = { fooled: fooled, rounds: rounds.length, percent: pct };
  }
  render();
})();
</script>
</body>
</html>
`;
}
