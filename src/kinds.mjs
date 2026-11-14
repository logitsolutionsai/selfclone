// Which kind of writing each ingest source is: chat messages, public posts and notes, or email.
// Voicecheck, the fingerprint and the exports use this to compare like with like.
export const KINDS = ['message', 'post', 'email'];

// Sources not listed count as messages.
export const SOURCE_KIND = {
  whatsapp: 'message',
  telegram: 'message',
  slack: 'message',
  discord: 'message',
  instagram: 'message',
  messenger: 'message',
  linkedin: 'message',
  imessage: 'message',
  googlechat: 'message',
  jsonl: 'message',
  csv: 'message',
  x: 'post',
  text: 'post',
  reddit: 'post',
  docx: 'post',
  blog: 'post',
  mbox: 'email',
};

export const kindOf = (source) => SOURCE_KIND[source] || 'message';
