// Security of the local face servers and the MediaPipe download. No browser needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startEnrolServer, startAvatarServer } from '../../src/face/server.mjs';
import { getAsset, ALLOWED, SHA256 } from '../../src/face/mediapipe.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'selfclone-sec-'));

test('a web page on another site cannot bake an avatar through the enrol server (CSRF)', async () => {
  const dir = tmp();
  const srv = await startEnrolServer({ dir, port: 0, open: false, quiet: true });
  try {
    assert.equal(srv.server.address().address, '127.0.0.1');
    const body = JSON.stringify({ bake: {}, consent: { agreed: true, name: 'Mallory' } });
    // What fetch(..., {mode: 'no-cors'}) from https://evil.example sends: no preflight for text/plain.
    let r = await fetch(`${srv.url}/api/bake`, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=application/json', Origin: 'https://evil.example' }, body });
    assert.equal(r.status, 403);
    r = await fetch(`${srv.url}/api/bake`, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=application/json' }, body });
    assert.equal(r.status, 415, 'the media type must be exactly application/json');
    r = await fetch(`${srv.url}/api/bake`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' }, body });
    assert.equal(r.status, 403);
    r = await fetch(`${srv.url}/api/bake`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: srv.url }, body: JSON.stringify({ bake: {}, consent: { agreed: false } }) });
    assert.equal(r.status, 400, 'the page itself still reaches the consent check');
    assert.ok(!fs.existsSync(path.join(dir, 'avatar.html')));
    const page = await fetch(`${srv.url}/`);
    assert.equal(page.headers.get('x-frame-options'), 'DENY', 'the consent page cannot be framed by another site');
  } finally {
    await srv.close();
  }
});

test('the live avatar only speaks for the token holder, from its own origin', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'avatar.html'), '<!doctype html><title>x</title><!--SELFCLONE_LIVE-->');
  const srv = await startAvatarServer({ dir, port: 0, open: false, quiet: true });
  try {
    assert.equal(srv.server.address().address, '127.0.0.1');
    const say = (headers) => fetch(`${srv.url}/api/say`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{"text":"hi"}' });
    assert.equal((await say({})).status, 403);
    assert.equal((await say({ 'X-Selfclone-Token': 'wrong' })).status, 403);
    assert.equal((await say({ 'X-Selfclone-Token': srv.token, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await say({ 'X-Selfclone-Token': srv.token })).status, 200);
    // fetch() drops a custom Host header, so use http.request for the DNS-rebinding case.
    const http = await import('node:http');
    const status = await new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: srv.port, path: '/', headers: { Host: `evil.example:${srv.port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(status, 403, 'DNS rebinding: a foreign Host header is refused');
  } finally {
    await srv.close();
  }
});

test('the MediaPipe proxy serves only pinned files and refuses anything that fails its SHA-256', async () => {
  const cache = tmp();
  const prevCache = process.env.SELFCLONE_CACHE;
  const prevFetch = globalThis.fetch;
  process.env.SELFCLONE_CACHE = cache;
  try {
    for (const rel of ['../package.json', 'https://evil.example/x', String.raw`..\..\x`, 'wasm/../../x', 'other.js']) assert.equal(await getAsset(rel), null, rel);
    // A download whose bytes do not match the pin is refused and not cached.
    globalThis.fetch = async () => new Response('console.log("evil")');
    await assert.rejects(getAsset('vision_bundle.mjs'), /Integrity check failed/);
    assert.ok(!fs.existsSync(path.join(cache, 'vision_bundle.mjs')));
    // A cached file that was changed after download is thrown away and fetched again.
    fs.writeFileSync(path.join(cache, 'vision_bundle.mjs'), 'tampered');
    await assert.rejects(getAsset('vision_bundle.mjs'), /Integrity check failed/);
    assert.ok(!fs.existsSync(path.join(cache, 'vision_bundle.mjs')));
    // A file whose bytes match its pin is cached and served.
    const good = Buffer.from('pinned test bytes');
    ALLOWED.set('qa-test.bin', 'https://example.invalid/qa-test.bin');
    const { createHash } = await import('node:crypto');
    SHA256.set('qa-test.bin', createHash('sha256').update(good).digest('hex'));
    globalThis.fetch = async () => new Response(good);
    assert.deepEqual(await getAsset('qa-test.bin'), good);
    assert.ok(fs.existsSync(path.join(cache, 'qa-test.bin')));
    for (const [rel, hex] of SHA256) assert.match(hex, /^[0-9a-f]{64}$/, rel);
    for (const rel of ALLOWED.keys()) assert.ok(SHA256.has(rel), `${rel} has a pin`);
  } finally {
    ALLOWED.delete('qa-test.bin');
    SHA256.delete('qa-test.bin');
    globalThis.fetch = prevFetch;
    if (prevCache == null) delete process.env.SELFCLONE_CACHE;
    else process.env.SELFCLONE_CACHE = prevCache;
  }
});
