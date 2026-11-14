// Performance budget for Voice CI: 10,000 messages and 100 Markdown files (under 5 MiB) must profile and
// lint within 15 s, and drift with 1,000 bootstrap rounds within 30 s (tools/perf-voice-ci.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPerf } from '../../tools/perf-voice-ci.mjs';

test('performance: profile + lint of 10k messages and 100 files within 15 s; drift within 30 s', (t) => {
  const r = runPerf();
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.messages, 10000);
  assert.equal(r.markdownFiles, 100);
  assert.ok(r.markdownBytes <= 5 * 1024 * 1024);
  assert.ok(r.profilePlusLintMs <= 15000, `profile + lint took ${r.profilePlusLintMs} ms`);
  assert.equal(r.driftStatus, 'ok');
  assert.ok(r.driftMs <= 30000, `drift took ${r.driftMs} ms`);
});
