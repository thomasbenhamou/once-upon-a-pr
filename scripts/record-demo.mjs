import { chromium } from 'playwright';
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const samplePath = resolve(
  repoRoot,
  '.claude/skills/once-upon-a-pr/assets/deck-template/sample.html',
);
const tmpDir = resolve(repoRoot, '.tmp/demo-record');
const framesDir = join(tmpDir, 'frames');
const outGif = resolve(repoRoot, 'docs/demo.gif');
const outPreview = resolve(repoRoot, 'docs/preview.png');

// Per-slide hold times (ms). Index 0 = slide 1, etc.
const holds = [3400, 4000, 4400, 4000, 2200];

const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 960;
const FPS = 5;

if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(dirname(outGif), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
await page.goto(pathToFileURL(samplePath).href, { waitUntil: 'load' });

// Capture the rendered deck with its bundled fonts, entirely offline.
await page.waitForFunction(
  () => document.querySelectorAll('.slide.active').length === 1,
);
await page.evaluate(() => document.fonts.ready);

const total = await page.evaluate(
  () => document.querySelectorAll('.slide').length,
);
if (total !== holds.length) {
  console.warn(
    `slide count (${total}) differs from holds length (${holds.length})`,
  );
}

const slidePngs = [];
for (let n = 1; n <= total; n++) {
  if (n > 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForFunction(index => document.querySelector('#slideIndex').textContent === String(index), n);
  const file = join(framesDir, `slide-${String(n).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  slidePngs.push(file);
  console.log(`captured slide ${n}/${total}`);
}

await browser.close();
if (errors.length) throw new Error(errors.join('\n'));

// Hold each slide long enough to read. Encode directly from PNGs so code stays crisp.
const gifFrames = [];
for (let i = 0; i < slidePngs.length; i++) {
  const count = Math.max(1, Math.round((holds[i] ?? 3000) / 1000 * FPS));
  gifFrames.push(...Array(count).fill(slidePngs[i]));
}

const gifski = spawnSync(
  'gifski',
  [
    '-o', outGif,
    '--fps', String(FPS),
    '--width', String(GIF_WIDTH),
    '--quality', '85',
    '--no-sort',
    ...gifFrames,
  ],
  { stdio: 'inherit' },
);
if (gifski.status !== 0) {
  throw new Error(`gifski failed (exit ${gifski.status})`);
}
copyFileSync(slidePngs[0], outPreview);

console.log(`\nWrote ${outGif} and ${outPreview}`);
