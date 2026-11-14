// Small shared helpers: hashing, seeded randomness, JSONL files, argument parsing.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const VERSION = '0.1.0';

export function sha1(text) {
  return createHash('sha1').update(String(text)).digest('hex');
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// 32-bit FNV-1a, used to turn a seed string into a PRNG state.
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Uniform number in [0, 1) derived only from the input string.
export function hashUnit(str) {
  const hex = sha1(str).slice(0, 13);
  return parseInt(hex, 16) / 2 ** 52;
}

// mulberry32: tiny deterministic PRNG.
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash32(seed);
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line));
  }
  return out;
}

export function writeJsonl(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

// Workspace folder, `.selfclone/` in the current directory unless --dir is given.
export function workDir(opts = {}) {
  return path.resolve(opts.dir || process.env.SELFCLONE_DIR || '.selfclone');
}

/**
 * Minimal argv parser. Supports `--flag`, `--key value`, `--key=value`, `--no-flag`,
 * repeated keys (collected into arrays when listed in `multi`), and positionals.
 */
export function parseArgs(argv, { multi = [], booleans = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let val;
      const eq = key.indexOf('=');
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (key.startsWith('no-') && !booleans.includes(key)) {
        out[camel(key.slice(3))] = false;
        continue;
      } else if (booleans.includes(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        val = true;
      } else {
        val = argv[++i];
      }
      const k = camel(key);
      if (multi.includes(key)) (out[k] ||= []).push(val);
      else out[k] = val;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'me';
}

export function round(x, d = 3) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function std(xs, mu = mean(xs)) {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs, q) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Embed JSON inside a <script> tag safely.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
