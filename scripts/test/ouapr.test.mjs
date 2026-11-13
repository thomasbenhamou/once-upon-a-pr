import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  analyzeDiff,
  buildDeck,
  extractJiraKey,
  findDiffLine,
  makeSlug,
  normalizeMetadata,
  parseUnifiedDiff,
  slugifyTitle,
  validateSlides,
} from '../../.claude/skills/once-upon-a-pr/scripts/ouapr.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const fixtureRoot = path.join(__dirname, 'fixtures', '136987-cri-list-streaming');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), 'utf8'));
}

test('slug generation, Jira extraction, and GitHub metadata normalization are deterministic', () => {
  assert.equal(slugifyTitle('Add notification center, v1'), 'add-notification-center-v1');
  assert.equal(slugifyTitle('Very long title with a clean boundary after fifty-ish characters'), 'very-long-title-with-a-clean-boundary-after-fifty');
  assert.equal(makeSlug('1234', 'Add notification center, v1'), '1234-add-notification-center-v1');
  assert.equal(extractJiraKey('Nope', 'Implements GRO-1234 in the body'), 'GRO-1234');

  const metadata = normalizeMetadata('github', {
    number: 42,
    title: 'SEC-777 Add notification center, v1',
    body: 'Implements SEC-777 with a longish body.',
    author: { login: 'tbenhamou' },
    baseRefName: 'main',
    headRefName: 'feature/notifications',
    commits: [{ oid: 'abc123', messageHeadline: 'add notifications' }],
    additions: 142,
    deletions: 33,
    changedFiles: 7,
    url: 'https://github.com/acme/app/pull/42',
  }, '/tmp/diff.patch');

  assert.deepEqual(metadata, {
    platform: 'github',
    mr_id: '42',
    mr_url: 'https://github.com/acme/app/pull/42',
    files_url: 'https://github.com/acme/app/pull/42/files',
    title: 'SEC-777 Add notification center, v1',
    slug: '42-sec-777-add-notification-center-v1',
    description_excerpt: 'Implements SEC-777 with a longish body.',
    author: 'tbenhamou',
    base: 'main',
    head: 'feature/notifications',
    commits: [{ sha: 'abc123', subject: 'add notifications' }],
    files_changed: 7,
    lines_added: 142,
    lines_removed: 33,
    jira_key: 'SEC-777',
    diff_path: '/tmp/diff.patch',
  });
});

test('unified diff parsing records stats, hunks, and old/new line maps', () => {
  const diff = `diff --git a/src/auth/session.ts b/src/auth/session.ts
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -10,3 +10,5 @@ export function guard(user) {
   if (!user) return false
-  return hasPermission(user)
+  if (bypassAuth) return true
+  return requireAuth(user)
 }
diff --git a/docs/readme.md b/docs/readme.md
--- a/docs/readme.md
+++ b/docs/readme.md
@@ -1 +1,2 @@
 # Readme
+Extra docs
`;
  const files = parseUnifiedDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'src/auth/session.ts');
  assert.equal(files[0].lines_added, 2);
  assert.equal(files[0].lines_removed, 1);
  assert.equal(files[0].old_line_map['11'], '  return hasPermission(user)');
  assert.equal(files[0].new_line_map['11'], '  if (bypassAuth) return true');

  const line = findDiffLine(diff, 12, 'new');
  assert.equal(line.text, '  return requireAuth(user)');
});

