import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildDeck } from '../../.claude/skills/once-upon-a-pr/scripts/ouapr.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sample = path.join(repoRoot, '.claude/skills/once-upon-a-pr/assets/deck-template/sample.html');
const template = path.join(repoRoot, '.claude/skills/once-upon-a-pr/assets/deck-template/index.html');
const previews = path.join(repoRoot, '.tmp/preview');
fs.mkdirSync(previews, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ouapr-browser-'));
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const warnings = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(template).href + '#3');
  await page.waitForURL(pathToFileURL(sample).href + '#3');
  assert.equal(await page.locator('#slideIndex').textContent(), '3', 'Opening the template shows the sample and preserves the requested slide');
  await page.goto(pathToFileURL(sample).href + '#1');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.slide:not([hidden])').count(), 1);
  assert.equal(await page.locator('#prevBtn').isDisabled(), true);
  assert.equal(await page.locator('.slide.active .change-areas dt').count(), 4);
  assert.equal(await page.locator('.deck-brand').textContent(), 'Once Upon a PR');
  assert.ok(await page.evaluate(() => document.fonts.check('24px Newsreader') && document.fonts.check('italic 24px Newsreader') && document.fonts.check('16px "DM Sans"')), 'Bundled typefaces load offline');
  await page.screenshot({ path: path.join(previews, 'cover.png'), animations: 'disabled' });

  for (let index = 1; index <= 3; index++) {
    await page.keyboard.press('ArrowRight');
    const active = page.locator('.slide.active');
    assert.equal(await active.getAttribute('data-kind'), 'code');
    const expected = await active.locator('.slide-callouts').evaluate(el => JSON.parse(el.textContent).length);
    assert.equal(await active.locator('.code-note').count(), expected);
    assert.equal(await active.locator('.annotated-line').count() > 0, true);
    await active.locator('.code-note').first().hover();
    assert.equal(await active.locator('.is-emphasized').count() > 0, true);
    await page.mouse.move(30, 30);
    if (index === 2) await page.screenshot({ path: path.join(previews, 'diff.png'), animations: 'disabled' });
  }
  await page.keyboard.press('End');
  assert.equal(await page.locator('#nextBtn').isDisabled(), true);
  assert.equal(await page.locator('.slide.active > *').count(), 1);
  assert.equal(await page.locator('.slide.active > .mr-cta').getAttribute('href'), 'https://example.com/pull/42');
  await page.screenshot({ path: path.join(previews, 'closing.png'), animations: 'disabled' });
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#slideIndex').textContent(), '1');
  await page.goto(pathToFileURL(sample).href + '#3');
  assert.equal(await page.locator('#slideIndex').textContent(), '3');
  await page.locator('.slide.active .code-note').first().focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#slideIndex').textContent(), '3', 'Space activates the focused note without changing slide');
  await page.setViewportSize({ width: 1100, height: 800 });
  assert.equal(await page.locator('.slide.active .code-note').count(), 2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => document.activeElement.blur());
  await page.goto(pathToFileURL(sample).href + '#1');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Opening summary fits a narrow screen');
  await page.screenshot({ path: path.join(previews, 'mobile-cover.png'), fullPage: true, animations: 'disabled' });
  await page.goto(pathToFileURL(sample).href + '#3');
  const frame = await page.locator('.slide.active .diff-frame').boundingBox();
  const notes = await page.locator('.slide.active .code-notes').boundingBox();
  assert.ok(notes.y >= frame.y + frame.height, 'Notes stack below the code on a narrow screen');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal page overflow');
  assert.equal(await page.locator('.slide.active').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.screenshot({ path: path.join(previews, 'mobile.png'), fullPage: true, animations: 'disabled' });

  // Render the saved Kubernetes regression fixture through the new template too.
  const fixtureRoot = path.join(repoRoot, 'scripts/test/fixtures/136987-cri-list-streaming');
  const metadata = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'metadata.json'), 'utf8'));
  const slides = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'slides.json'), 'utf8'));
  const realDeck = buildDeck(metadata, slides, path.join(tmp, 'cri'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(pathToFileURL(realDeck.html_path).href + '#2');
  assert.equal(await page.locator('.slide.active .code-note').count(), 3);
  await page.locator('.slide.active .diff-container').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.locator('.slide.active .code-note').last().click();
  assert.equal(await page.locator('.slide.active .annotated-gutter').count(), 3);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.slide.active .code-note').count(), 3);

  // The same renderer must preserve data that contains an HTML closing tag.
  const file = 'src/example.ts';
  const literal = 'const closing = "</script>";';
  const escaped = String.raw`const escaped = "<\/script>";`;
  const deck = buildDeck({ mr_id: '1', slug: 'escaping', title: 'Literal source text' }, [{
    kind: 'code', title: 'Source text stays exact', file, file_url: 'https://example.com/pull/1/files',
    diff: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -0,0 +1,2 @@\n+${literal}\n+${escaped}\n`,
    callouts: [
      { line: 1, side: 'new', line_text: literal, note: 'An HTML closing tag is still ordinary source text here.' },
      { line: 2, side: 'new', line_text: escaped, note: 'Source backslashes stay intact too.' },
    ],
  }], tmp);
  await page.goto(pathToFileURL(deck.html_path).href);
  assert.deepEqual(await page.locator('.d2h-code-line-ctn').allTextContents(), [literal, escaped]);
  assert.equal(await page.locator('.code-note').count(), 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  console.log('Browser checks passed: template preview redirect, rendering, anchors, visible notes, navigation, deep links, resize, mobile, reduced motion, and literal source text.');
  console.log(`Previews: ${previews}`);
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
