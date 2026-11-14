// Find an installed Chrome, Edge or Chromium. selfclone never downloads a browser.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function chromeCandidates(env = process.env, platform = process.platform) {
  const list = [];
  if (env.SELFCLONE_CHROME) list.push(env.SELFCLONE_CHROME);
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA, 'C:\\Program Files', 'C:\\Program Files (x86)'].filter(Boolean);
    for (const r of roots) {
      list.push(path.win32.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      list.push(path.win32.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      list.push(path.win32.join(r, 'Chromium', 'Application', 'chrome.exe'));
      list.push(path.win32.join(r, 'Google', 'Chrome Beta', 'Application', 'chrome.exe'));
    }
  } else if (platform === 'darwin') {
    const apps = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'];
    for (const a of apps) {
      list.push(path.posix.join('/Applications', a));
      if (env.HOME) list.push(path.posix.join(env.HOME, 'Applications', a));
    }
  } else {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) {
      list.push(`/usr/bin/${bin}`, `/usr/local/bin/${bin}`);
    }
    list.push('/snap/bin/chromium', '/opt/google/chrome/chrome');
  }
  return [...new Set(list)];
}

export function findChrome() {
  for (const c of chromeCandidates()) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  if (process.platform !== 'win32') {
    for (const bin of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try {
        const p = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
        if (p) return p;
      } catch {
        // not found
      }
    }
  }
  return null;
}

export const CHROME_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--no-first-run',
  '--no-default-browser-check',
];

/** Launch headless Chrome through playwright-core with an installed browser. */
export async function launchChrome({ args = [], headless = true } = {}) {
  const exe = findChrome();
  if (!exe) {
    throw new Error('No Chrome, Edge or Chromium found. Install one, or set SELFCLONE_CHROME to the browser executable.');
  }
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('playwright-core is not installed. Run "npm install" in the selfclone folder (it does not download any browser).');
  }
  return chromium.launch({ executablePath: exe, headless, args: [...CHROME_ARGS, ...args] });
}
