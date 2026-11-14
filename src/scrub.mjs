// Secrets scrubber. Runs on every message (and its context) during ingest.
// It replaces likely secrets and personal identifiers with placeholders such as
// [EMAIL]. It errs on the side of scrubbing; a missed secret is worse than a
// scrubbed harmless string.

const PLACEHOLDER = (name) => `[${name}]`;

// Words that can follow "password is" in normal speech; not treated as a password.
const PASSWORD_VALUE_STOP = new Set([
  'in', 'on', 'at', 'the', 'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'that',
  'wrong', 'right', 'correct', 'incorrect', 'too', 'still', 'not', 'same', 'different', 'expired',
  'weak', 'strong', 'saved', 'written', 'under', 'for', 'required', 'needed', 'case', 'changed',
  'reset', 'new', 'old', 'easy', 'hard', 'long', 'short', 'fine', 'ok', 'okay', 'what', 'who',
  'something', 'nothing', 'there', 'here', 'below', 'above', 'attached', 'secret', 'safe', 'sent',
  'stored', 'invalid', 'valid', 'missing', 'empty', 'blank', 'set', 'also', 'and', 'or', 'just',
]);

export function luhnValid(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function ibanValid(raw) {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 ? String(code - 55) : ch;
    for (const digit of val) rem = (rem * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

export function shannonEntropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// A lowercase hyphenated slug made of words and short numbers ("sailing-tips-2026").
// Medium-style slugs end in a short hash ("sailing-tips-2026-3f9a1c"); most parts are still words.
function isWordSlug(tok) {
  const parts = tok.split('-');
  if (parts.length < 2 || !parts.every((p) => /^[a-z0-9]{1,12}$/.test(p))) return false;
  const wordParts = parts.filter((p) => /^[a-z]{3,}$/.test(p)).length;
  return wordParts >= 2 && wordParts * 2 >= parts.length;
}

function looksLikeGenericSecret(tok) {
  if (tok.length < 24) return false;
  if (/^\[.*\]$/.test(tok)) return false;
  const hasDigit = /\d/.test(tok);
  const hasLower = /[a-z]/.test(tok);
  const hasUpper = /[A-Z]/.test(tok);
  if (!hasDigit) return false; // long words, slugs and hashtags have no digits
  if (!(hasLower || hasUpper)) return false; // pure numbers are handled elsewhere
  if (/^[a-z]+(?:-[a-z0-9]+)+$/.test(tok) && !/\d{4,}/.test(tok)) return false; // url-ish slug
  if (isWordSlug(tok)) return false;
  const kinds = [hasDigit, hasLower, hasUpper].filter(Boolean).length;
  const h = shannonEntropy(tok);
  // hex digests (sha1/sha256, git commits) have entropy near 4 bits with two kinds
  return h >= 3.5 && (kinds >= 2);
}

const SENSITIVE_PARAMS = /[?&#](?:access_token|refresh_token|id_token|token|auth|authorization|key|api_key|apikey|api-key|secret|client_secret|password|passwd|pwd|sig|signature|code|session|sessionid|sid|x-amz-signature|x-amz-credential|x-amz-security-token|jwt)=/i;
// Any scheme ("https://", "postgres://", "mongodb+srv://").
const URL_ANY = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"')\]]+/gi;
// Webhook URLs are credentials by themselves.
const CAPABILITY_URL = /^https?:\/\/(?:hooks\.slack\.com\/(?:services|workflows)\/|(?:[a-z]+\.)?discord(?:app)?\.com\/api\/webhooks\/|outlook\.office\.com\/webhook\/|[a-z0-9-]+\.webhook\.office\.com\/)/i;

// Password labels in a few languages, and the words for "is" that follow them.
const PW_LABELS = 'pass(?:word|wd|code|phrase)?|pwd|pw|pin|passcode|senha|contrase[ñn]a|clave|passwort|kennwort|mot de passe|mdp|wachtwoord|has[łl]o|l[öo]senord|passord|adgangskode|salasana|[şs]ifre|пароль|密码|パスワード';
const PW_SEP = String.raw`\s+(?:is|was)\s*(?:=|:|：|->)\s*|\s+(?:is|was)\s+|\s*(?:=|:|：|->)\s*|\s+[-–]\s+|\s+(?:é|es|est|ist|è|er|är|on|era|war)\s+`;
const PW_RE = new RegExp(String.raw`(?<![\p{L}\p{N}_])(${PW_LABELS})(?![\p{L}])((?:\s+(?:for|to|of|on|da|do|de|für|pour|del)\s[^.!?\n:=]{0,30}?)?)(${PW_SEP})(?:"([^"\n]{3,64})"|'([^'\n]{3,64})'|\x60([^\x60\n]{3,64})\x60|([^\s"'\x60]{3,}))`, 'giu');
// "wifi password BlueWhale2026", "pw Sailboat!77": no separator, so the value must contain a digit or symbol.
// A bare "pass" is left alone: "pass 3pm" is a verb far more often than a password.
const PW_BARE_RE = new RegExp(String.raw`(?<![\p{L}\p{N}_])(password|passwd|passcode|pwd|pw)(?![\p{L}])(\s+)([^\s"'\x60]{4,})`, 'giu');
// Wi-Fi network keys written as "wifi: x".
const WIFI_RE = /\b(wi-?fi|wlan)(\s*[:=]\s*)([^\s"'`]{4,})/gi;
// Door, gate and card codes: "PIN 4471", "door code 4471#", "the code for the shed is 4471", "cvv 123".
const CODE_RE = /(?<!\b(?:error|status|http|exit|response|return|area|country|zip|postal|post|source|dial|tax|dress|promo|discount|coupon|qr|bar|morse|reference|ref|product|item|course|class|module)\s+)\b((?:(?:door|gate|alarm|lock|garage|entry|access|building|safe|locker|padlock|security|bike|key ?safe)\s+)?(?:code|pin|combo|combination|cvv2?|cvc|csc))\b((?:\s+(?:for|to|of|on)\b[^.!?\n:=]{0,30}?)?\s*(?:\bis\b|\bwas\b|=|:)?\s*)(\d{3,8})(#?)(?![\d:/.,]?\d)/gi;
// Seed and recovery phrases run to the end of the line.
const PHRASE_RE = /\b(pass ?phrase|seed phrase|recovery phrase|mnemonic)(\s*(?:is|:|=)\s*)([^\n]{3,300})/gi;

function hasDigitOrSymbol(v) {
  const core = v.replace(/[.,!?)]+$/, '');
  return /\d/.test(core) || /[^\p{L}\p{N}]/u.test(core);
}

/**
 * Scrub one string. Returns { text, counts } where counts maps placeholder
 * names to the number of replacements.
 */
export function scrub(input) {
  let text = String(input ?? '');
  const counts = {};
  const put = (name) => {
    counts[name] = (counts[name] || 0) + 1;
    return PLACEHOLDER(name);
  };

  // 1. Private key blocks.
  text = text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, () => put('PRIVATE_KEY'));

  // 2. URLs that carry credentials in the query string, user:pass@ in the authority,
  //    a webhook address, or a long random path segment (share links, signed links).
  text = text.replace(URL_ANY, (url) => {
    if (SENSITIVE_PARAMS.test(url) || /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(url) || CAPABILITY_URL.test(url)) return put('TOKEN_URL');
    const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '');
    if (rest.split(/[/?&=#]/).some(looksLikeGenericSecret)) return put('TOKEN_URL');
    return url;
  });

  // 3. Well-known API key formats.
  const keyPatterns = [
    /(?<![A-Za-z0-9])sk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic style
    /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g, // AWS access key id
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
    /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
    /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
    /\b(?:sk|rk|pk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g, // Stripe
    /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab
    /\bnpm_[A-Za-z0-9]{36}\b/g, // npm
    /\bhf_[A-Za-z0-9]{30,}\b/g, // Hugging Face
  ];
  for (const re of keyPatterns) text = text.replace(re, () => put('API_KEY'));

  // JSON Web Tokens.
  text = text.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, () => put('TOKEN'));

  // 4. Password lines: "password: x", "pw = x", "the wifi password is x", "senha: x",
  //    "password for the shed is 4471", "wifi password X9y", seed phrases, door codes, PINs, CVVs.
  text = text.replace(PHRASE_RE, (m, label, sep, value) => (/^\[[A-Z_]+\]$/.test(value.trim()) ? m : `${label}${sep}${put('PASSWORD')}`));
  text = text.replace(PW_RE, (m, label, forWhat, sep, dq, sq, bq, bare) => {
    const value = dq ?? sq ?? bq ?? bare;
    const q = dq != null ? '"' : sq != null ? "'" : bq != null ? '`' : '';
    if (/^\[[A-Z_]+\]$/.test(value)) return m;
    const isColon = /[:=：]|->/.test(sep);
    const isIs = /^\s+(?:is|was)\s+$/i.test(sep);
    if (/^pin$/i.test(label) && !/\d/.test(value)) return m; // "the pin is broken"
    if (!q && !isColon) {
      const word = value.toLowerCase().replace(/[.,!?]+$/, '');
      if (PASSWORD_VALUE_STOP.has(word)) return m;
      if (/^[a-z]+[.,!?]*$/.test(value) && value.length <= 3) return m;
      if (!isIs && !hasDigitOrSymbol(value)) return m; // "password - what a pain", "a senha é segura"
    }
    // Keep sentence punctuation after an unquoted value: "the password is X9y." -> "[PASSWORD]."
    const tail = q ? '' : (value.match(/[.,;)]+$/) || [''])[0];
    if (tail === value) return m;
    return `${label}${forWhat || ''}${sep}${q}${put('PASSWORD')}${q}${tail}`;
  });
  text = text.replace(PW_BARE_RE, (m, label, sp, value) => {
    // Already scrubbed by the labelled rule above ("password is:[PASSWORD]"): leave it alone.
    if (/\[[A-Z_]+\]/.test(value) || !hasDigitOrSymbol(value)) return m;
    const tail = (value.match(/[.,;)]+$/) || [''])[0];
    if (tail === value) return m;
    return `${label}${sp}${put('PASSWORD')}${tail}`;
  });
  text = text.replace(WIFI_RE, (m, label, sep, value) => (/^\[[A-Z_]+\]$/.test(value) || !hasDigitOrSymbol(value) ? m : `${label}${sep}${put('PASSWORD')}`));
  text = text.replace(CODE_RE, (m, label, mid, digits, hash) => `${label}${mid}${put('PASSWORD')}`);

  // 5. IBANs (validated with the mod-97 checksum).
  text = text.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, (m) => (ibanValid(m) ? put('IBAN') : m));

  // 6. Card numbers (13-19 digits, optional spaces or dashes, Luhn valid).
  text = text.replace(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, (m) => {
    const digits = m.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19) return m;
    if (/^(\d)\1+$/.test(digits)) return m;
    return luhnValid(digits) ? put('CARD') : m;
  });

  // 7. Email addresses.
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => put('EMAIL'));
  // Spelled-out addresses: "rosa (at) example (dot) com", "rosa [at] example [dot] pt".
  text = text.replace(/\b[A-Za-z0-9._%+-]+\s*[[(]\s*at\s*[\])]\s*[A-Za-z0-9-]+(?:\s*(?:[[(]\s*dot\s*[\])]|\.)\s*[A-Za-z0-9-]+)+\b/gi, () => put('EMAIL'));

  // US social security numbers, and bank account numbers that are named as such.
  text = text.replace(/(?<![\w-])(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}(?![\w-])/g, () => put('ID_NUMBER'));
  text = text.replace(/\b((?:bank\s+)?(?:account|acct|a\/c|routing|sort code|bsb)(?:\s*(?:number|no\.?|nr|#))?\s*[:#]?\s*)(\d{2}-\d{2}-\d{2}|\d{3}-\d{3}|\d{6,12})(?![\w-])/gi, (m, pre) => `${pre}${put('ACCOUNT')}`);

  // 8. Phone numbers. International form with +, or common national groupings.
  text = text.replace(/(?<![\w+])\+\d[\d\s().-]{6,}\d(?!\d)/g, (m) => {
    const digits = m.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? put('PHONE') : m;
  });
  text = text.replace(/(?<![\w/.:-])(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w/.:-])/g, () => put('PHONE'));
  text = text.replace(/(?<![\w/.:-])0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}(?![\w/.:-])/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) return m;
    if (/^\d+$/.test(m) && digits.length !== 11 && !/^0[1-9]/.test(m)) return m; // bare 10-digit runs are ambiguous unless they start with a trunk 0
    return put('PHONE');
  });
  // Other national groupings: "06 12 34 56 78" (FR), "912 345 678" (PT), "030 901820" (DE),
  // "98765 43210" (IN), "(11) 91234-5678" (BR), "06-12345678" (NL). 9 to 11 digits in groups;
  // two groups only count when the number starts with a trunk 0 or is split 5 + 5.
  text = text.replace(/(?<![\w/.:,+-])(?:\(\d{2,4}\)\s?\d{2,8}|\d{2,5})(?:[ .-]\d{2,8}){1,4}(?![\w/:-]|[.,]\d)/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 11) return m;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(m)) return m; // IPv4 address
    const groups = m.split(/[ .()-]+/).filter(Boolean);
    if (groups.slice(1).some((g) => /^0+$/.test(g))) return m; // "100 000 000": an amount, not a phone
    const ok = groups.length >= 3 || /^[0(]/.test(m) || (groups.length === 2 && groups[0].length === 5 && groups[1].length === 5);
    return ok ? put('PHONE') : m;
  });
  // Any 8 to 15 digit number right after a word that introduces a phone number.
  text = text.replace(/(\b(?:call|ring|phone|tel|telephone|mobile|mob|cell|cellphone|whatsapp|text|sms|number|contact|reach)\b[^\d\n[]{0,15})(\(?\d[\d\s().-]{6,}\d)(?![\w/:-]|[.,]\d)/gi, (m, pre, num) => {
    const digits = num.replace(/\D/g, '');
    if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(num.trim())) return m; // a date
    return digits.length >= 8 && digits.length <= 15 ? `${pre}${put('PHONE')}` : m;
  });

  // 9. Generic long high-entropy tokens. URLs left after step 2 are skipped: their
  //    segments were already checked, and a token regex across slashes mangles them.
  text = text.replace(new RegExp(`${URL_ANY.source}|(?<![A-Za-z0-9_\\-+/=])[A-Za-z0-9_\\-+/=]{24,}(?![A-Za-z0-9_\\-+/=])`, 'gi'), (m) =>
    /^[a-z][a-z0-9+.-]*:\/\//i.test(m) ? m : looksLikeGenericSecret(m) ? put('SECRET') : m
  );

  return { text, counts };
}

export function mergeCounts(into, add) {
  for (const [k, v] of Object.entries(add)) into[k] = (into[k] || 0) + v;
  return into;
}
