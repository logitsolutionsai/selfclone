// selfclone stylecard: write the Voice Passport (HTML, JSON, SVG, and PNG with --png when Chrome exists).
import fs from 'node:fs';
import path from 'node:path';
import { projectPassport } from './project.mjs';
import { passportHtml, passportSvg } from './render.mjs';
import { assertProfile } from '../profile/build.mjs';
import { requireConsent } from '../consent.mjs';
import { invalid } from '../errors.mjs';
import { stableStringify } from '../schema.mjs';

export const EXAMPLE_PROFILE = new URL('../../templates/example-voice-profile.v1.json', import.meta.url);

/** Render the card to a square PNG with an installed Chrome. Returns null (and a reason) when it cannot. */
export async function renderPng(html, file, { launch = null } = {}) {
  let browser;
  try {
    const launchChrome = launch || (await import('../face/chrome.mjs')).launchChrome;
    browser = await launchChrome();
  } catch (e) {
    return { ok: false, reason: e.message };
  }
  try {
    const ctx = await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.documentElement.classList.add('png-mode'));
    const card = await page.$('#card');
    await card.screenshot({ path: file });
    return { ok: true };
  } finally {
    await browser.close();
  }
}

export async function cmdStylecard(args, dir, { loadProfile, writeOut, outLine, relShown }) {
  const audience = args.audience;
  if (audience !== 'public' && audience !== 'private') {
    throw invalid('E_ARGS', 'Choose who the card is for: --audience public (a coarse card you can share) or --audience private (finer numbers, for this computer).', 'Run selfclone stylecard --help.');
  }
  let profile;
  if (args.example) {
    // The synthetic example: an invented maintainer, so anyone can see a card without their own data.
    profile = assertProfile(JSON.parse(fs.readFileSync(EXAMPLE_PROFILE, 'utf8')));
  } else {
    requireConsent(dir, audience === 'public' ? 'public-stylecard' : 'local-lint');
    const file = args.profile && args.profile !== true ? String(args.profile) : path.join(dir, 'voice-profile.v1.json');
    profile = assertProfile(loadProfile(file));
  }
  const displayName = args.displayName && args.displayName !== true ? String(args.displayName) : null;
  const card = projectPassport(profile, { audience, displayName });
  const outDir = args.out && args.out !== true ? String(args.out) : audience === 'public' ? path.join('out', 'passport') : path.join('out', 'private-passport');
  const written = [];
  writeOut(path.join(outDir, 'passport.json'), stableStringify(card));
  written.push('passport.json');
  const warnings = [];
  const noCard = audience === 'public' && card.status === 'insufficient_data';
  if (noCard) {
    warnings.push('Not enough data for a public card (it needs 100 or more training messages and one register with 30 messages in 10 conversations). Only passport.json was written, with status insufficient_data.');
  } else {
    const html = passportHtml(card);
    writeOut(path.join(outDir, 'passport.html'), html);
    writeOut(path.join(outDir, 'passport.svg'), passportSvg(card));
    written.push('passport.html', 'passport.svg');
    if (args.png) {
      const r = await renderPng(html, path.resolve(outDir, 'passport.png'));
      if (r.ok) written.push('passport.png');
      else warnings.push(`No PNG: ${r.reason} The HTML and SVG were written.`);
    }
  }
  if (args.json) {
    outLine(JSON.stringify({ schemaVersion: 1, audience, status: card.status, out: relShown(outDir), files: written, projectionDigest: card.projectionDigest, warnings }, null, 2));
    return;
  }
  outLine(`Wrote ${audience} Voice Passport to ${relShown(outDir)}/: ${written.join(', ')}`);
  outLine(`  ${card.registers.length} register${card.registers.length === 1 ? '' : 's'}, ${card.habits.length} habit${card.habits.length === 1 ? '' : 's'}, evidence ${card.evidenceBand}, digest ${card.projectionDigest.slice(0, 19)}...`);
  for (const w of warnings) outLine(`  note: ${w}`);
  outLine(audience === 'public' ? '  Nothing was uploaded. It holds no message text; it is not proof of identity.' : '  Private view: exact counts; do not share it.');
}
