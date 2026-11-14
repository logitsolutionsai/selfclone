// A bounded path glob matcher with no dependencies, for policy scopes and ignore lists.
// Syntax: "*" matches any characters inside one path segment, "?" one character, "**" any number of
// whole segments (including none). Nothing else is special: no braces, no character classes, no
// negation. Matching is dynamic programming over segments, so its cost is at most
// (pattern segments) x (path segments) x (segment length squared), with no backtracking blow-up.
import { invalid } from '../errors.mjs';

export const MAX_GLOB_LENGTH = 200;
const ALLOWED = /^[A-Za-z0-9._\-/*?@+ ]+$/;

/** Throws unless the glob is relative, has no ".." segment and uses only the supported syntax. */
export function checkGlob(glob) {
  const g = String(glob);
  const bad = (why) => invalid('E_POLICY_SCHEMA', `The glob "${g.slice(0, 80)}" is not allowed: ${why}.`, 'Use a relative glob such as "docs/**/*.md".');
  if (!g || g.length > MAX_GLOB_LENGTH) throw bad(`it must have 1 to ${MAX_GLOB_LENGTH} characters`);
  if (/^[\\/]|^[A-Za-z]:|^~/.test(g)) throw bad('it is an absolute path');
  if (g.includes('\\')) throw bad('use forward slashes');
  if (g.split('/').some((s) => s === '..' || s === '.')) throw bad('it has a "." or ".." segment');
  if (!ALLOWED.test(g)) throw bad('only letters, digits, . _ - / * ? @ + and spaces are supported');
  if (/\*\*\*/.test(g) || g.split('/').some((s) => s.includes('**') && s !== '**')) throw bad('"**" must be a whole segment');
  return g;
}

function segMatch(p, s) {
  // Classic wildcard DP for one segment: "*" any run, "?" one character.
  const P = Array.from(p);
  const S = Array.from(s);
  let prev = new Array(S.length + 1).fill(false);
  prev[0] = true;
  for (let i = 1; i <= P.length; i++) {
    const cur = new Array(S.length + 1).fill(false);
    if (P[i - 1] === '*') cur[0] = prev[0];
    for (let j = 1; j <= S.length; j++) {
      if (P[i - 1] === '*') cur[j] = prev[j] || cur[j - 1];
      else if (P[i - 1] === '?' || P[i - 1] === S[j - 1]) cur[j] = prev[j - 1];
    }
    prev = cur;
  }
  return prev[S.length];
}

/** True when the POSIX relative path matches the glob. */
export function globMatch(glob, relPath) {
  const ps = String(glob).split('/');
  const ss = String(relPath).split('/');
  // dp[i][j]: the first i pattern segments match the first j path segments.
  let prev = new Array(ss.length + 1).fill(false);
  prev[0] = true;
  for (let i = 1; i <= ps.length; i++) {
    const cur = new Array(ss.length + 1).fill(false);
    const p = ps[i - 1];
    if (p === '**') {
      for (let j = 0; j <= ss.length; j++) cur[j] = prev[j] || (j > 0 && cur[j - 1]);
    } else {
      for (let j = 1; j <= ss.length; j++) cur[j] = prev[j - 1] && segMatch(p, ss[j - 1]);
    }
    prev = cur;
  }
  return prev[ss.length];
}
