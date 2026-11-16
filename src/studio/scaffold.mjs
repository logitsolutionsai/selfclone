// selfclone studio: a starter scene file for any topic, so an agent (Claude Code, Codex, Cursor) or a
// person starts from a valid file that already uses the main devices: a title card, a host or a dialogue,
// props, a chart, a drawn item, scenery and transitions. Every "say" is a placeholder to replace.

/** A starter scene file. host: "own" (character.json), "random", "dialogue" (two random people) or "none". */
export function scaffold({ topic = 'Your topic', host = 'random', aspect = '16:9' } = {}) {
  const tall = aspect === '9:16';
  const cast = {
    own: { host: { character: 'character.json', voice: 'kokoro:af_heart' } },
    random: { host: { character: `random:${topic}`, voice: 'kokoro:af_heart' } },
    dialogue: { host: { character: `random:${topic}:host`, voice: 'kokoro:af_bella' }, guest: { character: `random:${topic}:guest`, voice: 'kokoro:am_adam', body: 'full' } },
    none: null,
  }[host];
  if (cast === undefined) throw new Error('--host must be own, random, dialogue or none.');
  const on = (placement) => (cast ? placement : false);
  const two = host === 'dialogue';
  const scenes = [
    {
      say: two
        ? [{ who: 'host', text: `Hello! Today: ${topic}.` }, { who: 'guest', text: 'TODO: the question a viewer would ask?' }]
        : [`Hello! Today: ${topic}.`, 'TODO: one sentence on why it matters.'],
      title: topic.slice(0, 80),
      background: '#7fb6d6', backdrop: 'clouds', particles: 'dust',
      ...(two ? { characters: { host: { x: 0.25, enter: 'rise', name: 'TODO host name' }, guest: { x: 0.78, enter: 'walk-right', scale: 0.8, name: 'TODO guest name' } } } : { character: on({ x: tall ? 0.5 : 0.5, enter: 'rise' }) }),
    },
    {
      say: ['TODO: the first idea, in one or two short sentences.', 'TODO: an example the viewer knows.'],
      background: '#8fc6a0', backdrop: 'grid', transition: 'push',
      character: on({ x: tall ? 0.5 : 0.2, scale: 0.85 }),
      items: [
        { prop: 'lightbulb', x: tall ? 0.3 : 0.55, y: tall ? 0.2 : 0.3, w: tall ? 0.25 : 0.12, at: 0.6, loop: 'pulse' },
        { text: 'TODO key word', x: tall ? 0.6 : 0.72, y: tall ? 0.3 : 0.32, size: 0.08, line: 1, mark: 'underline' },
      ],
    },
    {
      say: ['TODO: a number or comparison that tells the story.'],
      background: '#f2ead6', backdrop: 'notebook', transition: 'wipe',
      character: on({ x: tall ? 0.5 : 0.18, scale: 0.8 }),
      items: [{ chart: { type: 'bar', values: [3, 5, 8], labels: ['TODO a', 'TODO b', 'TODO c'] }, x: tall ? 0.5 : 0.62, y: tall ? 0.3 : 0.55, w: tall ? 0.85 : 0.5, at: 0.5 }],
    },
    {
      say: ['TODO: the one thing to remember.', 'Thanks for watching!'],
      background: '#7b6fc4', backdrop: 'stars', particles: 'sparkles', transition: 'iris',
      character: on({ x: 0.5, cues: [{ line: 1, gesture: 'wave', mood: 'happy' }] }),
      items: [{ prop: 'star', x: tall ? 0.5 : 0.8, y: tall ? 0.2 : 0.35, w: tall ? 0.25 : 0.12, at: 0.5, loop: 'spin' }],
      hold: 1,
    },
  ];
  if (two) for (const s of scenes.slice(1)) {
    delete s.character;
    s.characters = { host: { x: tall ? 0.5 : 0.2, scale: 0.82 } };
  }
  return { title: topic.slice(0, 200), ...(cast ? { cast } : { voice: 'kokoro:bm_george' }), music: 'ambient', ...(tall ? { captions: 'words' } : {}), scenes };
}
