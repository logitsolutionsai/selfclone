// Re-exports used by the CLI plus the sealed-set integrity check.
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './util.mjs';
import { sealedDigest } from './split.mjs';

export { parseArgs, workDir, readJsonl, writeJsonl, readJson, writeJson, writeText, VERSION } from './util.mjs';

/** Throws if sealed.jsonl changed after the split was made. */
export function sealedDigestCheck(dir, sealed) {
  const metaFile = path.join(dir, 'split.json');
  if (!fs.existsSync(metaFile)) return;
  const meta = readJson(metaFile);
  if (meta.sealedSha256 && meta.sealedSha256 !== sealedDigest(sealed)) {
    throw new Error('sealed.jsonl was changed after it was sealed (hash mismatch). Re-run selfclone ingest to make a fresh split.');
  }
}
