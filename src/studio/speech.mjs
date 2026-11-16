// selfclone studio: narration. Kokoro (local, CPU, Apache-2.0) is the default voice; ElevenLabs and
// OpenAI are optional and need an API key; any recorded audio file works too. Every provider returns
// mono float samples at 24 kHz, so the rest of the pipeline does not care which one spoke.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const SR = 24000;
export const DEFAULT_VOICE = 'kokoro:af_heart';
export const PROVIDERS = ['kokoro', 'elevenlabs', 'openai'];
export const GAPS = { line: 0.3, lead: 0.35, tail: 0.45 };
// The Kokoro model is fetched at this exact revision and checked against this hash before use.
export const KOKORO = {
  repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
  file: 'onnx/model_quantized.onnx',
  sha256: 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478',
};

/** "kokoro:af_heart" -> {provider, voice}. A bare provider gets its default voice. */
export function parseVoice(spec = DEFAULT_VOICE) {
  const [provider, ...rest] = String(spec).split(':');
  const voice = rest.join(':');
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown voice provider "${provider}". Use ${PROVIDERS.map((p) => `${p}:<voice>`).join(', ')}, or --audio <file> for a recording.`);
  const def = { kokoro: 'af_heart', elevenlabs: '', openai: 'alloy' }[provider];
  if (provider === 'elevenlabs' && !voice) throw new Error('ElevenLabs needs a voice id: --voice elevenlabs:<voice_id>.');
  return { provider, voice: voice || def };
}

/** Split text into sentences, keeping the punctuation. */
export function splitSentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[^a-z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const int16ToFloat = (buf) => {
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2) / 32768;
  return out;
};

let kokoro = null;
async function kokoroSay(text, voice, log) {
  if (!kokoro) {
    let mod;
    try {
      mod = await import('kokoro-js');
    } catch {
      throw new Error('Kokoro is not installed. Run "npm install" in the selfclone folder (kokoro-js is an optional dependency), or use --voice elevenlabs:<id>, --voice openai:<voice> or --audio <file>.');
    }
    const cacheDir = path.join(process.env.SELFCLONE_CACHE || path.join(os.homedir(), '.cache', 'selfclone'), 'kokoro');
    try {
      const { env } = await import('@huggingface/transformers');
      env.cacheDir = cacheDir;
    } catch {
      // keep the library's default cache folder
    }
    log('Loading the Kokoro voice model (downloaded once, about 90 MB)...');
    const model = await mod.KokoroTTS.from_pretrained(KOKORO.repo, { dtype: 'q8', device: 'cpu', revision: KOKORO.revision });
    const file = path.join(cacheDir, ...KOKORO.repo.split('/'), ...KOKORO.file.split('/'));
    if (fs.existsSync(file)) {
      const got = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (got !== KOKORO.sha256) {
        fs.rmSync(file, { force: true });
        throw new Error(`The Kokoro model file did not match its pinned SHA-256 (got ${got.slice(0, 12)}...); it was deleted. Run again to download it afresh.`);
      }
    }
    kokoro = model;
  }
  if (!kokoro.voices[voice]) throw new Error(`Kokoro has no voice "${voice}". Try one of: ${Object.keys(kokoro.voices).join(', ')}.`);
  const a = await kokoro.generate(text, { voice });
  if (a.sampling_rate !== SR) throw new Error(`Kokoro returned ${a.sampling_rate} Hz audio; expected ${SR}.`);
  return a.audio;
}

async function httpPcm(url, init, what) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${what} returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return int16ToFloat(Buffer.from(await res.arrayBuffer()));
}

function elevenlabsSay(text, voice) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('Set ELEVENLABS_API_KEY to use an ElevenLabs voice.');
  return httpPcm(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_24000`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2' }),
  }, 'ElevenLabs');
}

function openaiSay(text, voice) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Set OPENAI_API_KEY to use an OpenAI voice.');
  return httpPcm('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice, input: text, response_format: 'pcm' }),
  }, 'OpenAI');
}

/** Speak one line with the chosen provider. Returns Float32Array samples at 24 kHz. */
export async function speakLine(text, voiceSpec, { log = () => {} } = {}) {
  const { provider, voice } = parseVoice(voiceSpec);
  if (provider === 'kokoro') return kokoroSay(text, voice, log);
  if (provider === 'elevenlabs') return elevenlabsSay(text, voice);
  return openaiSay(text, voice);
}

/** Trim leading and trailing near-silence, so the gaps between lines are the ones we choose. */
export function trimSilence(x, threshold = 0.01) {
  let a = 0;
  let b = x.length;
  while (a < b && Math.abs(x[a]) < threshold) a++;
  while (b > a && Math.abs(x[b - 1]) < threshold) b--;
  a = Math.max(0, a - Math.round(SR * 0.03));
  b = Math.min(x.length, b + Math.round(SR * 0.06));
  return x.subarray(a, b);
}

/**
 * Join spoken lines into one narration. `scenes` is [[samples, ...], ...] (one array per scene).
 * Each scene gets a short lead-in and tail of silence and a pause between lines. Pure.
 * Returns {samples, scenes: [{start, end, lines: [{start, end}]}], seconds}.
 */
