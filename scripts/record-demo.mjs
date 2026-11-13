import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

// Per-slide hold times (ms). Index 0 = slide 1, etc.
const holds = [2600, 2400, 3200, 2800, 2400];

const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 960;
const FPS = 10;

if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
mkdirSync(dirname(outGif), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto('file://' + samplePath, { waitUntil: 'load' });

// Wait for diff2html to finish + rough.js sketches to draw.
await page.waitForFunction(
  () => document.querySelectorAll('.slide').length > 0,
);
await page.waitForTimeout(1500);

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
    await page.waitForTimeout(450);
  }
  // give rAF callout overlay a moment to render
  await page.waitForTimeout(300);
  const file = join(framesDir, `slide-${String(n).padStart(2, '0')}.png`);
  await page.screenshot({ path: file, fullPage: false });
  slidePngs.push(file);
  console.log(`captured slide ${n}/${total}`);
}

await browser.close();

// Build a concat list for ffmpeg with per-frame durations.
const concatLines = [];
for (let i = 0; i < slidePngs.length; i++) {
  const dur = (holds[i] ?? 2000) / 1000;
  concatLines.push(`file '${slidePngs[i]}'`);
  concatLines.push(`duration ${dur.toFixed(3)}`);
}
// ffmpeg concat demuxer requires the last file to be repeated without a duration.
concatLines.push(`file '${slidePngs[slidePngs.length - 1]}'`);
const listFile = join(tmpDir, 'concat.txt');
writeFileSync(listFile, concatLines.join('\n'));

const mp4 = join(tmpDir, 'demo.mp4');
const ffmpegArgs = [
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', listFile,
  '-vf', `scale=${GIF_WIDTH}:-2:flags=lanczos,fps=${FPS}`,
  '-pix_fmt', 'yuv420p',
  '-c:v', 'libx264',
  mp4,
];
const ff = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
if (ff.status !== 0) {
  throw new Error(`ffmpeg failed (exit ${ff.status})`);
}

const gifski = spawnSync(
  'gifski',
  [
    '-o', outGif,
    '--fps', String(FPS),
    '--width', String(GIF_WIDTH),
    '--quality', '85',
    mp4,
  ],
  { stdio: 'inherit' },
);
if (gifski.status !== 0) {
  throw new Error(`gifski failed (exit ${gifski.status})`);
}

console.log(`\nWrote ${outGif}`);
