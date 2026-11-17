// selfclone studio: the scene file. checkScenes() validates and fills defaults; buildTimeline() turns a
// checked scene file and the narration timings into absolute times for everything the page animates:
// item entrances, moves and exits, camera keys, and each character's gestures, moods, glances and walks.
// Both are pure.
//
// A video has a cast (zero or more named characters, each with a drawing and a voice): your own
// character, a random fictional person, or nobody. Lines can name who says them; a line nobody says is
// read by the narrator off screen.
import { rng } from '../util.mjs';
import { mix, GESTURES, MOODS, BODIES } from './character.mjs';
import { splitSentences } from './speech.mjs';
import { BACKDROPS, PARTICLES } from './backdrops.mjs';
import { PROPS, propSvg } from './props.mjs';
import { checkChart, chartSvg } from './charts.mjs';
import { checkCrowd, crowdSvg, checkNetwork, networkSvg } from './crowd.mjs';

export const ENTERS = ['pop', 'fade', 'write', 'draw', 'grow', 'zoom', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'none'];
export const EXITS = ['fade', 'pop', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];
export const LOOPS = ['none', 'float', 'bob', 'wobble', 'pulse', 'spin', 'shake'];
export const TRANSITIONS = ['cut', 'fade', 'wipe', 'push', 'zoom', 'iris'];
export const MARKS = ['none', 'underline', 'circle', 'box', 'strike'];
export const CHARACTER_ENTERS = ['none', 'slide-left', 'slide-right', 'rise', 'pop', 'walk-left', 'walk-right'];
// "point-left" is "point" with the other arm, and so on for every gesture.
export const GESTURE_NAMES = [...Object.keys(GESTURES), ...Object.keys(GESTURES).map((g) => `${g}-left`)];
const HEX = /^#[0-9a-f]{6}$/i;
const NAME = /^[a-z][a-z0-9_-]{0,23}$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
// Scene SVG is drawn by the page, so nothing in it may run code or fetch anything.
const UNSAFE_SVG = /<script|<foreignObject|<iframe|<image|<use\b[^>]*href\s*=\s*["']?(?!#)|\son[a-z]+\s*=|javascript:|url\(\s*["']?(?!#)/i;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Where a host stands by default, so its hands stay in the frame at any size. */
export function defaultY(scale, body) {
  if (body === 'full') return 0.97;
  return Math.round((1.03 - Math.max(0, 0.95 - scale) * 0.6) * 1000) / 1000;
}

/** Check a scene file and fill defaults. Throws with the scene and field at fault. */
export function checkScenes(spec) {
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.scenes) || !spec.scenes.length) {
    throw new Error('A scene file needs a "scenes" list with at least one scene.');
  }
  const num = (where, v, def, lo, hi) => {
    if (v == null) return def;
    if (!isNum(v) || v < lo || v > hi) throw new Error(`${where} must be a number from ${lo} to ${hi}.`);
    return v;
  };
  const color = (where, v, def) => {
    if (v == null) return def;
    if (!HEX.test(String(v))) throw new Error(`${where} must be a colour like #7fb6d6.`);
    return String(v);
  };
  const oneOf = (where, v, def, list) => {
    if (v == null) return def;
    if (!list.includes(String(v))) throw new Error(`${where} must be one of ${list.join(', ')}.`);
    return String(v);
  };
  const str = (where, v, max) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${where} must be text of 1 to ${max} characters.`);
    return v;
  };

  // The cast. "character" (one file) is the host; "host": false or no character means nobody on screen.
  const cast = {};
  if (spec.cast != null) {
    if (typeof spec.cast !== 'object' || Array.isArray(spec.cast)) throw new Error('"cast" must map names to {character, voice}.');
    for (const [name, m] of Object.entries(spec.cast)) {
      if (!NAME.test(name) || name === 'narrator') throw new Error(`cast name "${name}" must be a short word (letters, digits, - or _), not "narrator".`);
      if (!m || typeof m !== 'object') throw new Error(`cast ${name} must be {character, voice}.`);
      const ch = m.character;
      if (!(typeof ch === 'string' && ch.trim()) && !(ch && typeof ch === 'object')) throw new Error(`cast ${name} needs "character": a file, "random", "random:<seed>" or a character object.`);
      cast[name] = { character: ch, voice: m.voice == null ? null : String(m.voice), body: oneOf(`cast ${name} body`, m.body, 'bust', BODIES) };
    }
  } else if (spec.character != null && spec.host !== false) {
    cast.host = { character: spec.character, voice: null, body: 'bust' };
  }
  const names = Object.keys(cast);
  const lead = cast.host ? 'host' : names[0] || 'narrator';

  const scenes = spec.scenes.map((s, i) => {
    const at = `scene ${i + 1}`;
    if (!s || typeof s !== 'object') throw new Error(`${at} is not an object.`);
    // Who is on screen in this scene, and where.
    let placements = {};
    if (s.characters != null) {
      if (s.characters === false) placements = {};
      else if (typeof s.characters !== 'object' || Array.isArray(s.characters)) throw new Error(`${at} characters must map cast names to placements.`);
      else placements = s.characters;
    } else if (s.character === false || !names.length) {
      placements = {};
    } else {
      placements = { [lead]: s.character && typeof s.character === 'object' ? s.character : {} };
    }
    for (const n of Object.keys(placements)) if (!cast[n]) throw new Error(`${at}: "${n}" is not in the cast (${names.join(', ') || 'the cast is empty'}).`);
    const onScreen = Object.keys(placements).filter((n) => placements[n] !== false);
    const speakerDefault = onScreen[0] || lead;
    const rawSay = Array.isArray(s.say) ? s.say : splitSentences(s.say || '');
    const say = rawSay.map((x, k) => {
      if (typeof x === 'string') return { text: x.trim(), who: speakerDefault };
      if (!x || typeof x !== 'object') throw new Error(`${at} line ${k + 1} must be text or {who, text}.`);
      const who = x.who == null ? speakerDefault : String(x.who);
      if (who !== 'narrator' && !cast[who]) throw new Error(`${at} line ${k + 1}: "${who}" is not in the cast.`);
      return { text: String(x.text || '').trim(), who };
    }).filter((l) => l.text);
    if (!say.length) throw new Error(`${at} has nothing to say: add "say" (a sentence or a list of sentences).`);
    // A moment in the scene: `line` (a sentence index) plus `at` seconds after it, or `at` from the start.
    // `lineEnd` counts from the end of a sentence instead of its start (an end card after the last line).
    const when = (where, o) => {
      for (const k of ['line', 'lineEnd']) {
        if (o[k] != null && !(Number.isInteger(o[k]) && o[k] >= 0 && o[k] < say.length)) {
          throw new Error(`${where} ${k} must be the index of one of this scene's sentences (0 to ${say.length - 1}).`);
        }
      }
      return { line: o.line == null ? null : o.line, lineEnd: o.lineEnd == null ? null : o.lineEnd, at: num(`${where} at`, o.at, 0, -5, 600) };
    };
    const lookOf = (where, v) => {
      if (v == null) return null;
      if (v === 'camera') return 0;
      if (typeof v === 'string') {
        if (!cast[v]) throw new Error(`${where} look must be -1 to 1, "camera" or a cast name.`);
        return v;
      }
      return num(`${where} look`, v, 0, -1, 1);
    };
    const bg = Array.isArray(s.background) ? s.background : [s.background];
    const background = [color(`${at} background`, bg[0], '#7fb6d6')];
    background.push(color(`${at} background`, bg[1], mix(background[0], '#1d1840', 0.45)));
    const characters = onScreen.map((name, ci) => {
      const c = placements[name] && typeof placements[name] === 'object' ? placements[name] : {};
      const w = `${at} ${name}`;
      const g0 = c.gesture ?? c.pose;
      const gesture = oneOf(`${w} gesture`, g0 === 'idle' ? 'rest' : g0, 'rest', GESTURE_NAMES);
      const body = oneOf(`${w} body`, c.body, cast[name].body, BODIES);
      const scale = num(`${w} scale`, c.scale, body === 'full' ? 0.78 : onScreen.length > 1 ? 0.8 : 0.95, 0.2, 3);
      const cues = (Array.isArray(c.cues) ? c.cues : []).map((q, k) => {
        const wq = `${w} cue ${k + 1}`;
        if (!q || typeof q !== 'object') throw new Error(`${wq} is not an object.`);
        const g = q.gesture === 'idle' ? 'rest' : q.gesture;
        return { ...when(wq, q), gesture: oneOf(`${wq} gesture`, g, null, GESTURE_NAMES), mood: oneOf(`${wq} mood`, q.mood, null, MOODS), look: lookOf(wq, q.look) };
      });
      const walk = (Array.isArray(c.walk) ? c.walk : c.walk ? [c.walk] : []).map((q, k) => {
        const wq = `${w} walk ${k + 1}`;
        if (!q || typeof q !== 'object') throw new Error(`${wq} must be {x, at, line, dur}.`);
        return { ...when(wq, q), x: num(`${wq} x`, q.x, null, -0.5, 1.5), dur: num(`${wq} dur`, q.dur, 1.6, 0.2, 30) };
      });
      if (walk.some((q) => q.x == null)) throw new Error(`${w} walk needs an "x" to walk to.`);
      const spread = onScreen.length > 1 ? 0.22 + (0.56 * ci) / (onScreen.length - 1) : 0.5;
      return {
        who: name,
        body,
        x: num(`${w} x`, c.x, spread, -0.5, 1.5),
        y: num(`${w} y`, c.y, defaultY(scale, body), 0.3, 2),
        scale,
        look: lookOf(w, c.look) ?? 0,
        gesture,
        mood: oneOf(`${w} mood`, c.mood, 'neutral', MOODS),
        cues,
        walk,
        auto: c.auto !== false,
        enter: oneOf(`${w} enter`, c.enter, 'none', CHARACTER_ENTERS),
        flip: !!c.flip,
        name: c.name == null ? null : str(`${w} name`, String(c.name), 40),
      };
    });
    const cam = (where, v, def) => {
      const o = v && typeof v === 'object' ? v : {};
      return {
        zoom: num(`${where} zoom`, o.zoom, def.zoom, 1, 4),
        x: num(`${where} x`, o.x, def.x, 0, 1),
        y: num(`${where} y`, o.y, def.y, 0, 1),
      };
    };
    const camIn = s.camera && typeof s.camera === 'object' ? s.camera : {};
    const from = cam(`${at} camera from`, camIn.from, { zoom: 1, x: 0.5, y: 0.5 });
    const camera = { from, to: cam(`${at} camera to`, camIn.to, from), keys: [] };
    if (Array.isArray(camIn.keys)) {
      let prev = from;
      camera.keys = camIn.keys.map((k, n) => {
        const w = `${at} camera key ${n + 1}`;
        if (!k || typeof k !== 'object') throw new Error(`${w} is not an object.`);
        prev = { ...when(w, k), ...cam(w, k, prev), dur: num(`${w} dur`, k.dur, 1, 0.05, 30) };
        return prev;
      });
    }
    const items = (Array.isArray(s.items) ? s.items : []).map((it, k) => {
      const w = `${at} item ${k + 1}`;
      if (!it || typeof it !== 'object') throw new Error(`${w} is not an object.`);
      const kind = it.crowd != null ? 'crowd' : it.network != null ? 'network' : it.chart != null ? 'chart' : it.prop != null ? 'prop' : it.bubble != null ? 'bubble' : it.image != null ? 'image' : typeof it.svg === 'string' ? 'svg' : it.text != null ? 'text' : null;
      if (!kind) throw new Error(`${w} needs "svg", "text", "prop", "chart", "bubble", "image", "crowd" or "network".`);
      const defEnter = { chart: 'grow', text: 'write', bubble: 'pop', crowd: 'fade', network: 'fade' }[kind] || 'pop';
      const enter = oneOf(`${w} enter`, it.enter, defEnter, ENTERS);
      let exit = null;
      if (it.exit != null) {
        const e = typeof it.exit === 'number' ? { at: it.exit } : it.exit;
        if (!e || typeof e !== 'object') throw new Error(`${w} exit must be seconds or {at, line, anim}.`);
        exit = { ...when(`${w} exit`, e), anim: oneOf(`${w} exit anim`, e.anim, 'fade', EXITS) };
      }
      let move = null;
      if (it.move != null) {
        const m = it.move;
        if (!m || typeof m !== 'object') throw new Error(`${w} move must be {x, y, at, line, dur}.`);
        move = { ...when(`${w} move`, m), x: num(`${w} move x`, m.x, null, -0.5, 1.5), y: num(`${w} move y`, m.y, null, -0.5, 1.5), dur: num(`${w} move dur`, m.dur, 0.8, 0.05, 30) };
      }
      const base = {
        x: num(`${w} x`, it.x, kind === 'bubble' ? null : 0.5, -0.5, 1.5),
        y: num(`${w} y`, it.y, kind === 'bubble' ? null : 0.5, -0.5, 1.5),
        ...when(w, it),
        enter,
        exit,
        move,
        loop: oneOf(`${w} loop`, it.loop, 'none', LOOPS),
        scale: num(`${w} scale`, it.scale, 1, 0.05, 10),
        rotate: num(`${w} rotate`, it.rotate, 0, -180, 180),
        look: it.look !== false && it.over !== true,
        sound: it.sound !== false,
        over: it.over === true,
        // Pinned: drawn above the scene and not moved by the camera (titles, counters, labels).
        pin: it.pin === true,
        // A hand-drawn mark that draws itself onto the item `markAt` seconds after it has come in.
        mark: oneOf(`${w} mark`, it.mark, 'none', MARKS),
        markColor: color(`${w} markColor`, it.markColor, '#e2604f'),
        markAt: num(`${w} markAt`, it.markAt, null, 0, 600),
      };
      if (enter === 'draw' && (kind === 'text' || kind === 'bubble' || kind === 'image')) throw new Error(`${w}: "draw" is for drawings; text uses "write".`);
      if (enter === 'draw' && (kind === 'crowd' || kind === 'network')) throw new Error(`${w}: a ${kind} comes in with "fade", "pop" or another entrance, not "draw".`);
      if (kind === 'crowd') {
        const c = checkCrowd(w, it.crowd);
        const { svg, knowAt } = crowdSvg(c);
        // The ring, the spread and the gathering can each start on a sentence, like an item.
        const anchors = {};
        for (const key of ['ring', 'spread', 'gather']) {
          const src = it.crowd[key];
          if (src && typeof src === 'object' && (src.line != null || src.lineEnd != null)) anchors[key] = when(`${w} crowd ${key}`, { line: src.line, lineEnd: src.lineEnd, at: 0 });
        }
        return { kind: 'crowd', crowd: { ...c, knowAt, anchors }, svg, w: num(`${w} w`, it.w, 0.9, 0.1, 2), ...base };
      }
      if (kind === 'network') {
        const n = checkNetwork(w, it.network);
        const { svg, ties } = networkSvg(n);
        return { kind: 'network', network: { ...n, ties }, svg, w: num(`${w} w`, it.w, 0.6, 0.1, 2), ...base };
      }
      if (kind === 'prop') {
        const name = oneOf(`${w} prop`, it.prop, null, PROPS);
        return { kind: 'svg', prop: name, svg: propSvg(name, color(`${w} color`, it.color, null)), w: num(`${w} w`, it.w, 0.15, 0.02, 2), ...base };
      }
      if (kind === 'chart') {
        const c = checkChart(w, it.chart);
        return { kind: 'chart', chart: c, svg: chartSvg(c), w: num(`${w} w`, it.w, 0.42, 0.1, 2), ...base };
      }
      if (kind === 'bubble') {
        const who = it.who == null ? (characters[0] && characters[0].who) : String(it.who);
        if (who && !characters.some((c) => c.who === who)) throw new Error(`${w} bubble "who" must be someone on screen in this scene.`);
        if (!who && (base.x == null || base.y == null)) throw new Error(`${w} bubble needs x and y when nobody is on screen.`);
        return { kind: 'bubble', text: str(`${w} bubble`, String(it.bubble), 160), style: oneOf(`${w} style`, it.style, 'speech', ['speech', 'thought']), who, w: num(`${w} w`, it.w, 0.24, 0.08, 1), ...base };
      }
      if (kind === 'image') {
        if (typeof it.image !== 'string' || !IMAGE.test(it.image)) throw new Error(`${w} image must be a .png, .jpg, .webp or .gif file.`);
        return { kind: 'image', image: it.image, w: num(`${w} w`, it.w, 0.3, 0.02, 2), ...base };
      }
      if (kind === 'svg') {
        const svg = it.svg.trim();
        if (!/^<svg[\s>]/i.test(svg) || !/viewBox\s*=/.test(svg)) throw new Error(`${w} svg must be one <svg> element with a viewBox.`);
        if (UNSAFE_SVG.test(svg)) throw new Error(`${w} svg contains scripts, event handlers, external links or images; only plain drawing is allowed.`);
        if (svg.length > 200000) throw new Error(`${w} svg is over 200 KB.`);
        return { kind: 'svg', svg, w: num(`${w} w`, it.w, 0.3, 0.02, 2), ...base };
      }
      const text = String(it.text);
      if (!text.trim() || text.length > 300) throw new Error(`${w} text must be 1 to 300 characters.`);
      const font = oneOf(`${w} font`, it.font, 'hand', ['hand', 'sans']);
      let count = null;
      if (it.count != null) {
        const c = it.count;
        if (!c || typeof c !== 'object' || !text.includes('{n}')) throw new Error(`${w} count needs {from, to} and a "{n}" in the text where the number goes.`);
        count = { from: num(`${w} count from`, c.from, 0, -1e12, 1e12), to: num(`${w} count to`, c.to, null, -1e12, 1e12), dur: num(`${w} count dur`, c.dur, 1.4, 0.1, 30), decimals: num(`${w} count decimals`, c.decimals, 0, 0, 6) };
        if (count.to == null) throw new Error(`${w} count needs "to".`);
      }
      return { kind: 'text', text, count, size: num(`${w} size`, it.size, 0.08, 0.02, 0.5), color: color(`${w} color`, it.color, '#2a2346'), font, ...base };
    });
    let backdrop = 'none';
    let backdropImage = null;
    if (s.backdrop && typeof s.backdrop === 'object') {
      const dim = num(`${at} backdrop dim`, s.backdrop.dim, 0.15, 0, 0.9);
      backdrop = 'image';
      if (s.backdrop.prompt != null) {
        // Painted by an image model (optional, needs an API key), then used like an image file.
        backdropImage = { file: null, prompt: str(`${at} backdrop prompt`, String(s.backdrop.prompt), 400), dim };
      } else {
        if (typeof s.backdrop.image !== 'string' || !IMAGE.test(s.backdrop.image)) throw new Error(`${at} backdrop image must be a .png, .jpg, .webp or .gif file, or give a "prompt".`);
        backdropImage = { file: s.backdrop.image, dim };
      }
    } else backdrop = oneOf(`${at} backdrop`, s.backdrop, 'none', BACKDROPS);
    let manim = null;
    if (s.manim != null) {
      const m = s.manim;
      if (!m || typeof m !== 'object' || typeof m.code !== 'string' || !/class\s+\w+\s*\(/.test(m.code)) throw new Error(`${at} manim needs "code": Python with a Scene class.`);
      if (m.code.length > 20000) throw new Error(`${at} manim code is over 20 KB.`);
      const cls = m.scene == null ? (/class\s+(\w+)\s*\(/.exec(m.code) || [])[1] : String(m.scene);
      if (!/^\w+$/.test(cls)) throw new Error(`${at} manim scene must be a class name.`);
      manim = { code: m.code, scene: cls, x: num(`${at} manim x`, m.x, 0.5, 0, 1), y: num(`${at} manim y`, m.y, 0.5, 0, 1), w: num(`${at} manim w`, m.w, 1, 0.1, 1), ...when(`${at} manim`, m) };
    }
    // A 3D layer drawn by a three.js module (rendered ahead on the GPU, see three.mjs), behind the scene's items.
    let three = null;
    if (s.three != null) {
      const m = typeof s.three === 'string' ? { module: s.three } : s.three;
      if (!m || typeof m !== 'object' || typeof m.module !== 'string' || !/\.m?js$/i.test(m.module)) throw new Error(`${at} three needs "module": a .js file (relative to the scene file) that exports default { setup, update }.`);
      if (s.manim != null) throw new Error(`${at} has both "manim" and "three"; give a scene one of them.`);
      three = {
        module: m.module,
        x: num(`${at} three x`, m.x, 0.5, 0, 1), y: num(`${at} three y`, m.y, 0.5, 0, 1),
        w: num(`${at} three w`, m.w, 1, 0.1, 1), h: num(`${at} three h`, m.h, m.w == null ? 1 : num(`${at} three w`, m.w, 1, 0.1, 1), 0.1, 1),
        transparent: m.transparent === true,
      };
    }
    // A title card: big handwritten words in the middle, underlined by hand.
    if (s.title != null) {
      // Centred with nobody on screen; otherwise on the side away from the first character, near the top.
      const c0 = characters[0];
      const tx = !c0 ? 0.5 : c0.x < 0.5 ? 0.64 : 0.36;
      items.unshift({ kind: 'text', text: str(`${at} title`, String(s.title), 80), count: null, size: c0 ? 0.1 : 0.12, color: color(`${at} titleColor`, s.titleColor, '#2a2346'), font: 'hand', x: tx, y: c0 ? 0.16 : 0.42, line: null, at: 0.2, enter: 'write', exit: null, move: null, loop: 'none', scale: 1, rotate: 0, look: true, sound: true, mark: 'underline', markColor: '#e2604f', markAt: null });
    }
    // Name tags: a label beside each named character for the first few seconds.
    for (const c of characters) {
      if (!c.name) continue;
      const h = c.scale * (c.body === 'full' ? 1 : 0.62);
      items.push({ kind: 'tag', text: c.name, x: Math.max(0.1, Math.min(0.9, c.x + (c.x > 0.6 ? -0.12 : 0.12))), y: Math.max(0.1, c.y - h * 0.55), line: null, at: 0.5, enter: 'slide-up', exit: { line: null, at: 4.5, anim: 'fade' }, move: null, loop: 'none', scale: 1, rotate: 0, look: false, sound: false, mark: 'none', markColor: '#e2604f', markAt: null, w: 0.2 });
    }
    const transition = oneOf(`${at} transition`, s.transition, 'cut', TRANSITIONS);
    return {
      say, background, characters, camera, items, transition, manim, three,
      // "captions": false hides the captions in this scene (e.g. when the scene shows the line as a title).
      captions: s.captions !== false,
      backdrop, backdropImage,
      particles: oneOf(`${at} particles`, s.particles, 'none', PARTICLES),
      hold: num(`${at} hold`, s.hold, 0, 0, 20),
      // Back compatibility: the first character on screen, as before.
      get character() { return this.characters[0] || null; },
    };
  });
  return {
    title: String(spec.title || 'Explainer').slice(0, 200),
    voice: spec.voice == null ? null : String(spec.voice),
    cast,
    lead,
    character: cast.host ? (typeof cast.host.character === 'string' ? cast.host.character : null) : null,
    music: spec.music == null ? null : String(spec.music),
    musicVolume: num('musicVolume', spec.musicVolume, 0.12, 0, 1),
    // How many dB the music dips while someone speaks; unset keeps the sidechain compression.
    musicDuck: spec.musicDuck == null ? null : num('musicDuck', spec.musicDuck, null, 0, 40),
    sfx: spec.sfx !== false,
    captions: spec.captions === 'words' ? 'words' : spec.captions !== false,
    scenes,
  };
}

