import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRounds, gameHtml } from '../../src/game.mjs';

const sealed = Array.from({ length: 15 }, (_, i) => ({ id: `s-${i}`, context: `question ${i}?`, reply: `real reply ${i}`, ids: [`m${i}`] }));
const clone = new Map(sealed.map((s, i) => [s.id, `clone reply ${i}`]));

test('rounds are seeded, contain the real and clone reply, and record which is real', () => {
  const a = buildRounds({ sealed, clone, rounds: 10, seed: 'g' });
  const b = buildRounds({ sealed, clone, rounds: 10, seed: 'g' });
  const c = buildRounds({ sealed, clone, rounds: 10, seed: 'other' });
  assert.equal(a.length, 10);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const r of a) {
    const n = r.id.split('-')[1];
    assert.equal(r.replies[r.real], `real reply ${n}`);
    assert.equal(r.replies[1 - r.real], `clone reply ${n}`);
  }
  const positions = new Set(a.map((r) => r.real));
  assert.equal(positions.size, 2, 'the real reply is not always in the same position');
});

test('rounds skip prompts the clone did not answer', () => {
  const partial = new Map([...clone].slice(0, 4));
  assert.equal(buildRounds({ sealed, clone: partial, rounds: 10 }).length, 4);
});

test('game HTML is self-contained, escapes content and supports dark mode', () => {
  const rounds = buildRounds({ sealed: [{ id: 's-x', context: '<script>alert(1)</script>', reply: 'real </script><b>', ids: [] }], clone: new Map([['s-x', 'fake & co']]) });
  const html = gameHtml({ rounds, name: 'Ada <Test>' });
  assert.ok(!/<script[^>]*\bsrc=/i.test(html), 'no external scripts');
  assert.ok(!/<link[^>]*rel=["']?stylesheet/i.test(html), 'no external stylesheets');
  assert.ok(!/https?:\/\//.test(html.replace(/https:\/\/github\.com\/logitsolutionsai\/selfclone/g, '')), 'no network URLs');
  assert.ok(!html.includes('<script>alert(1)</script>'), 'context is not injected as markup');
  assert.ok(!html.includes('real </script>'), 'script-breaking sequences are escaped in the JSON data');
  assert.match(html, /Ada &lt;Test&gt;/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /fooled you/);
});
