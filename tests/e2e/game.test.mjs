// The Can You Tell page in headless Chrome: press feedback, the pick, and rounds that slide on springs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from '../../src/face/chrome.mjs';
import { buildRounds, gameHtml } from '../../src/game.mjs';

const sealed = Array.from({ length: 6 }, (_, i) => ({ id: `s-${i}`, context: `question ${i}?`, reply: `real reply ${i}`, ids: [`m${i}`] }));
const clone = new Map(sealed.map((s, i) => [s.id, `clone reply ${i}`]));
const html = gameHtml({ rounds: buildRounds({ sealed, clone, rounds: 4, seed: 'e2e' }), name: 'Casey' });
let browser;

before(async () => {
  browser = await launchChrome();
});
after(async () => {
  if (browser) await browser.close();
});

async function open(o = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 900 }, reducedMotion: o.reducedMotion || 'no-preference' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(html);
  await page.waitForSelector('button.reply');
  // Headless Chrome draws its first frames slowly after a load; wait until frames come steadily.
  await page.evaluate(() => new Promise((r) => {
    let last = performance.now();
    let steady = 0;
    const f = (t) => {
      steady = t - last < 40 ? steady + 1 : 0;
      last = t;
      if (steady >= 5) r();
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  return { page, errors };
}

test('game: pointerdown on a reply card applies a transform within 50 ms, and release springs it back', async () => {
  const { page, errors } = await open();
  try {
    // Time from the pointerdown event to the first transform written on the card, measured in the page.
    await page.evaluate(() => {
      const b = document.querySelector('button.reply');
      window.__press = { down: null, styled: null };
      b.addEventListener('pointerdown', () => (window.__press.down = performance.now()), { capture: true });
      new MutationObserver(() => {
        if (window.__press.styled == null && b.style.transform) window.__press.styled = { at: performance.now(), transform: b.style.transform };
      }).observe(b, { attributes: true, attributeFilter: ['style'] });
    });
    const box = await page.locator('button.reply >> nth=0').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
    const p = await page.evaluate(() => window.__press);
    assert.ok(p.down != null && p.styled != null, 'the card was transformed after pointerdown');
    const ms = p.styled.at - p.down;
    assert.ok(ms <= 50, `transform applied ${ms.toFixed(1)} ms after pointerdown`);
    assert.match(p.styled.transform, /^scale\(0\.9\d*\)$/);
    const held = await page.evaluate(() => document.querySelector('button.reply').style.transform);
    assert.match(held, /^scale\(0\.98/, 'held at 0.98 while pressed');
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('button.reply[data-picked]') && !document.querySelector('button.reply[data-picked]').style.transform, null, { timeout: 3000 });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('game: the pick marks the chosen card and tags both; the progress is a scaleX spring', async () => {
  const { page, errors } = await open();
  try {
    const fill = await page.evaluate(() => {
      const i = document.getElementById('fill');
      return { transition: getComputedStyle(i).transitionProperty, width: getComputedStyle(i).width, track: getComputedStyle(i.parentElement).width };
    });
    assert.ok(!/width/.test(fill.transition), 'no width transition on the progress bar');
    assert.equal(fill.width, fill.track, 'the fill keeps its full width and is scaled instead');
    await page.click('button.reply >> nth=0');
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('button.reply')];
      return {
        picked: cards.map((b) => b.hasAttribute('data-picked')),
        truth: cards.map((b) => b.getAttribute('data-truth')),
        tags: cards.map((b) => b.querySelector('.tag').className + ':' + b.querySelector('.tag').textContent),
        border: getComputedStyle(cards[0]).borderTopColor,
        ink: getComputedStyle(document.body).color,
        fill: document.getElementById('fill').style.transform,
        verdict: document.querySelector('.verdict').getAttribute('data-status'),
      };
    });
    assert.deepEqual(st.picked, [true, false]);
    assert.deepEqual([...st.truth].sort(), ['clone', 'real']);
    for (const [k, t] of st.truth.entries()) assert.match(st.tags[k], t === 'real' ? /\bl2\b.*:Real$/ : /\bl3\b.*:AI clone$/);
    assert.equal(st.border, st.ink, 'the chosen card is outlined in ink');
    assert.match(st.fill, /^scaleX\(0\.2[45]/, 'one of four rounds done');
    assert.ok(['pass', 'fail'].includes(st.verdict));
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('game: fast repeated Next presses retarget the slide and never lock the page', async () => {
  const { page, errors } = await open();
  try {
    await page.click('button.reply >> nth=0');
    // Two raw presses 60 ms apart: the second lands while the old round is still sliding out, and brings
    // the next round in at once instead of being ignored (and without skipping a round).
    const nb = await page.locator('.next').boundingBox();
    await page.mouse.click(nb.x + 20, nb.y + nb.height / 2);
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => document.getElementById('round').textContent), 'Round 1 of 4', 'still leaving after the first press');
    await page.mouse.click(nb.x + 20, nb.y + nb.height / 2);
    assert.equal(await page.evaluate(() => document.getElementById('round').textContent), 'Round 2 of 4', 'the second press swapped the round in');
    // The new round takes a pick at once, mid-slide.
    const rb = await page.locator('button.reply >> nth=1').boundingBox();
    await page.mouse.click(rb.x + 30, rb.y + rb.height / 2);
    assert.equal(await page.evaluate(() => document.querySelectorAll('button.reply[data-picked]').length), 1, 'picked while still entering');
    const nb2 = await page.locator('.next').boundingBox();
    await page.mouse.click(nb2.x + 20, nb2.y + nb2.height / 2);
    await page.waitForFunction(() => document.getElementById('round').textContent === 'Round 3 of 4', null, { timeout: 2000 });
    await page.waitForFunction(() => !document.getElementById('game').style.transform && document.getElementById('game').style.opacity === '1', null, { timeout: 3000 });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('game: under reduced motion the press and the swap are instant', async () => {
  const { page, errors } = await open({ reducedMotion: 'reduce' });
  try {
    const box = await page.locator('button.reply >> nth=0').boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    assert.match(await page.evaluate(() => document.querySelector('button.reply').style.transform), /^scale\(0\.98\)$/, 'pressed at once, no spring');
    await page.mouse.up();
    await page.click('.next');
    assert.equal(await page.evaluate(() => document.getElementById('round').textContent), 'Round 2 of 4', 'swapped at once');
    assert.equal(await page.evaluate(() => document.getElementById('game').style.transform), '', 'no slide');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
