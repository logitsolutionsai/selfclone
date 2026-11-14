// voice-policy.json: a hand-edited, data-only rules file. Six rule types (V1): phrase, heading-length,
// max-paragraph-words, case-at-start, terminal-punctuation, min-context (advisory only). No code, no
// shell, no regular expressions from the file, no remote configuration.
import fs from 'node:fs';
import { safeJsonParse, validateNamed, formatErrors } from '../schema.mjs';
import { invalid, wrapIo } from '../errors.mjs';
import { checkGlob } from './glob.mjs';

export const RULE_TYPES = ['phrase', 'heading-length', 'max-paragraph-words', 'case-at-start', 'terminal-punctuation', 'min-context'];
export const MAX_POLICY_BYTES = 256 * 1024;

export function parsePolicy(text, where = 'the policy') {
  if (Buffer.byteLength(String(text)) > MAX_POLICY_BYTES) throw invalid('E_POLICY_SCHEMA', `${where} is larger than ${MAX_POLICY_BYTES / 1024} KB.`, 'Keep the policy to a short list of rules.');
  let p;
  try {
    p = safeJsonParse(text);
  } catch (e) {
    throw invalid('E_POLICY_SCHEMA', `${where} is not valid JSON: ${e.message}.`, 'Fix the JSON, or start again from selfclone kit init.');
  }
  const errs = validateNamed(p, 'voice-policy.v1.schema.json');
  if (errs.length) throw invalid('E_POLICY_SCHEMA', `${where} does not match schemas/voice-policy.v1.schema.json: ${formatErrors(errs)}.`, 'See docs/VOICE-CI.md for the rule fields.');
  for (const s of p.scopes || []) checkGlob(s.glob);
  for (const g of p.ignore || []) checkGlob(g);
  const ids = new Set();
  for (const r of p.rules) {
    if (ids.has(r.id)) throw invalid('E_POLICY_SCHEMA', `${where} has two rules with the id "${r.id}".`, 'Give every rule its own id.');
    ids.add(r.id);
  }
  return p;
}

export function loadPolicy(file) {
  let text;
  try {
    const st = fs.statSync(file);
    if (st.size > MAX_POLICY_BYTES) throw invalid('E_POLICY_SCHEMA', `${file} is larger than ${MAX_POLICY_BYTES / 1024} KB.`, 'Keep the policy to a short list of rules.');
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw wrapIo(e, file);
  }
  return parsePolicy(text, file);
}

export const severityOf = (rule) => rule.severity || (rule.mode === 'hard' ? 'error' : 'warning');
