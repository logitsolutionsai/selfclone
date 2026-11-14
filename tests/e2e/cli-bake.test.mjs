// The real CLI, run the way a user runs it: a photo path with spaces, then exit.
// Its own file so it never opens a second Chrome next to the avatar suite's browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { OUT, FIXTURE, ROOT } from './helpers.mjs';

const CLI = path.join(ROOT, 'scripts', 'selfclone.mjs');

test('selfclone bake exits as soon as it has baked (it used to wait out a 2 minute timer)', () => {
  const dir = path.join(OUT, 'cli bake ws');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const photo = path.join(dir, 'my photo (1).jpg');
  fs.copyFileSync(FIXTURE, photo);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [CLI, 'bake', '--photo', photo, '--consent', 'Test fixture: public domain painting, used to test the avatar.', '--name', 'Lisa Gherardini (painting)', '--dir', dir], { encoding: 'utf8', timeout: 110000 });
  const seconds = (Date.now() - t0) / 1000;
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Baked .*avatar\.html/);
  assert.ok(fs.existsSync(path.join(dir, 'avatar.html')));
  assert.ok(seconds < 60, `bake took ${seconds.toFixed(1)} s to exit`);
});

test('selfclone bake refuses a file that is not a photo and writes nothing', () => {
  const dir = path.join(OUT, 'cli bake ws');
  const bad = path.join(dir, 'not a photo.jpg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(bad, 'not an image');
  const r = spawnSync(process.execPath, [CLI, 'bake', '--photo', bad, '--consent', 'Test fixture: not a photo at all.', '--dir', dir, '--out', path.join(dir, 'bad.html')], { encoding: 'utf8', timeout: 110000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot be decoded|No face found/);
  assert.ok(!fs.existsSync(path.join(dir, 'bad.html')));
});