test('analysis classifies must-consider, boilerplate, and type-only changes', () => {
  const diff = `diff --git a/src/auth/session.ts b/src/auth/session.ts
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -1 +1,2 @@
 export const policy = "old";
+export const guard = requireAuth(user);
diff --git a/db/migrations/001_create_users.sql b/db/migrations/001_create_users.sql
new file mode 100644
--- /dev/null
+++ b/db/migrations/001_create_users.sql
@@ -0,0 +1,2 @@
+CREATE TABLE users (id int);
+ALTER TABLE users ADD COLUMN bio text;
diff --git a/src/types/user.ts b/src/types/user.ts
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ -1 +1,3 @@
 export type UserId = string;
+export interface UserDto {
+  id: string
`;
  const entries = analyzeDiff(diff, { files_url: 'https://example.com/files' });
  const auth = entries.find((e) => e.path === 'src/auth/session.ts');
  const migration = entries.find((e) => e.path === 'db/migrations/001_create_users.sql');
  const typeOnly = entries.find((e) => e.path === 'src/types/user.ts');

  assert.equal(auth.must_consider, true);
  assert.match(auth.must_consider_reason, /security-sensitive path/);
  assert.equal(auth.boilerplate, false);
  assert.equal(migration.must_consider, true);
  assert.equal(migration.boilerplate, true);
  assert.match(migration.boilerplate_reason, /generated migrations/);
  assert.equal(typeOnly.boilerplate, true);
  assert.match(typeOnly.boilerplate_reason, /type-only changes/);
});

test('fixture validates 136987 slide 7 and 8 callout anchors', () => {
  const metadata = readFixture('metadata.json');
  const fileIndex = readFixture('file-index.json');
  const slides = readFixture('slides.json');
  const result = validateSlides(metadata, fileIndex, slides);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('validation rejects mismatched callout line_text', () => {
  const metadata = readFixture('metadata.json');
  const fileIndex = readFixture('file-index.json');
  const slides = structuredClone(readFixture('slides.json'));
  slides[1].callouts[0].line_text = 'wrong line';
  const result = validateSlides(metadata, fileIndex, slides);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /line_text does not match/);
});

test('natural explanations and optional slide composition pass validation', () => {
  const metadata = readFixture('metadata.json');
  const slides = [
    {
      kind: 'cover', title: 'Large lists without the size limit',
      subtitle: 'Read responses as a stream while keeping older runtimes compatible with the client.',
      bullets: ['The client can use streaming for larger responses, then fall back to the existing method when the runtime does not support it.'],
    },
    { ...readFixture('slides.json')[1], caption: 'The runtime reports support when the client receives from the stream, so the fallback decision belongs at this boundary.' },
    { kind: 'outro', title: 'Start with the fallback', caption: 'Review the compatibility behavior first, then the test that distinguishes the two paths.', mr_url: metadata.mr_url },
  ];
  const result = validateSlides(metadata, [{ path: 'src/auth/guard.ts', must_consider: true }], slides);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.match(result.warnings.join('\n'), /src\/auth\/guard.ts/);
});

test('annotation validation preserves removed-line and range correctness', () => {
  const slide = {
    kind: 'code', title: 'Apply the limit before returning', file: 'src/bio.ts', file_url: 'https://example.com/pull/1/files',
    diff: 'diff --git a/src/bio.ts b/src/bio.ts\n--- a/src/bio.ts\n+++ b/src/bio.ts\n@@ -10,3 +10,4 @@\n function bio(text) {\n-  return text;\n+  if (text.length > 280) throw new Error("Too long");\n+  return text.trim();\n }\n',
    callouts: [
      { line: 11, side: 'old', line_text: '  return text;', note: 'Previously returned the value without validation.' },
      { line_start: 11, line_end: 12, side: 'new', line_text: '  if (text.length > 280) throw new Error("Too long");', note: 'Validate the length before saving the trimmed value.' },
    ],
  };
  assert.equal(validateSlides({}, [], [slide]).ok, true);
  slide.callouts[1].line_end = 14;
  assert.match(validateSlides({}, [], [slide]).errors.join('\n'), /range includes lines absent/);
});

test('the bundled sample has valid anchors and matches its source fixture', () => {
  const { metadata, slides } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/profile-bio.json'), 'utf8'));
  const result = validateSlides(metadata, [], slides);
  assert.equal(result.ok, true, result.errors.join('\n'));
  const html = fs.readFileSync(path.join(repoRoot, '.claude/skills/once-upon-a-pr/assets/deck-template/sample.html'), 'utf8');
  const embedded = html.match(/<script id="manifest" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded).slides, slides);
});

