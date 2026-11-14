// Fetches the pinned MediaPipe files once and caches them on disk, so enrolment
// and baking work from 127.0.0.1 and repeated bakes do not hit the network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const MP_VERSION = '1.2.0';
export const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export const ALLOWED = new Map([
  ['vision_bundle.mjs', `${MP_CDN}/vision_bundle.mjs`],
  ['wasm/vision_wasm_internal.js', `${MP_CDN}/wasm/vision_wasm_internal.js`],
  ['wasm/vision_wasm_internal.wasm', `${MP_CDN}/wasm/vision_wasm_internal.wasm`],
  ['wasm/vision_wasm_nosimd_internal.js', `${MP_CDN}/wasm/vision_wasm_nosimd_internal.js`],
  ['wasm/vision_wasm_nosimd_internal.wasm', `${MP_CDN}/wasm/vision_wasm_nosimd_internal.wasm`],
  ['wasm/vision_wasm_module_internal.js', `${MP_CDN}/wasm/vision_wasm_module_internal.js`],
  ['wasm/vision_wasm_module_internal.wasm', `${MP_CDN}/wasm/vision_wasm_module_internal.wasm`],
  ['face_landmarker.task', MODEL_URL],
]);

// SHA-256 of every pinned file. The JavaScript and wasm hashes are the ones jsDelivr
// publishes for @mediapipe/tasks-vision@1.2.0; the model hash was taken from a copy whose
// MD5 matches the x-goog-hash Google Cloud Storage reports for it. A download or a cached
// file that does not match is refused, so a compromised CDN or cache cannot run code.
export const SHA256 = new Map([
  ['vision_bundle.mjs', '870da5cfc43bfcf2a8b0f14e8152dae8c7e701722e1191b0e592b94b81b4127a'],
  ['wasm/vision_wasm_internal.js', '85c1a342be70427987f900969a5f26e17557351111364e6585e97fb03e93e108'],
  ['wasm/vision_wasm_internal.wasm', 'bcc13df22d3d69ec8cbe8e280989356d844ae00f4523eb82072d2484f44134dc'],
  ['wasm/vision_wasm_nosimd_internal.js', 'e9b2b799e0f1078f5538b300a57835b823742c37e2646308a03f0f25b39fdcdc'],
  ['wasm/vision_wasm_nosimd_internal.wasm', 'ed5e5e5812490bd90d6a440290845ff9e4c516f696847a28a0c0e0573470d469'],
  ['wasm/vision_wasm_module_internal.js', '60384c9014750321c0fc1d489b3329e5eaed0fcf3c328d404ecb1a6c75e89d17'],
  ['wasm/vision_wasm_module_internal.wasm', '2e326b9d9584ac22e230c263f47e6fe694a7df1ce22a8546c72df0e5c0fc1066'],
  ['face_landmarker.task', '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
]);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const checked = new Map(); // cache file -> "size:mtime" already verified in this process

export function cacheDir() {
  return process.env.SELFCLONE_CACHE || path.join(os.homedir(), '.cache', 'selfclone', `mediapipe-${MP_VERSION}`);
}

export function contentType(rel) {
  if (/\.m?js$/.test(rel)) return 'text/javascript; charset=utf-8';
  if (/\.wasm$/.test(rel)) return 'application/wasm';
  return 'application/octet-stream';
}

const inflight = new Map();

/** Returns the bytes of an allowed MediaPipe asset, downloading it on first use. */
export async function getAsset(rel) {
  const url = ALLOWED.get(rel);
  const want = SHA256.get(rel);
  if (!url || !want) return null;
  const file = path.join(cacheDir(), rel);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) {
    const st = fs.statSync(file);
    const stamp = `${st.size}:${st.mtimeMs}`;
    const buf = fs.readFileSync(file);
    if (checked.get(file) === stamp || sha256(buf) === want) {
      checked.set(file, stamp);
      return buf;
    }
    fs.rmSync(file, { force: true }); // changed or damaged since it was downloaded: fetch it again
  }
  if (inflight.has(rel)) return inflight.get(rel);
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== want) throw new Error(`Integrity check failed for ${url}: expected SHA-256 ${want}, got ${got}. Nothing was saved.`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    return buf;
  })();
  inflight.set(rel, p);
  try {
    return await p;
  } finally {
    inflight.delete(rel);
  }
}
