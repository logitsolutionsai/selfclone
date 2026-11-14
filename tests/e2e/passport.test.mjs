// Browser smoke test of the Voice Passport page in the installed Chrome: no CSP violations or errors,
// no horizontal scroll at 390, 768 and 1440 px, both colour schemes, press feedback within 50 ms, and a
// disclosure that opens on a spring and closes again. Skips with a reason when no browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, OUT } from './helpers.mjs';
import { findChrome, launchChrome } from '../../src/face/chrome.mjs';

const PAGE = path.join(ROOT, 'examples', 'maintainer-voice', 'passport.html');
const chrome = findChrome();

test('passport page: offline, responsive at 390, 768 and 1440 px, light and dark, accessible controls', { skip: chrome ? false : 'no Chrome, Edge or Chromium installed' }, async () => {
  const html = fs.readFileSync(PAGE, 'utf8');
  const browser = await launchChrome();
  try {
    for (const colorScheme of ['light', 'dark']) {
      for (const width of [390, 768, 1440]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
        const page = await ctx.newPage();
        const problems = [];
        const requests = [];
        page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
        page.on('pageerror', (e) => problems.push(String(e)));
        page.on('request', (r) => !r.url().startsWith('data:') && !r.url().startsWith('about:') && requests.push(r.url()));
        await page.setContent(html, { waitUntil: 'load' });
        const m = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
          disclaimer: !!document.querySelector('.disclaimer') && document.querySelector('.disclaimer').getBoundingClientRect().height > 0,
          headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => h.tagName),
          fluid: typeof window.Fluid === 'object',
          accent: getComputedStyle(document.querySelector('.toggle')).color,
        }));
        assert.ok(m.scrollW <= m.innerW, `${colorScheme} ${width}px: page scrolls sideways (${m.scrollW} > ${m.innerW})`);
        assert.ok(m.disclaimer, 'the disclaimer is visible');
        assert.equal(m.headings[0], 'H1');
        assert.ok(m.fluid, 'the inline script ran under the CSP');
        assert.equal(m.accent, colorScheme === 'dark' ? 'rgb(91, 156, 255)' : 'rgb(0, 101, 253)', 'the toggle uses the accent');
        assert.deepEqual(problems, [], `${colorScheme} ${width}px: console errors or CSP violations`);
        assert.deepEqual(requests, [], 'the page requests nothing');
        if (width === 390 && colorScheme === 'light') {
          // Press feedback: pointerdown applies a transform within 50 ms.
          const btn = await page.$('#what-toggle');
          await btn.scrollIntoViewIfNeeded();
          await page.evaluate(() => {
            const b = document.getElementById('what-toggle');
            window.__press = { down: null, styled: null };
            b.addEventListener('pointerdown', () => (window.__press.down = performance.now()), { capture: true });
            new MutationObserver(() => {
              if (window.__press.styled == null && b.style.transform) window.__press.styled = performance.now();
            }).observe(b, { attributes: true, attributeFilter: ['style'] });
          });
          const box = await btn.boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(120);
          const p = await page.evaluate(() => window.__press);
          assert.ok(p.down != null && p.styled != null, 'pointerdown scales the button');
          assert.ok(p.styled - p.down <= 50, `transform applied ${(p.styled - p.down).toFixed(1)} ms after pointerdown`);
          await page.mouse.up();
          await page.waitForTimeout(1000);
          const open = await page.evaluate(() => ({ expanded: document.getElementById('what-toggle').getAttribute('aria-expanded'), h: document.getElementById('what-body').getBoundingClientRect().height }));
          assert.equal(open.expanded, 'true');
          assert.ok(open.h > 40, 'the disclosure opened');
          await page.keyboard.press('Enter'); // the focused button closes it again
          await page.waitForTimeout(1000);
          assert.equal(await page.evaluate(() => document.getElementById('what-body').hidden), true);
          await page.screenshot({ path: path.join(OUT, 'passport-390-light.png'), fullPage: true });
        }
        if (width === 1440 && colorScheme === 'dark') await page.screenshot({ path: path.join(OUT, 'passport-1440-dark.png') });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
});