test('build renders escaped HTML, assets, manifest JSON, and callout payloads', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ouapr-build-'));
  const metadata = {
    mr_id: '7',
    title: 'Escape <script> Deck',
    slug: '7-escape-script-deck',
    mr_url: 'https://example.com/pr/7',
    commits: [{ sha: 'abc123', subject: 'escape' }],
  };
  const slides = [
    {
      kind: 'cover',
      title: 'Escape <Deck>',
      subtitle: 'A <small> title',
      bullets: ['[new] render ==escaped== content'],
      meta: { author: 'dev', branch: 'main', lines_added: 1, lines_removed: 0, files_changed: 1, shape: 'fix', est_read_seconds: 45 },
    },
    {
      kind: 'code',
      title: 'Diff Escaping',
      caption: 'Script endings stay inert.',
      file: 'src/app.ts',
      file_url: 'https://example.com/pr/7/files',
      diff: 'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1,2 @@\n export const x = 1\n+const closing = "</script>"',
      callouts: [{ line: 2, side: 'new', line_text: 'const closing = "</script>"', note: 'escaped', kind: 'warn' }],
    },
    {
      kind: 'outro',
      title: 'Where to start',
      bullets: ['[new] inspect src/app.ts'],
      mr_url: 'https://example.com/pr/7',
      files_changed: 1,
    },
  ];

  const result = buildDeck(metadata, slides, tmp, { generatedAt: '2026-06-02T00:00:00.000Z' });
  const html = fs.readFileSync(result.html_path, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(result.manifest_path, 'utf8'));

  assert.match(html, /Escape &lt;Deck&gt;/);
  assert.match(html, /A &lt;small&gt; title/);
  const diffPayload = html.match(/<script type="application\/json" class="slide-diff">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(diffPayload), slides[1].diff);
  assert.equal(manifest.mr_title, 'Escape <script> Deck');
  assert.equal(fs.existsSync(path.join(tmp, 'deck.js')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'styles.css')), true);
});

test('build renders risk bullet review links', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ouapr-risk-link-'));
  const metadata = {
    mr_id: '8',
    title: 'Risk Links',
    slug: '8-risk-links',
    mr_url: 'https://example.com/pr/8',
  };
  const slides = [
    {
      kind: 'cover',
      title: 'Risk Links',
      bullets: ['[risk] review starts are linked'],
      meta: { files_changed: 3, lines_added: 40, lines_removed: 5, shape: 'fix', est_read_seconds: 55 },
    },
    {
      kind: 'risk',
      title: 'Reviewer Radar',
      bullets: [
        {
          text: '[risk] auth fallback can expose records',
          why: 'Fallback skips the deny path when the feature flag is off.',
          file: 'src/auth/policy.ts',
          file_url: 'https://example.com/pr/8/files#policy',
        },
      ],
    },
    {
      kind: 'skipped',
      title: 'Not in the deck',
      groups: [{ label: 'doc tweaks', count: 2 }],
    },
    {
      kind: 'outro',
      title: 'Where to start',
      bullets: ['[risk] inspect src/auth/policy.ts'],
      mr_url: 'https://example.com/pr/8',
      files_changed: 3,
    },
  ];

  const result = buildDeck(metadata, slides, tmp, { generatedAt: '2026-06-02T00:00:00.000Z' });
  const html = fs.readFileSync(result.html_path, 'utf8');
  assert.match(html, /class="bullet-file-link"/);
  assert.match(html, /title="src\/auth\/policy\.ts"/);
  assert.match(html, /Review policy\.ts/);
  assert.match(html, /href="https:\/\/example\.com\/pr\/8\/files#policy"/);
});

test('bundled runner is mirrored in both skill copies', () => {
  const claude = fs.readFileSync(path.join(repoRoot, '.claude/skills/once-upon-a-pr/scripts/ouapr.mjs'), 'utf8');
  const agents = fs.readFileSync(path.join(repoRoot, '.agents/skills/once-upon-a-pr/scripts/ouapr.mjs'), 'utf8');
  assert.equal(agents, claude);
});