/** Lines per scene, as narrated (text only). */
export const sceneLines = (spec) => spec.scenes.map((s) => s.say.map((l) => l.text));

/** The voice for each line, per scene: the speaker's own voice, else the file's, else the default. */
export const sceneVoices = (spec, fallback) => spec.scenes.map((s) => s.say.map((l) => (spec.cast[l.who] && spec.cast[l.who].voice) || spec.voice || fallback));

const ENTER_SECONDS = { pop: 0.35, fade: 0.45, zoom: 0.45, grow: 1.4, 'slide-left': 0.5, 'slide-right': 0.5, 'slide-up': 0.5, 'slide-down': 0.5, none: 0 };

/** How long an item takes to come in. Text is written at about 14 characters a second. */
export function enterSeconds(it) {
  if (it.enter === 'write') return Math.min(2.4, Math.max(0.6, ((it.kind === 'text' || it.kind === 'bubble') ? it.text.length : 12) * 0.07));
  if (it.enter === 'draw') return Math.min(2.6, Math.max(1.0, ((it.svg || '').match(/<(path|circle|rect|ellipse|line|polyline|polygon)\b/g) || []).length * 0.12));
  if (it.enter === 'grow' && it.chart) return Math.min(3, 0.8 + it.chart.values.length * 0.15);
  return ENTER_SECONDS[it.enter] ?? 0.4;
}