export function assemble(scenes, { gaps = GAPS, holds = [] } = {}) {
  const parts = [];
  const out = [];
  let t = 0;
  const silence = (s) => {
    const n = Math.round(s * SR);
    parts.push(new Float32Array(n));
    t += n / SR;
  };
  scenes.forEach((lines, i) => {
    const start = t;
    silence(gaps.lead);
    const marks = [];
    lines.forEach((x, j) => {
      if (j) silence(gaps.line);
      marks.push({ start: t, end: t + x.length / SR });
      parts.push(x);
      t += x.length / SR;
    });
    silence(gaps.tail + (holds[i] || 0));
    out.push({ start, end: t, lines: marks });
  });
  const total = parts.reduce((s, p) => s + p.length, 0);
  const samples = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    samples.set(p, o);
    o += p.length;
  }
  return { samples, scenes: out, seconds: total / SR };
}

/**
 * Timings for a recorded narration (--audio): each scene's share of the file is proportional to the
 * length of its text, and lines likewise within a scene. Approximate; the file is used as it is.
 */
export function proportionalTimings(sceneLines, seconds) {
  const len = (s) => Math.max(1, s.length);
  const total = sceneLines.flat().reduce((s, l) => s + len(l), 0);
  let t = 0;
  return sceneLines.map((lines) => {
    const start = t;
    const marks = lines.map((l) => {
      const d = (len(l) / total) * seconds;
      const m = { start: t, end: t + d };
      t += d;
      return m;
    });
    return { start, end: t, lines: marks };
  });
}

/**
 * Timings for a recorded narration (--audio), from its pauses: the longest silences become the breaks
 * between sentences, each chosen near where the text says the break should fall. Falls back to
 * proportional timings when the recording has too few pauses.
 */
export function alignRecording(samples, sceneLines) {
  const seconds = samples.length / SR;
  const prop = proportionalTimings(sceneLines, seconds);
  const hop = Math.round(0.01 * SR);
  const n = Math.floor(samples.length / hop);
  const rms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = i * hop; k < (i + 1) * hop; k++) s += samples[k] * samples[k];
    rms[i] = Math.sqrt(s / hop);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const quiet = Math.max(1e-4, sorted[Math.floor(n * 0.9)] * 0.08);
  const gaps = [];
  let from = -1;
  for (let i = 0; i <= n; i++) {
    const silent = i < n && rms[i] < quiet;
    if (silent && from < 0) from = i;
    if (!silent && from >= 0) {
      // Only pauses between speech count: not the silence before the first word or after the last.
      if (i - from >= 15 && from > 0 && i < n) gaps.push({ a: from * 0.01, b: i * 0.01, mid: ((from + i) / 2) * 0.01, len: (i - from) * 0.01 });
      from = -1;
    }
  }
  const flat = prop.flatMap((s) => s.lines);
  const breaks = flat.slice(0, -1).map((l) => l.end);
  if (gaps.length < breaks.length) return prop;
  // For each expected break, the nearest long-enough pause not already used, in order.
  const used = new Set();
  let last = 0;
  const chosen = breaks.map((b) => {
    let best = null;
    for (const [k, g] of gaps.entries()) {
      if (used.has(k) || g.mid <= last) continue;
      const score = Math.abs(g.mid - b) - g.len * 2;
      if (!best || score < best.score) best = { k, g, score };
    }
    if (!best) return null;
    used.add(best.k);
    last = best.g.mid;
    return best.g;
  });
  if (chosen.some((g) => !g)) return prop;
  const voicedStart = (() => { for (let i = 0; i < n; i++) if (rms[i] >= quiet) return i * 0.01; return 0; })();
  const voicedEnd = (() => { for (let i = n - 1; i >= 0; i--) if (rms[i] >= quiet) return (i + 1) * 0.01; return seconds; })();
  const marks = flat.map((_, k) => ({ start: k === 0 ? voicedStart : chosen[k - 1].b, end: k === flat.length - 1 ? voicedEnd : chosen[k].a }));
  let k = 0;
  return sceneLines.map((lines, si) => {
    const ls = lines.map(() => marks[k++]);
    const start = si === 0 ? 0 : ls[0].start - 0.2;
    return { start, end: 0, lines: ls };
  }).map((s, si, all) => ({ ...s, end: si === all.length - 1 ? seconds : all[si + 1].start }));
}

/** 16-bit PCM mono WAV. */
export function wavBytes(samples, sr = SR) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

/** Decode any audio file to mono float samples at 24 kHz with the installed ffmpeg. */
export function readAudio(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  if (r.error && r.error.code === 'ENOENT') throw new Error('ffmpeg was not found. Install ffmpeg and make sure it is on your PATH.');
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${path.basename(file)}: ${String(r.stderr).trim().split('\n').pop()}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + Math.floor(b.length / 4) * 4));
}

/** Speak every line of every scene and assemble. Lines are spoken one at a time, so timings are exact. */
export async function narrate(sceneLines, voiceSpec, { log = () => {}, holds = [], voices = null } = {}) {
  const spoken = [];
  let n = 0;
  const count = sceneLines.flat().length;
  for (const [si, lines] of sceneLines.entries()) {
    const xs = [];
    for (const [li, line] of lines.entries()) {
      // Each line can have its own voice (one per character in a dialogue).
      const v = (voices && voices[si] && voices[si][li]) || voiceSpec;
      xs.push(trimSilence(await speakLine(line, v, { log })));
      n++;
      if (n % 5 === 0 || n === count) log(`  spoke ${n} of ${count} lines`);
    }
    spoken.push(xs);
  }
  return assemble(spoken, { holds });
}

export function writeWav(file, samples) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, wavBytes(samples));
}
