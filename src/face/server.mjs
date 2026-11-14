// Local servers: the webcam enrol page (selfclone face) and the live avatar
// (selfclone serve) that `selfclone say` talks to over Server-Sent Events.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startServer, send, readBody, openInBrowser, FACE_DIR, typeFor, mediaType } from './http.mjs';
import { buildAvatarHtml } from './build.mjs';

// ---------- enrol ----------
export async function startEnrolServer({ dir, port = 7319, open = true, quiet = false } = {}) {
  const avatarFile = path.join(dir, 'avatar.html');
  const srv = await startServer(async (req, res, url) => {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/enrol')) {
      send(res, 200, fs.readFileSync(path.join(FACE_DIR, 'enrol.html')), 'text/html; charset=utf-8');
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/bake') {
      // The exact media type, so "text/plain; charset=application/json" (no preflight) is refused.
      if (mediaType(req) !== 'application/json') return send(res, 415, 'JSON only'), true;
      const body = JSON.parse((await readBody(req)).toString('utf8'));
      const consent = body.consent || {};
      if (consent.agreed !== true || String(consent.name || '').trim().length < 2) {
        send(res, 400, JSON.stringify({ ok: false, error: 'Consent is required: tick the box and type your full name.' }), 'application/json');
        return true;
      }
      const { html, triangles } = buildAvatarHtml({
        bake: body.bake,
        consent: { name: consent.name, statement: consent.statement || 'This is my own face.', date: new Date().toISOString(), method: body.source === 'clip' && body.bake && body.bake.clip ? 'clip' : 'webcam' },
        glasses: !!body.glasses,
      });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(avatarFile, html);
      if (!quiet) process.stdout.write(`Saved ${avatarFile} (${Math.round(html.length / 1024)} KB, ${triangles} triangles)\n`);
      send(res, 200, JSON.stringify({ ok: true, path: avatarFile, url: '/avatar' }), 'application/json');
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/avatar') {
      if (!fs.existsSync(avatarFile)) return send(res, 404, 'No avatar yet'), true;
      send(res, 200, fs.readFileSync(avatarFile), 'text/html; charset=utf-8');
      return true;
    }
    return false;
  }, { port });
  if (!quiet) {
    process.stdout.write(`selfclone face enrolment: ${srv.url}/\n`);
    process.stdout.write('Everything stays on this computer. Press Ctrl+C to stop.\n');
  }
  if (open) openInBrowser(`${srv.url}/`);
  return srv;
}

// ---------- live avatar ----------
function serveFile(dir) {
  return path.join(dir, 'serve.json');
}

export async function startAvatarServer({ dir, port = 7320, open = true, avatar, quiet = false } = {}) {
  const avatarFile = path.resolve(avatar || path.join(dir, 'avatar.html'));
  if (!fs.existsSync(avatarFile)) throw new Error(`No avatar at ${avatarFile}. Run selfclone face or selfclone bake first.`);
  const token = randomBytes(16).toString('hex');
  const clients = new Set();
  const audio = new Map();
  let audioSeq = 0;
  const broadcast = (msg) => {
    const line = `data: ${JSON.stringify(msg)}\n\n`;
    for (const c of clients) c.write(line);
    return clients.size;
  };
  const authed = (req) => req.headers['x-selfclone-token'] === token;
  const srv = await startServer(async (req, res, url) => {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/avatar.html')) {
      const html = fs.readFileSync(avatarFile, 'utf8').replace('<!--SELFCLONE_LIVE-->', '<script>window.__SELFCLONE_LIVE__ = true;</script>');
      send(res, 200, html, 'text/html; charset=utf-8');
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/say') {
      if (!authed(req)) return send(res, 403, 'bad token'), true;
      const { text } = JSON.parse((await readBody(req, 1e6)).toString('utf8'));
      const n = broadcast({ type: 'say', text: String(text || '').slice(0, 5000) });
      send(res, 200, JSON.stringify({ ok: true, clients: n }), 'application/json');
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/audio') {
      if (!authed(req)) return send(res, 403, 'bad token'), true;
      const buf = await readBody(req);
      const id = `${++audioSeq}-${randomBytes(8).toString('hex')}`; // not guessable by other pages
      audio.set(id, { buf, type: req.headers['content-type'] || 'application/octet-stream' });
      if (audio.size > 20) audio.delete(audio.keys().next().value);
      const n = broadcast({ type: 'audio', url: `/audio/${id}` });
      send(res, 200, JSON.stringify({ ok: true, clients: n }), 'application/json');
      return true;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/audio/')) {
      const a = audio.get(url.pathname.slice(7));
      if (!a) return send(res, 404, 'not found'), true;
      send(res, 200, a.buf, a.type);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      send(res, 200, JSON.stringify({ ok: true, clients: clients.size }), 'application/json');
      return true;
    }
    return false;
  }, { port });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(serveFile(dir), JSON.stringify({ url: srv.url, port: srv.port, token, pid: process.pid }, null, 2));
  const cleanup = () => {
    try {
      const cur = JSON.parse(fs.readFileSync(serveFile(dir), 'utf8'));
      if (cur.token === token) fs.unlinkSync(serveFile(dir));
    } catch {
      // already gone
    }
  };
  process.once('exit', cleanup);
  if (!quiet) {
    process.once('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.stdout.write(`selfclone avatar: ${srv.url}/\n`);
    process.stdout.write('Make it speak from another terminal: selfclone say "hello"  or  selfclone say --audio file.mp3\n');
  }
  if (open) openInBrowser(`${srv.url}/`);
  const close = async () => {
    for (const c of clients) c.end();
    cleanup();
    await srv.close();
  };
  return { ...srv, token, close, clients: () => clients.size };
}

function readServe(dir) {
  const f = serveFile(dir);
  if (!fs.existsSync(f)) throw new Error('No running avatar server found. Start one with: selfclone serve');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

// serve.json outlives a server that was killed (window closed, kill -9): say so plainly.
async function post(s, pathname, init) {
  try {
    return await fetch(`${s.url}${pathname}`, init);
  } catch {
    throw new Error(`The avatar server at ${s.url} is not running (it was probably closed). Start it again with: selfclone serve`);
  }
}

export async function sayText({ dir, text }) {
  if (!text || !String(text).trim()) throw new Error('Nothing to say. Usage: selfclone say "text"');
  const s = readServe(dir);
  const res = await post(s, '/api/say', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Selfclone-Token': s.token },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Avatar server refused: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sayAudio({ dir, file }) {
  if (!fs.existsSync(file)) throw new Error(`Audio file not found: ${file}`);
  const s = readServe(dir);
  const res = await post(s, '/api/audio', {
    method: 'POST',
    headers: { 'Content-Type': typeFor(file), 'X-Selfclone-Token': s.token },
    body: fs.readFileSync(file),
  });
  if (!res.ok) throw new Error(`Avatar server refused: ${res.status} ${await res.text()}`);
  return res.json();
}