// Gestures that fit the words, for hosts without written cues.
const RULES = [
  [/\b(hello|hi|hey|welcome|bye|goodbye|see you)\b/i, 'wave'],
  [/\b(great|good job|nice|perfect|well done|awesome|exactly|yes)\b/i, 'thumbs'],
  [/\b(two|second|twice|pair|couple)\b/i, 'count'],
  [/\?\s*$/, 'shrug'],
  [/\b(imagine|think|wonder|maybe|perhaps|suppose|idea|guess)\b/i, 'think'],
  [/\b(this|these|here|look|see|notice|watch|that one)\b/i, 'point'],
  [/\b(all|every|everything|whole|huge|enormous|massive|world|together|both|many)\b/i, 'present'],
  [/\b(but|however|because|so|first|second|third|then|means|why|how|reason)\b/i, 'explain'],
];
const MOOD_RULES = [
  [/!\s*$|\b(amazing|wonderful|great|love|fun|exciting|beautiful)\b/i, 'happy'],
  [/\b(surprising|surprisingly|incredibl|unbelievab|shock|wow|still)\b/i, 'surprised'],
  [/\b(danger|dangerous|problem|risk|warning|careful|death|die|serious|toxic)\b/i, 'serious'],
  [/\b(sadly|unfortunately|lost|loss|alone|fail)\b/i, 'sad'],
  [/\?\s*$/, 'curious'],
];
export const gestureFor = (text) => (RULES.find(([re]) => re.test(text)) || [])[1] || null;
export const moodFor = (text) => (MOOD_RULES.find(([re]) => re.test(text)) || [])[1] || null;

