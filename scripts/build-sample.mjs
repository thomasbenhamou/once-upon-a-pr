import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.resolve(repoRoot, process.argv[2] || '.claude/skills/once-upon-a-pr');
const { buildDeck, validateSlides } = await import(pathToFileURL(path.join(skillDir, 'scripts/ouapr.mjs')));
const { metadata, slides } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'scripts/test/fixtures/profile-bio.json'), 'utf8'));
const validation = validateSlides(metadata, [], slides);
if (!validation.ok) throw new Error(validation.errors.join('\n'));

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ouapr-sample-'));
try {
  const result = buildDeck(metadata, slides, out, { generatedAt: '2026-11-13T00:00:00.000Z' });
  fs.copyFileSync(result.html_path, path.join(skillDir, 'assets/deck-template/sample.html'));
  console.log('Updated sample.html');
} finally {
  fs.rmSync(out, { recursive: true, force: true });
}
