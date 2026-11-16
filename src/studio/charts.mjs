// selfclone studio: charts from data, drawn as SVG in the house style and animated by the page: bars grow
// from the axis one after another, a line draws itself with its points popping in, a pie sweeps round.
// Parts carry classes the page reads (g-bar, g-line, g-dot, g-pie, g-label).
const K = '#2a2346';
const PALETTE = ['#e2604f', '#5b8fd6', '#f2c14b', '#6aa34c', '#b58ad6', '#f2803a', '#4fb3a9', '#d98aa8'];
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100));
// Currency signs go before the number, other units after it.
const withUnit = (v, u) => (/^[$€£¥₹]$/.test(u) ? u + num(v) : num(v) + u);
export const CHART_TYPES = ['bar', 'line', 'pie'];

/** Check a chart definition. Throws with a plain message. */
export function checkChart(where, c) {
  if (!c || typeof c !== 'object') throw new Error(`${where} chart must be {type, values, labels}.`);
  if (!CHART_TYPES.includes(c.type)) throw new Error(`${where} chart type must be one of ${CHART_TYPES.join(', ')}.`);
  if (!Array.isArray(c.values) || !c.values.length || c.values.length > 24 || !c.values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`${where} chart values must be 1 to 24 numbers.`);
  }
  if (c.type === 'pie' && c.values.some((v) => v < 0)) throw new Error(`${where} pie chart values cannot be negative.`);
  const labels = Array.isArray(c.labels) ? c.labels.map((l) => String(l).slice(0, 24)) : [];
  const colors = Array.isArray(c.colors) ? c.colors.filter((x) => /^#[0-9a-f]{6}$/i.test(x)) : [];
  return { type: c.type, values: c.values, labels, colors, unit: c.unit == null ? '' : String(c.unit).slice(0, 8), showValues: c.showValues !== false };
}

/** The chart as an SVG string (viewBox 400 x 280). */
export function chartSvg(c) {
  const col = (i) => c.colors[i] || PALETTE[i % PALETTE.length];
  const font = `font-family="'Ink Free','Segoe Print','Comic Sans MS',cursive" fill="${K}"`;
  let body = '';
  if (c.type === 'pie') {
    const total = c.values.reduce((a, b) => a + b, 0) || 1;
    const R = 90;
    const r = R / 2;
    const len = 2 * Math.PI * r;
    let acc = 0;
    c.values.forEach((v, i) => {
      const f = v / total;
      body += `<circle class="g-pie" data-i="${i}" data-len="${len.toFixed(2)}" data-f="${f.toFixed(4)}" cx="140" cy="140" r="${r}" fill="none" stroke="${col(i)}" stroke-width="${R}" stroke-dasharray="${(f * len).toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${(-acc * len).toFixed(2)}" transform="rotate(-90 140 140)"/>`;
      const mid = (acc + f / 2) * 2 * Math.PI - Math.PI / 2;
      acc += f;
      const lx = 140 + Math.cos(mid) * R * 0.62;
      const ly = 140 + Math.sin(mid) * R * 0.62;
      if (f > 0.06) body += `<text class="g-label" x="${lx.toFixed(1)}" y="${(ly + 6).toFixed(1)}" text-anchor="middle" font-size="18" ${font}>${Math.round(f * 100)}%</text>`;
      if (c.labels[i]) body += `<rect class="g-label" x="262" y="${40 + i * 30}" width="18" height="18" rx="3" fill="${col(i)}" stroke="${K}" stroke-width="2"/><text class="g-label" x="288" y="${55 + i * 30}" font-size="18" ${font}>${esc(c.labels[i])}</text>`;
    });
    body += `<circle cx="140" cy="140" r="${R}" fill="none" stroke="${K}" stroke-width="4"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280">${body}</svg>`;
  }
  const x0 = 44;
  const y0 = 236;
  const w = 340;
  const h = 196;
  const max = Math.max(...c.values.map(Math.abs)) || 1;
  const n = c.values.length;
  body += `<path d="M${x0},${y0} L${x0 + w},${y0} M${x0},${y0} L${x0},${y0 - h - 10}" stroke="${K}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
  if (c.type === 'bar') {
    const slot = w / n;
    const bw = Math.min(56, slot * 0.62);
    c.values.forEach((v, i) => {
      const bh = (Math.max(0, v) / max) * h;
      const x = x0 + slot * i + (slot - bw) / 2;
      body += `<rect class="g-bar" data-i="${i}" data-y0="${y0}" x="${x.toFixed(1)}" y="${(y0 - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${col(i)}" stroke="${K}" stroke-width="3"/>`;
      if (c.showValues) body += `<text class="g-label" data-i="${i}" x="${(x + bw / 2).toFixed(1)}" y="${(y0 - bh - 8).toFixed(1)}" text-anchor="middle" font-size="18" ${font}>${esc(withUnit(v, c.unit))}</text>`;
      if (c.labels[i]) body += `<text class="g-label" data-i="${i}" x="${(x + bw / 2).toFixed(1)}" y="${y0 + 26}" text-anchor="middle" font-size="17" ${font}>${esc(c.labels[i])}</text>`;
    });
  } else {
    const pts = c.values.map((v, i) => [x0 + 14 + ((w - 28) * i) / Math.max(1, n - 1), y0 - (Math.max(0, v) / max) * h]);
    body += `<path class="g-line" d="M${pts.map((p) => p.map((q) => q.toFixed(1)).join(',')).join(' L')}" fill="none" stroke="${col(0)}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
    pts.forEach(([x, y], i) => {
      body += `<circle class="g-dot" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="#f6f1e6" stroke="${K}" stroke-width="3"/>`;
      if (c.showValues) body += `<text class="g-label" data-i="${i}" x="${x.toFixed(1)}" y="${(y - 16).toFixed(1)}" text-anchor="middle" font-size="16" ${font}>${esc(withUnit(c.values[i], c.unit))}</text>`;
      if (c.labels[i]) body += `<text class="g-label" data-i="${i}" x="${x.toFixed(1)}" y="${y0 + 26}" text-anchor="middle" font-size="16" ${font}>${esc(c.labels[i])}</text>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280">${body}</svg>`;
}
