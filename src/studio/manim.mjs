// selfclone studio: Manim for maths. A scene's "manim" block is Python with a Manim Scene class; it is
// rendered with a transparent background at the video's frame rate and laid into the scene (the host,
// captions and items still sit on top), frame by frame, so equations, graphs and geometry move exactly
// as Manim draws them. Manim is optional: install it with `pip install manim` (plus LaTeX for MathTex).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../util.mjs';

const HEADER = `from manim import *
INK = "#2a2346"
PAPER = "#f6f1e6"
RED = "#e2604f"; BLUE = "#5b8fd6"; GOLD = "#f2c14b"; GREEN = "#6aa34c"
`;

/** How to run Manim here: SELFCLONE_MANIM, then selfclone's own venv, then manim or python -m manim on PATH. */
export function findManim() {
  const cands = [];
  if (process.env.SELFCLONE_MANIM) cands.push(process.env.SELFCLONE_MANIM);
  const venv = path.join(process.env.SELFCLONE_CACHE || path.join(os.homedir(), '.cache', 'selfclone'), 'manim');
  cands.push(path.join(venv, 'Scripts', 'python.exe'), path.join(venv, 'bin', 'python'));
  cands.push('manim', 'python', 'python3', 'py');
  for (const c of cands) {
    const isManim = /manim(\.exe)?$/i.test(c);
    const args = isManim ? ['--version'] : ['-m', 'manim', '--version'];
    if (path.isAbsolute(c) && !fs.existsSync(c)) continue;
    const r = spawnSync(c, args, { encoding: 'utf8', timeout: 60000 });
    if (r.status === 0 && /manim/i.test(r.stdout + r.stderr)) return isManim ? { cmd: c, pre: [] } : { cmd: c, pre: ['-m', 'manim'] };
  }
  return null;
}

/**
 * A work folder without spaces: TeX cannot read file names with spaces, so on a machine whose user
 * folder has one, Manim's LaTeX step needs somewhere else to write.
 */
export function manimWorkDir(cacheDir) {
  const prefer = path.resolve(cacheDir, 'manim');
  fs.mkdirSync(prefer, { recursive: true });
  // Windows short names (TECHZO~1) hide spaces that Manim's own path handling brings back.
  if (!/\s/.test(fs.realpathSync.native(prefer))) return prefer;
  const alt = process.platform === 'win32' ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'selfclone', 'manim') : path.join(os.tmpdir(), 'selfclone-manim');
  return /\s/.test(alt) ? prefer : alt;
}

/**
 * Render one Manim scene to transparent PNG frames at `fps`, `width` x `height`. Cached by code, size
 * and frame rate. Returns {dir, frames}.
 */
export function renderManim({ code, scene, width, height, fps, cacheDir, log = () => {} }) {
  const work = manimWorkDir(cacheDir);
  const key = sha256(JSON.stringify({ code, scene, width, height, fps, v: 1 })).slice(0, 16);
  const dir = path.join(work, key);
  const framesDir = path.join(dir, 'frames');
  if (fs.existsSync(path.join(framesDir, 'done'))) {
    return { dir: framesDir, frames: fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length };
  }
  const m = findManim();
  if (!m) throw new Error('This scene file has a "manim" block, but Manim was not found. Install it with "python -m pip install manim" (and LaTeX, such as MiKTeX or TeX Live, for MathTex), or set SELFCLONE_MANIM to its python or manim executable.');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const src = path.join(dir, 'scene.py');
  fs.writeFileSync(src, (/^\s*from manim import/m.test(code) ? '' : HEADER) + code);
  log(`  Manim: rendering ${scene} (${width}x${height})...`);
  const r = spawnSync(m.cmd, [...m.pre, 'render', '-r', `${width},${height}`, '--fps', String(fps), '-t', '--format', 'webm', '--media_dir', path.join(dir, 'media'), '-o', 'out', src, scene], { encoding: 'utf8', cwd: dir, timeout: 600000, maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').split('\n').filter((l) => /Error|error|Exception|line \d+/.test(l)).slice(-4).join(' ').replace(/\s+/g, ' ');
    throw new Error(`Manim failed on ${scene}: ${msg || 'see its output'}`);
  }
  const find = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        const got = find(p);
        if (got) return got;
      } else if (e.name === 'out.webm') return p;
    }
    return null;
  };
  const video = find(path.join(dir, 'media'));
  if (!video) throw new Error(`Manim did not write a video for ${scene}.`);
  const x = spawnSync('ffmpeg', ['-v', 'error', '-y', '-c:v', 'libvpx-vp9', '-i', video, '-vf', `fps=${fps}`, path.join(framesDir, '%d.png')], { encoding: 'utf8' });
  if (x.status !== 0) throw new Error(`ffmpeg could not read Manim's video: ${String(x.stderr).trim().split('\n').pop()}`);
  fs.writeFileSync(path.join(framesDir, 'done'), '');
  return { dir: framesDir, frames: fs.readdirSync(framesDir).filter((f) => f.endsWith('.png')).length };
}
