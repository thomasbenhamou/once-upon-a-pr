#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_SLIDE_KINDS = new Set(['cover', 'section', 'risk', 'code', 'skipped', 'outro']);
const VALID_TAGS = new Set(['risk', 'new', 'fix', 'breaking', 'refactor']);
const VALID_SHAPES = new Set(['feature', 'refactor', 'fix', 'integration', 'migration', 'mixed']);
const VALID_CALLOUT_KINDS = new Set(['info', 'warn', 'risk']);
const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, '..');

class OuaprError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'OuaprError';
    this.details = details;
  }
}

function parseCliArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    if (eq !== -1) {
      options[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }

  return { command, options, positionals };
}

function requireOption(options, name) {
  if (options[name] === undefined || options[name] === true) {
    throw new OuaprError(`missing required option --${name}`);
  }
  return String(options[name]);
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: opts.cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', opts.allowStderr ? 'pipe' : 'ignore'],
    }).trim();
  } catch (err) {
    if (opts.optional) return null;
    throw new OuaprError(`command failed: ${cmd} ${args.join(' ')}`, [String(err.message || err)]);
  }
}

function hasCommand(cmd) {
  return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
}

function streamCommandToFile(cmd, args, outFile, cwd = process.cwd()) {
  const fd = fs.openSync(outFile, 'w');
  try {
    const res = spawnSync(cmd, args, { cwd, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8' });
    if (res.status !== 0) {
      throw new OuaprError(`command failed: ${cmd} ${args.join(' ')}`, [res.stderr || 'no stderr']);
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function slugifyTitle(title, maxLen = 50) {
  const cleaned = String(title || 'pr')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned.length <= maxLen) return cleaned || 'pr';

  const cut = cleaned.slice(0, maxLen);
  const boundary = cut.lastIndexOf('-');
  const slug = (boundary >= Math.floor(maxLen * 0.6) ? cut.slice(0, boundary) : cut.slice(0, maxLen))
    .replace(/-+$/g, '');
  return slug || 'pr';
}

export function makeSlug(id, title) {
  return `${id || 'pr'}-${slugifyTitle(title)}`;
}

export function extractJiraKey(...texts) {
  for (const text of texts) {
    const match = String(text || '').match(/\b[A-Z][A-Z0-9]+-\d+\b/);
    if (match) return match[0];
  }
  return null;
}

function truncateDescription(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > 500 ? s.slice(0, 500) : s;
}

function currentBranch() {
  return run('git', ['branch', '--show-current'], { optional: true }) || '';
}

function remoteUrl() {
  return run('git', ['remote', 'get-url', 'origin'], { optional: true }) || '';
}

function choosePlatform(target) {
  const input = String(target || '');
  const remote = remoteUrl();
  if (/github\.com[:/]/.test(input) || /github\.com[:/]/.test(remote)) {
    if (!hasCommand('gh')) throw new OuaprError('GitHub target detected but gh is unavailable');
    return 'github';
  }
  if (/gitlab/i.test(input) || /gitlab/i.test(remote)) {
    if (!hasCommand('glab')) throw new OuaprError('GitLab target detected but glab is unavailable');
    return 'gitlab';
  }
  if (hasCommand('gh')) return 'github';
  if (hasCommand('glab')) return 'gitlab';
  throw new OuaprError('neither gh nor glab is available');
}

function targetId(platform, target) {
  const raw = String(target || '');
  if (platform === 'github') {
    const match = raw.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
    return match ? match[1] : raw;
  }
  const match = raw.match(/\/merge_requests\/(\d+)/);
  return match ? match[1] : raw;
}

function normalizeGhMetadata(raw, diffPath) {
  const id = String(raw.number || raw.id || '');
  const body = raw.body || '';
  const title = raw.title || `PR ${id}`;
  const author = typeof raw.author === 'string' ? raw.author : raw.author?.login || raw.author?.name || null;
  const commits = Array.isArray(raw.commits)
    ? raw.commits.map((c) => ({
        sha: c.oid || c.sha || c.commit?.oid || c.commit?.sha || '',
        subject: c.messageHeadline || c.subject || c.commit?.messageHeadline || c.commit?.message || '',
      })).filter((c) => c.sha || c.subject)
    : [];

  return {
    platform: 'github',
    mr_id: id,
    mr_url: raw.url || null,
    files_url: raw.url ? `${raw.url}/files` : null,
    title,
    slug: makeSlug(id, title),
    description_excerpt: truncateDescription(body),
    author,
    base: raw.baseRefName || null,
    head: raw.headRefName || null,
    commits,
    files_changed: Number(raw.changedFiles || 0),
    lines_added: Number(raw.additions || 0),
    lines_removed: Number(raw.deletions || 0),
    jira_key: extractJiraKey(title, body),
    diff_path: diffPath,
  };
}

function normalizeGlabMetadata(raw, diffPath) {
  const id = String(raw.iid || raw.id || raw.number || '');
  const description = raw.description || raw.body || '';
  const title = raw.title || `MR ${id}`;
  const webUrl = raw.web_url || raw.webUrl || raw.url || null;
  const sourceBranch = raw.source_branch || raw.sourceBranch || raw.head || null;
  const targetBranch = raw.target_branch || raw.targetBranch || raw.base || null;
  const author = typeof raw.author === 'string' ? raw.author : raw.author?.username || raw.author?.name || null;
  const commits = Array.isArray(raw.commits)
    ? raw.commits.map((c) => ({ sha: c.id || c.sha || '', subject: c.title || c.message || '' }))
    : [];

  return {
    platform: 'gitlab',
    mr_id: id,
    mr_url: webUrl,
    files_url: webUrl ? `${webUrl}/diffs` : null,
    title,
    slug: makeSlug(id, title),
    description_excerpt: truncateDescription(description),
    author,
    base: targetBranch,
    head: sourceBranch,
    commits,
    files_changed: Number(raw.changes_count || raw.diff_stats?.length || raw.changedFiles || 0),
    lines_added: Number(raw.additions || raw.diff_stats?.reduce((n, s) => n + Number(s.additions || 0), 0) || 0),
    lines_removed: Number(raw.deletions || raw.diff_stats?.reduce((n, s) => n + Number(s.deletions || 0), 0) || 0),
    jira_key: extractJiraKey(title, description),
    diff_path: diffPath,
  };
}

export function normalizeMetadata(platform, raw, diffPath) {
  return platform === 'gitlab' ? normalizeGlabMetadata(raw, diffPath) : normalizeGhMetadata(raw, diffPath);
}

async function fetchCommand(options) {
  const outDir = requireOption(options, 'out');
  const target = options.target === undefined || options.target === true ? '' : String(options.target);
  fs.mkdirSync(outDir, { recursive: true });
  const platform = choosePlatform(target);
  const resolved = targetId(platform, target || currentBranch());
  if (!resolved) throw new OuaprError('no target supplied and current branch is empty');

  const diffPath = path.resolve(outDir, 'diff.patch');
  let raw;
  if (platform === 'github') {
    const fields = 'title,body,author,baseRefName,headRefName,commits,additions,deletions,changedFiles,url,number';
    raw = JSON.parse(run('gh', ['pr', 'view', resolved, '--json', fields], { allowStderr: true }));
    streamCommandToFile('gh', ['pr', 'diff', resolved], diffPath);
  } else {
    raw = JSON.parse(run('glab', ['mr', 'view', resolved, '--output', 'json'], { allowStderr: true }));
    streamCommandToFile('glab', ['mr', 'diff', resolved], diffPath);
  }

  fs.writeFileSync(path.join(outDir, 'description.md'), raw.body || raw.description || '');
  const metadata = normalizeMetadata(platform, raw, diffPath);
  writeJsonFile(path.join(outDir, 'metadata.json'), metadata);
  return metadata;
}

function parseDiffHeaderLine(line) {
  const match = line.match(/^diff --git\s+"?a\/(.+?)"?\s+"?b\/(.+?)"?$/);
  return match ? { oldPath: match[1], newPath: match[2] } : null;
}

function parseHunkHeader(line) {
  const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/);
  if (!match) return null;
  return {
    old_start: Number(match[1]),
    old_count: Number(match[2] || 1),
    new_start: Number(match[3]),
    new_count: Number(match[4] || 1),
    section: match[5].trim(),
    lines: [],
  };
}

function stripQuotedPath(raw) {
  return raw.replace(/^"|"$/g, '').replace(/^[ab]\//, '');
}

function finalizeFile(file) {
  if (!file) return null;
  file.path = file.new_path === '/dev/null' ? file.old_path : file.new_path;
  if (file.is_added || file.old_path === '/dev/null') file.change_type = 'added';
  else if (file.is_deleted || file.new_path === '/dev/null') file.change_type = 'deleted';
  else if (file.is_renamed || file.old_path !== file.new_path) file.change_type = 'renamed';
  else file.change_type = 'modified';
  delete file.is_added;
  delete file.is_deleted;
  delete file.is_renamed;
  return file;
}

export function parseUnifiedDiff(diffText) {
  const files = [];
  let current = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of String(diffText || '').split(/\r?\n/)) {
    const header = parseDiffHeaderLine(line);
    if (header) {
      const done = finalizeFile(current);
      if (done) files.push(done);
      current = {
        old_path: header.oldPath,
        new_path: header.newPath,
        path: header.newPath,
        change_type: 'modified',
        lines_added: 0,
        lines_removed: 0,
        hunks: [],
        old_line_map: {},
        new_line_map: {},
        raw_headers: [line],
      };
      hunk = null;
      continue;
    }

    if (!current && (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ '))) {
      current = {
        old_path: null,
        new_path: null,
        path: null,
        change_type: 'modified',
        lines_added: 0,
        lines_removed: 0,
        hunks: [],
        old_line_map: {},
        new_line_map: {},
        raw_headers: [],
      };
    }

    if (!current) continue;

    if (line.startsWith('new file mode')) current.is_added = true;
    if (line.startsWith('deleted file mode')) current.is_deleted = true;
    if (line.startsWith('rename from ')) {
      current.old_path = line.slice('rename from '.length);
      current.is_renamed = true;
    }
    if (line.startsWith('rename to ')) {
      current.new_path = line.slice('rename to '.length);
      current.is_renamed = true;
    }
    if (line.startsWith('--- ')) {
      current.old_path = stripQuotedPath(line.slice(4).trim());
      current.raw_headers.push(line);
      continue;
    }
    if (line.startsWith('+++ ')) {
      current.new_path = stripQuotedPath(line.slice(4).trim());
      current.raw_headers.push(line);
      continue;
    }

    const hunkHeader = parseHunkHeader(line);
    if (hunkHeader) {
      hunk = hunkHeader;
      oldLine = hunk.old_start;
      newLine = hunk.new_start;
      current.hunks.push(hunk);
      continue;
    }

    if (!hunk) {
      current.raw_headers.push(line);
      continue;
    }

    if (line.startsWith('\\ No newline at end of file')) continue;
    // A trailing newline is not a blank context row; real context starts with a space.
    if (![' ', '+', '-'].includes(line[0])) continue;
    const prefix = line[0];
    const text = line.slice(1);
    const entry = { type: 'context', text, old_line: oldLine, new_line: newLine };
    if (prefix === '+') {
      entry.type = 'add';
      entry.old_line = null;
      entry.new_line = newLine;
      current.lines_added += 1;
      current.new_line_map[newLine] = text;
      newLine += 1;
    } else if (prefix === '-') {
      entry.type = 'remove';
      entry.old_line = oldLine;
      entry.new_line = null;
      current.lines_removed += 1;
      current.old_line_map[oldLine] = text;
      oldLine += 1;
    } else {
      current.old_line_map[oldLine] = text;
      current.new_line_map[newLine] = text;
      oldLine += 1;
      newLine += 1;
    }
    hunk.lines.push(entry);
  }

  const done = finalizeFile(current);
  if (done) files.push(done);
  return files.filter((file) => file.path);
}

function pathHas(pathname, pattern) {
  return pattern.test(pathname.replace(/\\/g, '/'));
}

function addedText(file) {
  return file.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add').map((l) => l.text).join('\n');
}

function changedText(file) {
  return file.hunks.flatMap((h) => h.lines).filter((l) => l.type !== 'context').map((l) => l.text).join('\n');
}

function classifyFile(file) {
  const p = file.path || '';
  const lower = p.toLowerCase();
  const changed = changedText(file);
  const added = addedText(file);
  const reasons = [];
  const boilerReasons = [];
  let suggestedWindowExpansion = false;

  if (pathHas(lower, /(^|\/)(auth|authn|authz|permissions|rbac)(\/|$)/) || /\b(hasPermission|isAdmin|requireAuth|bypassAuth|@PreAuthorize|policy|guard|jwt|session|cookie)\b/i.test(changed)) {
    reasons.push('security-sensitive path');
  }
  if (pathHas(lower, /(^|\/)migrations?\//) || lower.endsWith('/schema.prisma') || lower.endsWith('.sql')) {
    reasons.push('schema change');
  }
  if (/\b(stripe|salesforce|mulesoft|twilio|sendgrid|segment|intercom)\b/i.test(changed) || pathHas(lower, /(^|\/)(webhooks|callbacks)(\/|$)/)) {
    reasons.push('integration change');
  }
  if (pathHas(lower, /(^|\/)(routes|controllers|handlers|api)(\/|$)/) || lower.endsWith('.openapi.yaml') || lower.endsWith('schema.graphql') || lower.endsWith('.proto')) {
    reasons.push('public API change');
  }
  if (/(^|\/)(dockerfile|terraform|helm|k8s|kubernetes|cloudformation)(\/|$)/i.test(lower) || pathHas(lower, /(^|\/)\.github\/workflows\//) || lower.endsWith('.tf') || lower.endsWith('.yaml') && /\b(kind:|apiVersion:)\b/.test(changed)) {
    reasons.push('infra/deploy change');
  }
  if (/(^|\/)(package\.json|requirements\.txt|gemfile|go\.mod|cargo\.toml|pom\.xml)$/.test(lower) && file.lines_added > 0) {
    reasons.push('new dependency');
  }
  if (pathHas(lower, /(^|\/)(flags|features)(\/|$)/) || /\b(featureFlag|launchDarkly|split\.io)\b/i.test(changed)) {
    reasons.push('feature flag');
  }
  if (/(^|\/)(pages\/|app\/.*\/page\.tsx$|router\.ts$|routes\.tsx$)/.test(lower)) {
    reasons.push('new UI route');
  }

  if (file.lines_added < 5 && reasons.length > 0) suggestedWindowExpansion = true;

  if (pathHas(lower, /(^|\/)__snapshots__(\/|$)/) || lower.endsWith('.snap')) {
    boilerReasons.push('snapshot updates');
  }
  if (LOCKFILES.has(path.basename(p))) {
    boilerReasons.push('lockfile churn');
  }
  if (pathHas(lower, /(^|\/)generated(\/|$)/) || /\.(gen|generated)\.[jt]sx?$/.test(lower) || /@generated/i.test(changed)) {
    boilerReasons.push('generated files');
  }
  if (file.change_type === 'renamed' && file.lines_added + file.lines_removed <= 2) {
    boilerReasons.push('mechanical renames');
  }
  if (pathHas(lower, /(^|\/)migrations?\//) && /\.sql$/.test(lower) && !/\b(UPDATE|INSERT|DELETE|TRIGGER|CONCURRENTLY|NOT NULL)\b/i.test(changed)) {
    boilerReasons.push('generated migrations');
  }
  if (/\.(md|mdx|rst|txt)$/.test(lower)) {
    boilerReasons.push('doc tweaks');
  }
  if (isTypeOnlyFile(lower, added)) {
    boilerReasons.push('type-only changes');
  }
  if (pathHas(lower, /(^|\/)(routes|controllers)(\/|$)/) && /return\s+\w+\.\w+\(/.test(added) && file.lines_added <= 20) {
    boilerReasons.push('routine route handlers');
  }
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) && file.lines_added <= 80) {
    boilerReasons.push('mirror tests');
  }

  const boilerplate = boilerReasons.length > 0;
  const mustConsider = reasons.length > 0 && !isClearlyGeneratedOrLock(lower, changed);
  let score = mustConsider ? 0.72 : 0.45;
  if (boilerplate) score = Math.min(score, 0.3);
  if (file.lines_added + file.lines_removed > 120 && !boilerplate) score += 0.08;
  if (/\b(auth|permission|migration|feature|stream|webhook|api|route)\b/i.test(`${p}\n${changed}`) && !boilerplate) score += 0.1;
  if (/\.(test|spec)\.[jt]sx?$/.test(lower) && mustConsider) score = Math.min(score, 0.5);
  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const hints = file.hunks
    .map((h, index) => ({ index, weight: h.lines.filter((l) => l.type !== 'context').length }))
    .filter((h) => h.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((h) => h.index);

  return {
    ...file,
    must_consider: mustConsider,
    must_consider_reason: mustConsider ? unique(reasons).join('; ') : null,
    suggested_window_expansion: suggestedWindowExpansion || undefined,
    boilerplate,
    boilerplate_reason: boilerplate ? unique(boilerReasons).join('; ') : null,
    interesting_score: score,
    interesting_reason: interestingReason(file, mustConsider, boilerplate, reasons, boilerReasons),
    diff_hunk_hints: hints.length ? hints : undefined,
  };
}

function isClearlyGeneratedOrLock(lower, changed) {
  return LOCKFILES.has(path.basename(lower)) || /(^|\/)generated(\/|$)/.test(lower) || /@generated/i.test(changed);
}

function isTypeOnlyFile(lower, added) {
  if (lower.endsWith('.d.ts')) return true;
  if (!/\.[jt]sx?$/.test(lower)) return false;
  const significant = added.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith('//') && !l.startsWith('*'));
  return significant.length > 0 && significant.every((l) => /^(import\s+type|export\s+type|type\s+|interface\s+|export\s+interface|readonly\s+|\w+\??:|};?$|}$)/.test(l));
}

function interestingReason(file, mustConsider, boilerplate, reasons, boilerReasons) {
  if (boilerplate) return `deprioritized: ${unique(boilerReasons).join('; ')}`;
  if (mustConsider) return `heuristic match: ${unique(reasons).join('; ')}`;
  if (file.lines_added + file.lines_removed > 120) return 'large behavior surface';
  return 'ordinary code change';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function analyzeDiff(diffText, metadata = {}) {
  return parseUnifiedDiff(diffText).map((file) => ({
    ...classifyFile(file),
    file_url: metadata.files_url || metadata.mr_url || null,
  }));
}

async function analyzeCommand(options) {
  const metadata = readJsonFile(requireOption(options, 'metadata'));
  const diffText = fs.readFileSync(requireOption(options, 'diff'), 'utf8');
  const outFile = requireOption(options, 'out');
  const index = analyzeDiff(diffText, metadata);
  writeJsonFile(outFile, index);
  return index;
}

function readSlides(file) {
  const raw = readJsonFile(file);
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.slides)) return raw.slides;
  throw new OuaprError('slides JSON must be an array or an object with slides[]');
}

function bulletText(bullet) {
  if (typeof bullet === 'string') return bullet;
  if (bullet && typeof bullet.text === 'string') return bullet.text;
  return '';
}

function slideText(slide) {
  return JSON.stringify(slide || {});
}

function basenameWithoutExt(file) {
  return path.basename(file || '').replace(/\.[^.]+$/, '');
}

function containsFileReference(slides, file) {
  const base = basenameWithoutExt(file);
  return slides.some((slide) => {
    if (slide.file === file) return true;
    const raw = slideText(slide);
    return raw.includes(file) || (base && raw.includes(base));
  });
}

function normalizeLineText(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

export function findDiffLine(diffText, lineNumber, side = 'new') {
  const files = parseUnifiedDiff(diffText);
  const wanted = Number(lineNumber);
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (side === 'old' && line.old_line === wanted) return line;
        if (side !== 'old' && line.new_line === wanted) return line;
      }
    }
  }
  return null;
}

export function validateSlides(metadata, fileIndex, slides) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(slides) || slides.length === 0) {
    return { ok: false, errors: ['slides must be a non-empty array'], warnings };
  }

  slides.forEach((slide, index) => {
    const label = `slide ${index + 1}`;
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) {
      errors.push(`${label}: must be an object`);
      return;
    }
    if (!VALID_SLIDE_KINDS.has(slide.kind)) errors.push(`${label}: unknown kind ${slide.kind}`);
    if (slide.kind !== 'outro' && (typeof slide.title !== 'string' || !slide.title.trim())) errors.push(`${label}: missing title`);
    for (const key of ['subtitle', 'caption', 'eyebrow']) {
      if (slide[key] !== undefined && typeof slide[key] !== 'string') errors.push(`${label}: ${key} must be text`);
    }
    if (slide.bullets !== undefined) {
      if (!Array.isArray(slide.bullets)) errors.push(`${label}: bullets must be an array`);
      else validateBullets(slide, label, errors);
    }
    if (slide.kind === 'cover' && slide.meta?.shape && !VALID_SHAPES.has(slide.meta.shape)) {
      errors.push(`${label}: invalid meta.shape`);
    }
    if (slide.kind === 'cover' && slide.changes !== undefined) {
      if (!Array.isArray(slide.changes)) errors.push(`${label}: changes must be an array`);
      else slide.changes.forEach((change, n) => {
        if (typeof change?.label !== 'string' || !change.label.trim()) errors.push(`${label} change ${n + 1}: missing label`);
        if (typeof change?.text !== 'string' || !change.text.trim()) errors.push(`${label} change ${n + 1}: missing explanation`);
      });
    }
    if (slide.kind === 'outro' && !slide.mr_url && !metadata?.mr_url) errors.push(`${label}: closing button needs a PR URL`);
    if (slide.kind === 'code') validateCodeSlide(slide, label, errors, warnings);
    if (slide.kind === 'skipped') validateSkippedSlide(slide, label, errors);
  });

  for (const entry of fileIndex || []) {
    if (entry.must_consider && !containsFileReference(slides, entry.path)) {
      warnings.push(`Consider whether this file matters to the story: ${entry.path}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

function validateBullets(slide, label, errors) {
  slide.bullets.forEach((bullet, index) => {
    const bulletLabel = `${label} bullet ${index + 1}`;
    if (!bulletText(bullet).trim()) errors.push(`${bulletLabel}: missing text`);
    if (bullet && typeof bullet === 'object') {
      if (bullet.why !== undefined && typeof bullet.why !== 'string') errors.push(`${bulletLabel}: why must be text`);
      if (Boolean(bullet.file) !== Boolean(bullet.file_url)) errors.push(`${bulletLabel}: file links need both file and file_url`);
    }
  });
}

function validateSkippedSlide(slide, label, errors) {
  if (!Array.isArray(slide.groups)) {
    errors.push(`${label}: skipped slide needs groups[]`);
    return;
  }
  for (const [index, group] of slide.groups.entries()) {
    if (!group || typeof group.label !== 'string' || !group.label.trim()) errors.push(`${label} group ${index + 1}: missing label`);
    if (!Number.isInteger(group?.count) || group.count <= 0) errors.push(`${label} group ${index + 1}: count must be a positive integer`);
  }
}

function validateCodeSlide(slide, label, errors, warnings) {
  if (!slide.file) errors.push(`${label}: missing file`);
  if (!slide.file_url) errors.push(`${label}: missing file_url`);
  if (!String(slide.diff || '').match(/^(diff --git|---\s+)/m)) errors.push(`${label}: diff must be unified diff text`);
  if (slide.callouts !== undefined && !Array.isArray(slide.callouts)) errors.push(`${label}: callouts must be an array`);
  const callouts = Array.isArray(slide.callouts) ? slide.callouts : [];
  for (const [index, callout] of callouts.entries()) {
    const calloutLabel = `${label} callout ${index + 1}`;
    if (!callout || typeof callout !== 'object') {
      errors.push(`${calloutLabel}: must be an object`);
      continue;
    }
    const start = callout.line_start ?? callout.line;
    const end = callout.line_end ?? callout.line ?? start;
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      errors.push(`${calloutLabel}: line or line range must use ordered integers`);
      continue;
    }
    if (callout.side && !['old', 'new'].includes(callout.side)) errors.push(`${calloutLabel}: side must be old or new`);
    if (callout.kind && !VALID_CALLOUT_KINDS.has(callout.kind)) errors.push(`${calloutLabel}: invalid kind`);
    if (!callout.line_text) errors.push(`${calloutLabel}: missing line_text`);
    const found = findDiffLine(slide.diff || '', start, callout.side || 'new');
    if (!found) errors.push(`${calloutLabel}: line ${start} not present in diff`);
    else if (callout.line_text && normalizeLineText(found.text) !== normalizeLineText(callout.line_text)) {
      errors.push(`${calloutLabel}: line_text does not match diff line`);
    }
    const lineKey = callout.side === 'old' ? 'old_line' : 'new_line';
    const available = new Set(parseUnifiedDiff(slide.diff || '').flatMap(file =>
      file.hunks.flatMap(hunk => hunk.lines.map(line => line[lineKey]))
    ).filter(line => Number.isInteger(line) && line >= start && line <= end));
    if (available.size !== end - start + 1) errors.push(`${calloutLabel}: range includes lines absent from diff`);
    if (!callout.note) warnings.push(`${calloutLabel}: missing explanation`);
  }
}

async function validateCommand(options) {
  const metadata = readJsonFile(requireOption(options, 'metadata'));
  const fileIndex = readJsonFile(requireOption(options, 'file-index'));
  const slides = readSlides(requireOption(options, 'slides'));
  const result = validateSlides(metadata, fileIndex, slides);
  if (!result.ok) throw new OuaprError('slide validation failed', result.errors);
  return result;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function escapeScript(value) {
  return String(value ?? '').replace(/</g, '\\u003c');
}

function renderInline(text) {
  const tagMatch = String(text || '').match(/^\[([a-z]+)\]\s*(.*)$/);
  let prefix = '';
  let body = String(text || '');
  if (tagMatch && VALID_TAGS.has(tagMatch[1])) {
    prefix = `<span class="tag tag-${tagMatch[1]}">${tagMatch[1]}</span> `;
    body = tagMatch[2];
  }

  const escaped = escapeHtml(body)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>');
  return `${prefix}${escaped}`;
}

function renderBullet(bullet) {
  const text = bulletText(bullet);
  const why = bullet && typeof bullet === 'object' && bullet.why
    ? `<span class="bullet-why">${escapeHtml(bullet.why)}</span>`
    : '';
  const fileLink = bullet && typeof bullet === 'object' && bullet.file && bullet.file_url
    ? `<a class="bullet-file-link" href="${escapeAttr(bullet.file_url)}" title="${escapeAttr(bullet.file)}" target="_blank" rel="noreferrer">Review ${escapeHtml(path.basename(bullet.file))}</a>`
    : '';
  return `<li>${renderInline(text)}${why}${fileLink}</li>`;
}

function renderBulletList(bullets = []) {
  if (!bullets.length) return '';
  return `<ul class="bullets">\n${bullets.map((b) => `  ${renderBullet(b)}`).join('\n')}\n</ul>`;
}

function formatReadTime(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds || 0) / 5) * 5);
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function renderMeta(meta = {}) {
  const parts = [];
  if (meta.shape) parts.push(`<span class="shape shape-${escapeAttr(meta.shape)}">${escapeHtml(meta.shape)}</span>`);
  if (meta.author) parts.push(`<span><strong>by</strong>${escapeHtml(meta.author)}</span>`);
  if (meta.branch) parts.push(`<span><strong>branch</strong>${escapeHtml(meta.branch)}</span>`);
  if (meta.lines_added !== undefined || meta.lines_removed !== undefined) {
    parts.push(`<span><strong>+${Number(meta.lines_added || 0)}</strong>/<strong>-${Number(meta.lines_removed || 0)}</strong></span>`);
  }
  if (meta.files_changed !== undefined) parts.push(`<span><strong>${Number(meta.files_changed || 0)}</strong>files</span>`);
  if (meta.est_read_seconds !== undefined) parts.push(`<span class="read-time">~${formatReadTime(meta.est_read_seconds)} read</span>`);
  return parts.length ? `<div class="meta">\n${parts.map((p) => `  ${p}`).join('\n')}\n</div>` : '';
}

function renderChanges(changes = []) {
  if (!changes.length) return '';
  return `<div class="change-overview">
    <p class="overview-label">What changes</p>
    <dl class="change-areas">
      ${changes.map(change => `<div><dt>${escapeHtml(change.label)}</dt><dd>${escapeHtml(change.text)}</dd></div>`).join('\n      ')}
    </dl>
  </div>`;
}

function renderSlide(slide, index, metadata = {}) {
  const active = index === 0 ? ' active' : '';
  const labels = { cover: 'The intent', section: 'The approach', code: 'A closer look', risk: 'Worth checking', skipped: 'Also changed', outro: 'Your review' };
  const eyebrow = `<p class="eyebrow">${escapeHtml(slide.eyebrow || labels[slide.kind] || '')}</p>`;
  if (slide.kind === 'cover') {
    return `<section class="slide${active}" data-kind="cover">
  ${eyebrow}
  <h1>${escapeHtml(slide.title)}</h1>
  ${slide.subtitle ? `<p class="subtitle">${renderInline(slide.subtitle)}</p>` : ''}
  ${renderChanges(slide.changes)}
  ${renderBulletList(slide.bullets || [])}
  ${renderMeta(slide.meta)}
</section>`;
  }
  if (slide.kind === 'section') {
    return `<section class="slide${active}" data-kind="section">
  ${eyebrow}
  <h2>${escapeHtml(slide.title)}</h2>
  ${slide.caption ? `<p class="caption">${renderInline(slide.caption)}</p>` : ''}
  ${renderBulletList(slide.bullets || [])}
</section>`;
  }
  if (slide.kind === 'risk') {
    return `<section class="slide${active}" data-kind="risk">
  ${eyebrow}
  <h2>${escapeHtml(slide.title)}</h2>
  ${slide.caption ? `<p class="caption">${renderInline(slide.caption)}</p>` : ''}
  ${renderBulletList(slide.bullets || [])}
</section>`;
  }
  if (slide.kind === 'code') {
    return `<section class="slide${active}" data-kind="code">
  ${eyebrow}
  <div class="code-head"><h2>${escapeHtml(slide.title)}</h2></div>
  ${slide.caption ? `<p class="caption">${renderInline(slide.caption)}</p>` : ''}
  <div class="code-layout">
    <div class="diff-frame">
      <a class="file-link" href="${escapeAttr(slide.file_url)}" title="${escapeAttr(slide.file)}" target="_blank" rel="noreferrer">${escapeHtml(slide.file)}</a>
      <div class="diff-container" tabindex="0" role="region" aria-label="Diff for ${escapeAttr(slide.file)}"></div>
    </div>
  </div>
  <script type="application/json" class="slide-diff">${escapeScript(JSON.stringify(slide.diff || ''))}</script>
  <script type="application/json" class="slide-callouts">${escapeScript(JSON.stringify(slide.callouts || []))}</script>
</section>`;
  }
  if (slide.kind === 'skipped') {
    const groups = (slide.groups || [])
      .map((g) => `  <li><span class="skipped-count">${Number(g.count)}</span> ${escapeHtml(g.label)}</li>`)
      .join('\n');
    return `<section class="slide${active}" data-kind="skipped">
  ${eyebrow}
  <h2>${escapeHtml(slide.title)}</h2>
  ${slide.caption ? `<p class="caption">${renderInline(slide.caption)}</p>` : ''}
  <ul class="skipped-groups">
${groups}
  </ul>
</section>`;
  }
  if (slide.kind === 'outro') {
    return `<section class="slide${active}" data-kind="outro" aria-label="Open pull request">
  <a class="mr-cta" href="${escapeAttr(slide.mr_url || metadata.mr_url || '')}" target="_blank" rel="noreferrer">Open pull request <span aria-hidden="true">↗</span></a>
</section>`;
  }
  return '';
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function buildDeck(metadata, slides, outDir, opts = {}) {
  const templateDir = opts.templateDir || path.join(skillRoot, 'assets', 'deck-template');
  const slug = metadata.slug || makeSlug(metadata.mr_id, metadata.title);
  fs.mkdirSync(outDir, { recursive: true });
  copyDir(path.join(templateDir, 'vendor/diff2html'), path.join(outDir, 'vendor/diff2html'));
  for (const name of ['deck.js', 'styles.css']) {
    fs.copyFileSync(path.join(templateDir, name), path.join(outDir, name));
  }

  const manifest = {
    mr_id: metadata.mr_id || null,
    mr_title: metadata.title || metadata.mr_title || null,
    mr_url: metadata.mr_url || null,
    generated_at: opts.generatedAt || new Date().toISOString(),
    commit_sha: metadata.commits?.[0]?.sha || metadata.commit_sha || null,
    slides,
  };
  const html = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf8')
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(metadata.title || slug)}</title>`)
    .replace('<!-- SLIDES -->', slides.map((slide, index) => renderSlide(slide, index, metadata)).join('\n\n'))
    .replace('<!-- MANIFEST -->', escapeScript(JSON.stringify(manifest, null, 2)))
    .replace(/^[ \t]+$/gm, '');

  const htmlPath = path.join(outDir, `${slug}.html`);
  fs.writeFileSync(htmlPath, html);
  writeJsonFile(path.join(outDir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(outDir, 'README.md'), `# ${metadata.title || slug}\n\nOpen \`${slug}.html\` to view the deck.\n`);
  return { out_dir: outDir, html_path: htmlPath, manifest_path: path.join(outDir, 'manifest.json') };
}

async function buildCommand(options) {
  const metadata = readJsonFile(requireOption(options, 'metadata'));
  const slides = readSlides(requireOption(options, 'slides'));
  const outDir = requireOption(options, 'out');
  return buildDeck(metadata, slides, outDir);
}

function usage() {
  return `Usage:
  node scripts/ouapr.mjs fetch --target <url|branch|empty> --out <run-dir>
  node scripts/ouapr.mjs analyze --metadata <metadata.json> --diff <diff.patch> --out <file-index.json>
  node scripts/ouapr.mjs validate --metadata <metadata.json> --file-index <file-index.json> --slides <slides.json>
  node scripts/ouapr.mjs build --metadata <metadata.json> --slides <slides.json> --out <deck-dir>`;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseCliArgs(argv);
  if (!command || command === 'help' || command === '--help') {
    console.log(usage());
    return 0;
  }

  let result;
  if (command === 'fetch') result = await fetchCommand(options);
  else if (command === 'analyze') result = await analyzeCommand(options);
  else if (command === 'validate') result = await validateCommand(options);
  else if (command === 'build') result = await buildCommand(options);
  else throw new OuaprError(`unknown command: ${command}`, [usage()]);

  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    if (err instanceof OuaprError) {
      console.error(err.message);
      for (const detail of err.details || []) console.error(`- ${detail}`);
    } else {
      console.error(err?.stack || err);
    }
    process.exit(1);
  });
}
