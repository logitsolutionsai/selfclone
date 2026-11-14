// The three pages (avatar, game, enrol) use the Ink palette with one accent, carry the same inlined copy of
// face/lib/fluid.js, and keep no CSS width transition or keyframes for anything the user can interrupt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRounds, gameHtml } from '../../src/game.mjs';
import { htmlFromData } from '../../src/face/build.mjs';

const read = (f) => fs.readFileSync(new URL(`../../face/${f}`, import.meta.url), 'utf8');
const FLUID = read('lib/fluid.js');
const sealed = [{ id: 's-1', context: 'hi?', reply: 'real', ids: [] }];
const pages = {
  avatar: htmlFromData({ size: 64, consent: { name: 'Test' }, tool: { name: 'selfclone', version: '0' } }),
  game: gameHtml({ rounds: buildRounds({ sealed, clone: new Map([['s-1', 'fake']]) }), name: 'Casey' }),
  enrol: read('enrol.html'),
};

// Ink neutrals for light and dark, the accent and its pressed shade in both modes, and black for the stage.
const PALETTE = new Set([
  '#f7f7f5', '#ffffff', '#f0f0ed', '#e3e3df', '#c9c9c3', '#111110', '#3a3a37', '#6f6f69', '#a3a39c',
  '#0e0e0d', '#171716', '#1f1f1d', '#2b2b29', '#3d3d3a', '#f4f4f2', '#d6d6d2', '#9a9a94', '#6a6a65',
  '#0065fd', '#0654c8', '#5b9cff', '#3f86ff', '#000000',
]);
const styles = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const svgs = (html) => [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((m) => m[0]).join('\n');

for (const [name, html] of Object.entries(pages)) {
  test(`${name} page: only Ink colours and the one accent; translucent black or white only`, () => {
    const css = styles(html) + svgs(html);
    const hexes = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)].map((m) => m[0].toLowerCase());
    assert.ok(hexes.length > 10, 'the palette was found');
    for (const h of hexes) assert.ok(PALETTE.has(h), `${h} is not in the Ink palette`);
    for (const [, r, g, b] of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      assert.ok(r === g && g === b && (r === '0' || r === '255'), `rgb(${r},${g},${b}) is not black or white`);
    }
    // The accent pair is defined once per mode, and nothing else carries a hue.
    assert.match(css, /--accent: #0065fd/);
    assert.match(css, /--accent: #5b9cff/);
    assert.ok(!/--(good|bad|warn|red|green|yellow|purple)\b/.test(css), 'no status hues');
  });

  test(`${name} page: inlines fluid.js verbatim and animates nothing interruptible with keyframes or a width transition`, () => {
    assert.ok(html.includes(FLUID.trim()), 'the fluid.js copy is inlined unchanged');
    assert.ok(!/@keyframes/.test(html), 'no keyframes');
    assert.ok(!/transition:[^;]*\bwidth\b/.test(html), 'no width transition');
  });
}

test('the AI CLONE badge is a near-black chip with white letters and a faint white ring in both themes', () => {
  const css = styles(pages.avatar);
  const badge = css.match(/\.badge \{([^}]*)\}/)[1];
  assert.match(badge, /background: #111110/);
  assert.match(badge, /color: #ffffff/);
  assert.match(badge, /box-shadow: 0 0 0 1px rgba\(255,255,255,\.25\)/);
  assert.ok(!/\.badge/.test(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('}\n}', css.indexOf('@media (prefers-color-scheme: dark)')))), 'dark mode does not restyle the badge');
});

test('enrol checks keep their classes and gain data-status, shown by glyphs, never colour', () => {
  const html = pages.enrol;
  assert.equal((html.match(/data-status="pending"/g) || []).length, 7);
  assert.match(html, /li\.dataset\.status = \{ ok: 'pass', no: 'fail', warn: 'warn' \}\[cls\] \|\| 'pending'/);
  for (const g of ['i-ok', 'i-no', 'i-warn']) assert.equal((html.match(new RegExp(`class="${g}"`, 'g')) || []).length, 7);
});