/**
 * Absolute times (seconds from the start of the video) for everything in every scene, given the
 * narration timings [{start, end, lines: [{start, end}]}]. Adds each character's automatic behaviour
 * unless the scene turns it off: a gesture that fits each of its sentences, a point toward items that
 * land beside it, a glance at every new item, turning to whoever is speaking, a mood from the words.
 * Seeded by the title, so the same file gives the same video.
 */
export function buildTimeline(spec, timings) {
  const rand = rng(`gestures:${spec.title}`);
  return spec.scenes.map((s, i) => {
    const T = timings[i];
    const t0 = T.start;
    const dur = T.end - T.start;
    const abs = (w) => (w.line != null ? T.lines[w.line].start : w.lineEnd != null ? T.lines[w.lineEnd].end : t0) + w.at;
    const lines = s.say.map((l, j) => ({ text: l.text, who: l.who, start: T.lines[j].start, end: T.lines[j].end, question: /\?\s*$/.test(l.text) }));
    const byWho = Object.fromEntries(s.characters.map((c) => [c.who, c]));
    const items = s.items.map((it) => {
      const t = Math.max(t0, abs(it));
      let { x, y } = it;
      if (it.kind === 'bubble' && (x == null || y == null)) {
        // Beside the speaker's head, on the side with more room.
        const c = byWho[it.who];
        const side = c.x > 0.55 ? -1 : 1;
        x = x ?? Math.max(0.12, Math.min(0.88, c.x + side * (0.16 + 0.12 * c.scale)));
        y = y ?? Math.max(0.1, c.y - c.scale * (c.body === 'full' ? 0.95 : 0.9));
      }
      return {
        ...it,
        x,
        y,
        svg: undefined,
        t,
        enterDur: enterSeconds(it),
        markT: it.mark === 'none' ? null : t + (it.markAt ?? enterSeconds(it) + 0.2),
        exit: it.exit ? { anim: it.exit.anim, t: abs(it.exit) } : null,
        move: it.move ? { x: it.move.x ?? it.x, y: it.move.y ?? it.y, t: abs(it.move), dur: it.move.dur } : null,
        // A crowd's ring, spread and gathering times are counted from the crowd's own start; a sentence
        // anchor moves them to that sentence.
        crowdShift: it.kind === 'crowd' ? Object.fromEntries(['ring', 'spread', 'gather'].map((k) => [k, it.crowd.anchors[k] ? abs(it.crowd.anchors[k]) - t : 0])) : undefined,
      };
    });
    const camera = s.camera.keys.length
      ? [{ t: t0, zoom: s.camera.from.zoom, x: s.camera.from.x, y: s.camera.from.y, dur: 0 }, ...s.camera.keys.map((k) => ({ t: abs(k), zoom: k.zoom, x: k.x, y: k.y, dur: k.dur }))].sort((a, b) => a.t - b.t)
      : [{ t: t0, ...s.camera.from, dur: 0 }, { t: t0, ...s.camera.to, dur: dur }];
    const characters = s.characters.map((c) => {
      const sign = c.flip ? -1 : 1;
      // Where it stands over time: walks, and walking in from the side.
      const walk = [{ t: t0 - 10, x: c.x, dur: 0 }];
      if (c.enter === 'walk-left' || c.enter === 'walk-right') {
        walk[0].x = c.enter === 'walk-left' ? -0.25 : 1.25;
        walk.push({ t: t0, x: c.x, dur: 1.8 });
      }
      for (const q of c.walk) walk.push({ t: abs(q), x: q.x, dur: q.dur });
      walk.sort((a, b) => a.t - b.t);
      const xAt = (t) => {
        let x = walk[0].x;
        for (const k of walk.slice(1)) if (t >= k.t) x = x + (k.x - x) * Math.min(1, (t - k.t) / k.dur);
        return x;
      };
      const lookTo = (v, t) => (typeof v === 'string' ? (byWho[v] ? Math.sign((xAt(t) < byWho[v].x ? 1 : -1) * sign) : 0) : v * sign);
      // Gesture events carry a priority: written cues (3), points at items (2), sentence gestures (1).
      // Of two events closer than 0.8 s, the higher priority one is kept.
      const events = [];
      const moods = [{ t: -Infinity, m: c.mood }];
      const looks = [];
      for (const q of c.cues) {
        const t = abs(q);
        if (q.gesture) events.push({ t, g: q.gesture, p: 3 });
        if (q.mood) moods.push({ t, m: q.mood });
        if (q.look != null) looks.push({ t, until: Infinity, x: lookTo(q.look, t), y: 0, p: 3 });
      }
      const mine = lines.filter((l) => l.who === c.who);
      if (c.auto && !c.cues.some((q) => q.gesture)) {
        const pool = ['explain', 'rest', 'present', 'explain', 'rest'];
        mine.forEach((l, j) => {
          const g = gestureFor(l.text) || (j > 0 || c.gesture === 'rest' ? pool[Math.floor(rand() * pool.length)] : null);
          if (g) events.push({ t: l.start + 0.15, g: g === 'point' ? (rand() < 0.5 ? 'point' : 'point-left') : g, p: 1 });
          events.push({ t: l.end + 0.1, g: 'rest', p: 1 });
        });
        for (const it of items) {
          const dx = (it.x - xAt(it.t)) * sign;
          if (!it.look || it.kind === 'bubble' || Math.abs(dx) < 0.15 || it.y > 0.85) continue;
          events.push({ t: it.t, g: dx > 0 ? 'point' : 'point-left', p: 2 }, { t: it.t + 1.5, g: null, p: 2 });
        }
      }
      if (c.auto && !c.cues.some((q) => q.mood)) {
        for (const l of mine) {
          const m = moodFor(l.text);
          if (m && m !== c.mood) moods.push({ t: l.start + 0.1, m }, { t: l.end + 0.4, m: c.mood });
        }
      }
      for (const it of items) {
        if (!it.look || it.kind === 'bubble') continue;
        const dx = (it.x - xAt(it.t)) * sign;
        const dy = it.y - (c.y - 0.62 * c.scale);
        looks.push({ t: it.t - 0.05, until: it.t + 1.4, x: Math.max(-1, Math.min(1, dx * 2.5)), y: Math.max(-1, Math.min(1, dy * 2)), p: 2 });
      }
      // Listening: turn toward whoever else is speaking.
      for (const l of lines) {
        if (l.who === c.who || !byWho[l.who]) continue;
        looks.push({ t: l.start, until: l.end + 0.2, x: lookTo(l.who, l.start), y: 0, p: 1 });
      }
      events.sort((a, b) => a.t - b.t || b.p - a.p);
      const kept = [];
      for (const e of events) {
        const last = kept[kept.length - 1];
        if (last && e.t - last.t < 0.8) {
          if (e.p >= last.p) kept[kept.length - 1] = e;
          continue;
        }
        kept.push(e);
      }
      // A null gesture ends a point: go back to the last sentence or cue gesture before it.
      const spaced = [{ t: -Infinity, g: c.gesture }];
      let base = c.gesture;
      for (const e of kept) {
        const g = e.g ?? base;
        if (e.g && e.p !== 2) base = e.g;
        if (spaced[spaced.length - 1].g !== g) spaced.push({ t: e.t, g });
      }
      moods.sort((a, b) => a.t - b.t);
      return {
        who: c.who, body: c.body, x: c.x, y: c.y, scale: c.scale, flip: c.flip, enter: c.enter,
        walk: walk.map((k) => ({ t: k.t, x: k.x, dur: k.dur })),
        gestures: spaced.map((g) => ({ t: g.t === -Infinity ? t0 - 10 : g.t, g: g.g })),
        moods: moods.map((m) => ({ t: m.t === -Infinity ? t0 - 10 : m.t, m: m.m })),
        look: typeof c.look === 'string' ? lookTo(c.look, t0) : c.look * sign,
        looks: looks.sort((a, b) => a.t - b.t || a.p - b.p).map((l) => ({ ...l, until: l.until === Infinity ? t0 + dur + 10 : l.until })),
      };
    });
    return {
      start: t0,
      end: T.end,
      lines,
      background: s.background,
      transition: s.transition,
      camera,
      items,
      characters,
      // The first character, for older callers.
      character: characters[0] || null,
      manim: s.manim ? { t: abs(s.manim), x: s.manim.x, y: s.manim.y, w: s.manim.w } : null,
      three: s.three ? { t: t0, x: s.three.x, y: s.three.y, w: s.three.w, h: s.three.h, transparent: s.three.transparent } : null,
      captions: s.captions,
    };
  });
}
