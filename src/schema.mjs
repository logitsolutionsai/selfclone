// A small JSON Schema validator (the subset of draft 2020-12 the schemas in schemas/ use), with no
// dependencies. Supported keywords: type, const, enum, properties, required, additionalProperties,
// propertyNames, items, minItems, maxItems, uniqueItems, minLength, maxLength, pattern, minimum,
// maximum, oneOf, anyOf, $ref to "#/$defs/<name>". Patterns come from the schema files in this
// repository, never from user input.
import fs from 'node:fs';

const SCHEMA_DIR = new URL('../schemas/', import.meta.url);
const cache = new Map();

export function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(fs.readFileSync(new URL(name, SCHEMA_DIR), 'utf8')));
  return cache.get(name);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeOk(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

function resolve(root, ref) {
  const m = /^#\/\$defs\/([\w.-]+)$/.exec(ref);
  if (!m || !root.$defs || !root.$defs[m[1]]) throw new Error(`Schema reference not supported: ${ref}`);
  return root.$defs[m[1]];
}

const key = (p, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`);

function check(v, s, root, path, errs) {
  if (s === true) return;
  if (s === false) {
    errs.push({ path, message: 'is not allowed' });
    return;
  }
  if (s.$ref) return check(v, resolve(root, s.$ref), root, path, errs);
  if (s.type) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeOk(v, t))) {
      errs.push({ path, message: `must be ${types.join(' or ')}, not ${typeOf(v)}` });
      return;
    }
  }
  if ('const' in s && JSON.stringify(v) !== JSON.stringify(s.const)) errs.push({ path, message: `must be ${JSON.stringify(s.const)}` });
  if (s.enum && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) errs.push({ path, message: `must be one of ${s.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  if (typeof v === 'string') {
    const len = Array.from(v).length;
    if (s.minLength != null && len < s.minLength) errs.push({ path, message: `must have at least ${s.minLength} characters` });
    if (s.maxLength != null && len > s.maxLength) errs.push({ path, message: `must have at most ${s.maxLength} characters` });
    if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) errs.push({ path, message: `does not match ${s.pattern}` });
  }
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) errs.push({ path, message: `must be at least ${s.minimum}` });
    if (s.maximum != null && v > s.maximum) errs.push({ path, message: `must be at most ${s.maximum}` });
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push({ path, message: `must have at least ${s.minItems} items` });
    if (s.maxItems != null && v.length > s.maxItems) errs.push({ path, message: `must have at most ${s.maxItems} items` });
    if (s.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errs.push({ path, message: 'must not repeat items' });
    if (s.items) v.forEach((x, i) => check(x, s.items, root, `${path}[${i}]`, errs));
  }
  if (typeOf(v) === 'object') {
    const props = s.properties || {};
    for (const r of s.required || []) if (!Object.prototype.hasOwnProperty.call(v, r)) errs.push({ path: key(path, r), message: 'is required' });
    for (const k of Object.keys(v)) {
      if (s.propertyNames) check(k, s.propertyNames, root, `${key(path, k)} (name)`, errs);
      if (Object.prototype.hasOwnProperty.call(props, k)) check(v[k], props[k], root, key(path, k), errs);
      else if (s.additionalProperties === false) errs.push({ path: key(path, k), message: 'is not an allowed field' });
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(v[k], s.additionalProperties, root, key(path, k), errs);
    }
  }
  if (s.anyOf) {
    const ok = s.anyOf.some((b) => {
      const e = [];
      check(v, b, root, path, e);
      return !e.length;
    });
    if (!ok) errs.push({ path, message: 'does not match any allowed shape' });
  }
  if (s.oneOf) {
    const results = s.oneOf.map((b) => {
      const e = [];
      check(v, b, root, path, e);
      return e;
    });
    const passing = results.filter((e) => !e.length).length;
    if (passing !== 1) {
      // Report the errors of the closest branch: the one with the fewest errors.
      const best = results.slice().sort((a, b) => a.length - b.length)[0] || [];
      if (passing === 0) errs.push(...(best.length ? best : [{ path, message: 'does not match any allowed shape' }]));
      else errs.push({ path, message: 'matches more than one allowed shape' });
    }
  }
}

/** Validate a value against a schema object; returns a list of { path, message } (empty when valid). */
export function validate(value, schema) {
  const errs = [];
  check(value, schema, schema, '$', errs);
  return errs;
}

export function validateNamed(value, name) {
  return validate(value, loadSchema(name));
}

export const formatErrors = (errs, max = 8) =>
  errs
    .slice(0, max)
    .map((e) => `${e.path} ${e.message}`)
    .join('; ') + (errs.length > max ? `; and ${errs.length - max} more` : '');

// Keys that must never appear in a user-supplied JSON file, at any depth.
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** JSON.parse that refuses prototype keys anywhere in the document. */
export function safeJsonParse(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ''), (k, v) => {
    if (FORBIDDEN_KEYS.has(k)) throw new Error(`the key "${k}" is not allowed`);
    return v;
  });
}

/** Canonical JSON: object keys sorted at every depth, strings Unicode NFC-normalised, no whitespace. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'));
    if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k.normalize('NFC'))}:${canonicalJson(value[k])}`).join(',')}}`;
}

/** Pretty JSON with keys sorted, so the same input always gives byte-identical files. */
export function stableStringify(value) {
  const sort = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(sort);
    return Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, sort(v[k])]));
  };
  return JSON.stringify(sort(value), null, 2) + '\n';
}
