// Channel profiles: which kind of writing a training record is, finer than kinds.mjs.
// message, email and post come straight from the source kind (kinds.mjs). The developer channels
// (dev, docs, changelog, pr) come from an explicit "register" column in a JSONL or CSV export, or from
// the name of a Markdown or text file ("CHANGELOG.md" is changelog, "README.md" and docs are docs).
import { kindOf } from '../kinds.mjs';

export const CHANNELS = ['message', 'email', 'post', 'dev', 'docs', 'changelog', 'pr'];

// Where a channel with too little evidence of its own backs off to. null means the global pool.
export const PARENT = { message: null, email: null, post: null, dev: null, docs: 'dev', changelog: 'dev', pr: 'dev' };

export const CHANNEL_LABELS = {
  message: 'Chat',
  email: 'Email',
  post: 'Posts',
  dev: 'Developer discussion',
  docs: 'Documentation',
  changelog: 'Changelogs',
  pr: 'Pull requests',
};

export function channelOf(r) {
  if (r.register && CHANNELS.includes(r.register)) return r.register;
  if (r.source === 'text') {
    const base = String(r.thread || '').replace(/^text:/, '');
    if (/changelog|release[-_ ]?notes|history\.md$/i.test(base)) return 'changelog';
    if (/readme|contributing|docs?\b|guide|manual/i.test(base)) return 'docs';
  }
  return kindOf(r.source);
}

/**
 * The unit a bootstrap resamples and a threshold counts: one conversation. A thread on one calendar day
 * (UTC) is one conversation, so a long-running chat export is not counted as a single thread.
 */
export function conversationKey(r) {
  const day = r.ts ? String(r.ts).slice(0, 10) : 'undated';
  return `${r.thread || r.turn || r.id}|${day}`;
}
