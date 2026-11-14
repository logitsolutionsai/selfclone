// A local consent ledger, .selfclone/consent.json, for the text features (profile, lint, stylecard).
// The face already asks for a consent statement in `selfclone bake`; this adds the same for writing,
// with a scope per use. Revoking a scope blocks future runs that need it. It cannot erase files that
// were already shared, and the commands say so.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './util.mjs';
import { invalid } from './errors.mjs';
import { safeJsonParse } from './schema.mjs';

export const SCOPES = ['persona', 'local-lint', 'public-stylecard', 'avatar'];
const FILE = 'consent.json';

export function readLedger(dir) {
  const f = path.join(dir, FILE);
  if (!fs.existsSync(f)) return { schemaVersion: 1, records: [] };
  const l = safeJsonParse(fs.readFileSync(f, 'utf8'));
  if (!l || l.schemaVersion !== 1 || !Array.isArray(l.records)) throw invalid('E_CONSENT_LEDGER', `${f} is not a valid consent ledger.`, 'Move it aside and grant consent again with selfclone consent --grant.');
  return l;
}

function writeLedger(dir, l) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(l, null, 2) + '\n');
}

export function parseScopes(raw) {
  const list = String(raw || 'local-lint')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of list) if (!SCOPES.includes(s)) throw invalid('E_ARGS', `Unknown consent scope "${s}".`, `Use one or more of ${SCOPES.join(', ')}, comma-separated.`);
  return [...new Set(list)].sort();
}

/** Record consent. The id depends only on the statement and scopes, so granting twice is idempotent. */
export function grant(dir, statement, scopes, now = new Date()) {
  const text = String(statement || '').trim();
  if (text.length < 8) throw invalid('E_CONSENT', 'The consent statement is too short.', 'Pass a statement such as --grant "This is my own writing. Alex Doe".');
  const l = readLedger(dir);
  const id = `consent-${sha256(`${text.normalize('NFC')}|${scopes.join(',')}`).slice(0, 12)}`;
  let rec = l.records.find((r) => r.id === id);
  if (!rec) {
    rec = { id, statement: text, scopes, grantedAt: now.toISOString(), revoked: {} };
    l.records.push(rec);
  }
  for (const s of scopes) delete rec.revoked[s];
  writeLedger(dir, l);
  return rec;
}

/** Revoke a scope on every record. Returns the number of records changed. */
export function revoke(dir, scope, now = new Date()) {
  const l = readLedger(dir);
  let n = 0;
  for (const r of l.records) {
    if (r.scopes.includes(scope) && !r.revoked[scope]) {
      r.revoked[scope] = now.toISOString();
      n++;
    }
  }
  writeLedger(dir, l);
  return n;
}

/** The newest record that grants this scope and has not revoked it, or null. */
export function activeConsent(dir, scope) {
  const l = readLedger(dir);
  const ok = l.records.filter((r) => r.scopes.includes(scope) && !r.revoked[scope]);
  return ok.length ? ok[ok.length - 1] : null;
}

export function requireConsent(dir, scope) {
  const rec = activeConsent(dir, scope);
  if (rec) return rec;
  const revoked = readLedger(dir).records.some((r) => r.scopes.includes(scope) && r.revoked[scope]);
  throw invalid(
    'E_CONSENT',
    revoked ? `Consent for "${scope}" was revoked, so this will not run.` : `No consent recorded for "${scope}".`,
    revoked
      ? `Grant it again only if the writer agrees: selfclone consent --grant "<statement>" --scope ${scope}. Revoking does not delete files that were already shared.`
      : `Only for your own writing, or writing whose author gave written consent: selfclone consent --grant "This is my own writing. <Full Name>" --scope ${scope}`,
  );
}
