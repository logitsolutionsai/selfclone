// Tiny local HTTP helpers shared by the enrol, bake and avatar servers.
// Everything binds to 127.0.0.1 and refuses requests whose Host header is not local.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getAsset, contentType } from './mediapipe.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FACE_DIR = path.join(ROOT, 'face');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
};

export function typeFor(file) {
  return TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

export function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  // Pages are never shown inside another site's frame (no clickjacking of the consent step).
  const frame = /^text\/html/.test(type) ? { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } : {};
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...frame, ...extra });
  res.end(body);
}

/**
 * True when a request that changes something comes from a page on another site.
 * A web page can POST to 127.0.0.1 without a CORS preflight when the body is a
 * "simple" type (text/plain, form data), so the Origin is checked on every write.
 */
export function crossSite(req, port) {
  const origin = req.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return true;
  const site = req.headers['sec-fetch-site'];
  return site === 'cross-site' || site === 'same-site';
}

/** The media type of a request body without parameters ("application/json; charset=utf-8" -> "application/json"). */
export function mediaType(req) {
  return String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

export function readBody(req, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function localHost(req, port) {
  const host = String(req.headers.host || '');
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Serve /face/* from the package and /mp/* from the MediaPipe cache. Returns true if handled. */
export async function serveShared(req, res, url) {
  if (url.pathname.startsWith('/mp/')) {
    const rel = url.pathname.slice(4);
    try {
      const buf = await getAsset(rel);
      if (!buf) return send(res, 404, 'not found'), true;
      send(res, 200, buf, contentType(rel), { 'Cache-Control': 'max-age=86400' });
    } catch (e) {
      send(res, 502, `Could not fetch MediaPipe file: ${e.message}`);
    }
    return true;
  }
  if (url.pathname.startsWith('/face/')) {
    const rel = decodeURIComponent(url.pathname.slice(6));
    const file = path.resolve(FACE_DIR, rel);
    if (!file.startsWith(FACE_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found'), true;
    send(res, 200, fs.readFileSync(file), typeFor(file));
    return true;
  }
  return false;
}

/**
 * Start a server on 127.0.0.1. `handler(req, res, url)` returns true when it handled the request.
 * Tries the next ports if the requested one is taken (port 0 picks a free port).
 */
export async function startServer(handler, { port = 0, tries = 10 } = {}) {
  for (let k = 0; k < tries; k++) {
    const p = port === 0 ? 0 : port + k;
    const server = http.createServer(async (req, res) => {
      const actual = server.address().port;
      if (!localHost(req, actual)) return send(res, 403, 'Forbidden host');
      if (req.method !== 'GET' && req.method !== 'HEAD' && crossSite(req, actual)) return send(res, 403, 'Forbidden origin');
      const url = new URL(req.url, `http://127.0.0.1:${actual}`);
      try {
        if (await handler(req, res, url)) return;
        if (await serveShared(req, res, url)) return;
        send(res, 404, 'not found');
      } catch (e) {
        if (!res.headersSent) send(res, 500, `error: ${e.message}`);
        else res.end();
      }
    });
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(p, '127.0.0.1', resolve);
      });
      const actual = server.address().port;
      return { server, port: actual, url: `http://127.0.0.1:${actual}`, close: () => new Promise((r) => server.close(() => r())) };
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || port === 0) throw e;
    }
  }
  throw new Error(`No free port found near ${port}`);
}

export function openInBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // The URL is printed anyway.
  }
}
