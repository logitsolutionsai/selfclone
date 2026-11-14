// SKILL.md files follow the Agent Skills format (https://agentskills.io/specification, checked 2026-11-14):
// name 1-64 lowercase letters, digits and single hyphens, matching the folder; description 1-1024 characters;
// the body under 500 lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './next-helpers.mjs';

function frontmatter(file) {
  const m = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${file}: frontmatter`);
  const f = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) f[kv[1]] = kv[2];
  }
  return { f, body: m[2] };
}

const SKILLS = [
  [path.join(ROOT, 'SKILL.md'), 'selfclone'],
  [path.join(ROOT, 'templates', 'maintainer-kit', 'skills', 'maintainer-voice', 'SKILL.md'), 'maintainer-voice'],
];

test('SKILL.md frontmatter follows the Agent Skills specification', () => {
  for (const [file, folder] of SKILLS) {
    const { f, body } = frontmatter(file);
    assert.match(f.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, file);
    assert.ok(f.name.length <= 64);
    assert.equal(f.name, folder, `${file}: name matches its folder`);
    assert.ok(f.description && f.description.length <= 1024, `${file}: description ${f.description?.length} characters`);
    assert.ok(body.split('\n').length < 500, `${file}: body under 500 lines`);
    for (const k of Object.keys(f)) assert.ok(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'].includes(k), `${file}: unknown field ${k}`);
  }
});
