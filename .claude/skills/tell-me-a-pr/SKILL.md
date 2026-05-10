---
name: tell-me-a-pr
description: Generate an interactive HTML slide deck narrating a Merge Request / Pull Request the way you'd walk a coworker through it — feature overview, then the risky or interesting code slice by slice. Use this whenever the user says "tell me a PR" or wants a "PR walkthrough", "MR story", "MR deck", "review deck", "MR recap", "explain this MR", a narrated code tour of a changeset, or anything where the goal is to help a reviewer understand a change effortlessly before they dive into the raw diff. Works with both GitLab and GitHub.
---

# Tell Me a PR

## What this skill does

Takes an MR/PR (GitLab or GitHub) and produces a self-contained interactive HTML slide deck that tells its story:

1. A cover slide with the feature headline and tag-chip bullets.
2. A handful of code slides showing the risky or interesting parts as rendered diffs with sketchy callouts.
3. A link back to each file on the MR so the reviewer can dive in when they want.

Output lives in `docs/tell-me-a-pr/<slug>/<slug>.html` (where `<slug>` is `<mr-id>-<title-slug>`, e.g. `1234-add-notification-center`) and is linked from a comment posted on the MR.

The visual theme is hand-drawn: rough.js sketches, highlighter spans, tag chips, a persistent keyboard hint above the arrows. The template handles all of that — your job is to feed it bullets and diffs.

## Core principles

- **One-shot with subagents.** The orchestrator never loads the raw diff into its own context. Every heavy phase is delegated to a Task subagent that returns compact structured JSON.
- **Adaptive, not templated.** Slide count and ordering adapt to the MR. A 20-line bugfix gets 3 slides. A 2000-line feature gets 12.
- **Heuristics as safety net.** LLM judgment decides most things, but a fixed heuristic list (see `references/heuristics.md`) flags must-show items so critical code (migrations, auth, new integrations) never gets skipped.
- **Bullets, not prose.** Each slide is a headline plus 3–5 short bullets. Code slides render a unified diff. The reviewer skims; nobody reads paragraphs on a slide.

---

## Bullet rules (hard caps — every subagent must enforce these)

- ≤5 bullets per slide.
- ≤12 words per bullet.
- Tag prefix optional, picked from this closed set: `[risk] [new] [fix] [breaking] [refactor]`. The builder strips the prefix and renders it as a chip.
- Markdown bold (`**word**`) marks load-bearing emphasis. ≤1 per bullet.
- Highlighter spans (`==phrase==`) call out the one thing the eye should land on. ≤2 per slide.
- No prose paragraphs anywhere. No trailing summaries. No "In conclusion".

If a bullet doesn't fit in 12 words, cut a word. If it still doesn't fit, it's two bullets or it's the wrong bullet.

### Risk articulation (`[risk]` bullets MUST explain the consequence)

A `[risk]` bullet is useless if it only labels or locates the risky code — the reviewer must understand **what could go wrong**. Bad: `[risk] submit() stub in stores/breeder.ts` (just a pointer). Good: `[risk] submit() returns fake STUB-${ts} — onboarding breaks if shipped` (names the failure mode).

When the consequence can't fit the 12-word cap, use the **object form** instead of a bare string:

```json
{ "text": "[risk] submit() stub in stores/breeder.ts",
  "why": "Returns STUB-${ts}. Onboarding silently breaks if shipped before BE contract lands." }
```

- `text` follows the same rules as a string bullet (≤12 words, tag/bold/highlight allowed).
- `why` is a one-liner explaining the consequence or failure mode. ≤25 words. Plain text, no markdown.
- The builder renders `why` as a dimmed italic line beneath the bullet.

Use the object form **only** when needed — most bullets are still bare strings. It is mandatory whenever the bullet starts with `[risk]` and the consequence isn't already plainly stated in the text.

---

## Slide-type contract

This is the source of truth. It must match `assets/deck-template/README.md` and `references/narrative-patterns.md` exactly. Do not invent variants.

```json
{ "kind": "cover", "title": "...", "subtitle": "...",
  "bullets": [
    "[new] dual-flow CTA splits classical vs Payvet",
    { "text": "[risk] token rotation moves to gateway",
      "why": "Old in-app rotator stays wired up — double rotation if the flag flips before deploy." }
  ],
  "meta": { "author": "...", "branch": "...", "lines_added": 142, "lines_removed": 33, "files_changed": 7 } }

{ "kind": "section", "title": "...", "caption": "...", "bullets": ["...", "..."] }

{ "kind": "code", "title": "...", "caption": "...",
  "file": "src/...", "file_url": "https://.../diffs#abc",
  "diff": "<unified diff string starting with `diff --git` or `--- a/... +++ b/... @@`>",
  "callouts": [{ "line": 34, "note": "auth guard", "kind": "info|warn|risk",
                 "why": "consequence/failure mode — required when kind is risk" }] }

{ "kind": "outro", "title": "...", "bullets": ["...", "..."],
  "mr_url": "...", "files_changed": 14 }
```

---

## Workflow

Execute phases in order. After each subagent returns, validate the JSON before moving on. If a subagent fails, retry once with a more constrained prompt before surfacing the error.

### Phase 1 — Fetch the MR

Dispatch an `mr-fetcher` subagent with `$ARGUMENTS` (may be a URL, a branch name, or empty):

> You are fetching an MR/PR for a downstream slide deck pipeline. Return a compact JSON metadata blob — never echo the diff or long description into your reply.
>
> 1. **Detect the platform:**
>    - `glab` available and `git remote get-url origin` points to `gitlab.com` or a self-hosted GitLab → **GitLab**
>    - `gh` available and remote is `github.com` → **GitHub**
>    - Both available, ambiguous → use the remote URL to decide.
>
> 2. **Resolve the MR ref** from `$ARGUMENTS`:
>    - URL → parse `<project>` and `<mr-id>` from it.
>    - Branch name → look up the open MR/PR for that branch.
>    - Empty → use the current branch.
>    - No MR found / detached HEAD → return `{ "error": "no-mr-for-branch" }` and stop.
>
> 3. **Fetch metadata + diff:**
>    - GitLab: `glab mr view <id> --output json` and `glab mr diff <id> > /tmp/tell-me-a-pr-<mr-id>/diff.patch`
>    - GitHub: `gh pr view <id> --json title,body,author,baseRefName,headRefName,commits,additions,deletions,changedFiles,url` and `gh pr diff <id> > /tmp/tell-me-a-pr-<mr-id>/diff.patch`
>    - Always redirect the diff straight to disk. Do not load it into your context.
>
> 4. **Extract the linked Jira/issue key** by regex on the description (e.g. `[A-Z]+-\d+`). First match wins; null if none.
>
> 5. **Truncate the description** to ≤500 chars in the returned blob (keep the head). The architect doesn't need the full body — just the gist.
>
> 6. **Compute a `slug`** as `<mr-id>-<title-slug>`, where `<title-slug>` is the MR title lowercased, with non-alphanumeric chars collapsed to single hyphens, leading/trailing hyphens stripped, and truncated to 50 chars (cut on a word boundary if possible). Example: MR #1234 "Add notification center, v1" → `1234-add-notification-center-v1`.
>
> Return JSON only:
>
> ```json
> {
>   "platform": "gitlab|github",
>   "mr_id": "123",
>   "mr_url": "https://...",
>   "title": "...",
>   "slug": "1234-add-notification-center-v1",
>   "description_excerpt": "first 500 chars...",
>   "author": "tbenhamou",
>   "base": "main",
>   "head": "feat/notifs",
>   "commits": [{ "sha": "abc123", "subject": "..." }],
>   "files_changed": 7,
>   "lines_added": 142,
>   "lines_removed": 33,
>   "jira_key": "GRO-1234",
>   "diff_path": "/tmp/tell-me-a-pr-123/diff.patch"
> }
> ```

Validate the JSON. On `{ "error": ... }`, surface to the user and stop. The orchestrator only ingests this blob — the raw diff and full description stay on disk.

### Phase 2 — Analyze the diff

Dispatch a `diff-analyzer` subagent with this prompt:

> You are analyzing an MR diff to identify candidates for inclusion in a narrated slide deck.
>
> Read `/tmp/tell-me-a-pr-<mr-id>/diff.patch` and the MR description below.
>
> MR title: `<title>`
> MR description: `<description>`
>
> Return a JSON array of file entries:
> ```json
> [
>   {
>     "path": "src/notifications/api.ts",
>     "change_type": "added|modified|deleted|renamed",
>     "lines_added": 42,
>     "lines_removed": 3,
>     "must_show": true,
>     "must_show_reason": "new public API surface",
>     "interesting_score": 0.9,
>     "interesting_reason": "introduces the notification center endpoints",
>     "diff_hunk_hints": [0, 2]
>   }
> ]
> ```
>
> Apply the heuristics in `references/heuristics.md` to set `must_show`. Apply your own judgment for `interesting_score` (0–1). `diff_hunk_hints` is optional — if you want to nudge the curator toward specific hunks (by index in the file's diff), include them; otherwise omit the field.
>
> Return JSON only. No prose.

### Phase 3 — Architect the narrative

Dispatch a `story-architect` subagent with the file entries from Phase 2 plus the MR metadata.

> You are planning the slide deck for an MR walkthrough.
>
> Input: MR metadata + the file analysis from the diff-analyzer.
>
> Decide:
> - Total slide count (between 4 and 14, scaling with MR complexity — not size).
> - Slide ordering that tells a coherent story: start from the user-facing intent, move through the backbone (API, domain, integrations), end with UI.
> - Which files to merge into a single slide, which to split across multiple, which to skip.
>
> Every file with `must_show: true` must appear somewhere.
>
> **Bullet rules — enforce these on every slide you emit:**
> - ≤5 bullets per slide.
> - ≤12 words per bullet.
> - Tag prefix optional, from this closed set: `[risk] [new] [fix] [breaking] [refactor]`.
> - Markdown bold (`**word**`) for load-bearing emphasis, ≤1 per bullet.
> - Highlighter (`==phrase==`) for the one thing the eye should land on, ≤2 per slide.
> - No prose paragraphs. No "narration". No trailing summaries.
> - **`[risk]` bullets must convey the consequence**, not just label/locate. If it can't fit in 12 words, use the object form `{ "text": "[risk] ...", "why": "consequence in ≤25 words" }` — never emit a `[risk]` bullet that doesn't tell the reviewer what could go wrong.
>
> Return a JSON array of slide specs matching this contract exactly:
>
> ```json
> [
>   { "kind": "cover", "title": "Notification center, v1",
>     "subtitle": "Three endpoints, one inbox, no more polling",
>     "bullets": [
>       "[new] dual-flow CTA splits classical vs Payvet",
>       { "text": "[risk] **token rotation** moves to the gateway",
>         "why": "Old in-app rotator stays wired up; double rotation if the gateway flag flips before deploy." },
>       "==first slice== of the realtime project"
>     ],
>     "meta": { "author": "tbenhamou", "branch": "feat/notifs", "lines_added": 142, "lines_removed": 33, "files_changed": 7 } },
>
>   { "kind": "section", "title": "The API", "caption": "Three endpoints wrap the domain",
>     "bullets": ["[new] `GET /notifications`", "[new] `POST /notifications/:id/dismiss`", "[refactor] auth moves to middleware"] },
>
>   { "kind": "code", "title": "Three new endpoints",
>     "caption": "Wraps the domain API and adds the dismiss path",
>     "file": "src/notifications/api.ts",
>     "file_url": "https://gitlab.com/.../diffs#abc123" },
>
>   { "kind": "outro", "title": "Worth a look",
>     "bullets": [
>       { "text": "[risk] new auth middleware on every route",
>         "why": "Bypass on a typo would silently expose the inbox API; no integration test covers the deny path yet." },
>       "==14 files==, mostly tests"
>     ],
>     "mr_url": "...", "files_changed": 14 }
> ]
> ```
>
> For `code` slides you only emit `title`, `caption`, `file`, and `file_url`. The curator fills in `diff` and `callouts` in Phase 4.

**If `--dry-run`:** stop here, print the outline, exit.

### Phase 4 — Curate code diffs

Dispatch a `code-curator` subagent per code slide (parallel). Provide the file path, the file_url, and any callout intent the architect mentioned.

The curator:

1. Reads the file at HEAD and the matching hunks from `/tmp/tell-me-a-pr-<mr-id>/diff.patch`.
2. Selects 1–3 hunks that best illustrate the change. Total 15–60 lines of diff, lean tighter when possible.
3. Builds a unified-diff string starting with `--- a/<path>\n+++ b/<path>\n@@ ... @@\n …` covering only those hunks. Format must be diff2html-compatible.
4. Strips secrets in the diff body — same regex as before (`api[_-]?key`, `secret`, `password`, `token` followed by `=` or `:` with a string literal). Redact the **value**, not the whole line, so the diff still reads.
5. Maps callouts: for each thing worth highlighting, returns `{ "line": N, "note": "...", "kind": "info|warn|risk", "why": "..." }` where `line` is the line number on the post-image (the `+` side of the diff).
   - `note` is a ≤14-word one-liner: what the highlighted code does.
   - `why` is **required** when `kind` is `"risk"` — a ≤25-word explanation of the consequence or failure mode (e.g. "returns a stub value; production callers will silently get garbage if shipped before the BE contract lands"). Optional for `info`/`warn`. Plain text only.
6. Returns:

   ```json
   { "diff": "--- a/...\n+++ b/...\n@@ ... @@\n …",
     "callouts": [
       { "line": 34, "note": "auth guard", "kind": "warn" },
       { "line": 39, "note": "submit() is stubbed", "kind": "risk",
         "why": "Returns STUB-${ts}. Onboarding silently breaks if shipped before BE contract lands." }
     ],
     "caption": "≤14-word one-liner describing what the slide shows" }
   ```

No narration paragraph. The caption replaces it. **Bullet rules from above apply to the caption: ≤14 words, can use `**bold**` once, can use `==highlight==` once.**

### Phase 5 — Build the deck

Dispatch a `deck-builder` subagent with the full slide spec (architect output + curator output merged). The builder consumes the JSON shape documented in **Slide-type contract** above and produces HTML matching the template contract documented at `assets/deck-template/README.md`.

The builder must:

1. Copy `assets/deck-template/` to `docs/tell-me-a-pr/<slug>/`, then rename the copied `index.html` to `<slug>.html`.
2. Replace the `<!-- SLIDES -->` placeholder in `<slug>.html` with the generated `<section class="slide">` blocks. Also replace the `<title>…</title>` tag's contents with `<slug>` so the browser tab shows the PR slug.
3. Render bullets:
   - Each bullet entry is either a string or an object `{ "text": "...", "why": "..." }`. For object form, render `why` as a dimmed italic `<span class="bullet-why">…</span>` beneath the bullet text. Both forms otherwise follow the same rules below.
   - Strip `[tag]` prefixes from the start of the bullet text and render them as `<span class="chip chip--<tag>">tag</span>`.
   - Convert `**phrase**` → `<strong>phrase</strong>`.
   - Convert `==phrase==` → `<mark>phrase</mark>`.
   - `why` is plain text — escape, do not run markdown on it.
4. Render code slides:
   - Embed the unified diff inside `<script type="application/x-diff" class="slide-diff">…</script>` — the deck.js runtime hands it to diff2html.
   - Embed callouts inside `<script type="application/json" class="slide-callouts">[…]</script>` — the runtime overlays rough.js sketches keyed by `line`.
5. Write a `manifest.json` with MR id, generation timestamp, commit SHA, and the slide spec — so re-runs can diff and the deck is reproducible.

The hand-drawn theme (rough.js sketches, highlighter spans, tag chips, the persistent keyboard hint above the arrows) is the template's job. The builder must not reimplement it — it only produces the bullet/diff/callout HTML the runtime expects.

### Phase 6 — Publish (ask first; never auto-publish)

The deck is now sitting at `docs/tell-me-a-pr/<slug>/<slug>.html`. **Do not commit, push, or post a comment without explicit user confirmation.** Show the local path and ask the user what to do via `AskUserQuestion`:

> Header: `Publish deck`
> Question: `Deck generated at docs/tell-me-a-pr/<slug>/<slug>.html. Publish it?`
> Options:
> - `Leave on disk (Recommended)` — keep the files locally; user reviews/iterates first.
> - `Commit only` — `git add` + `git commit`. No push, no MR comment.
> - `Commit + push` — also push to the remote. No MR comment.
> - `Commit + push + comment on MR` — full publish flow.

Then act on the choice:

- **Leave on disk:** print the local path and stop.
- **Commit only:** `git add docs/tell-me-a-pr/<slug>/ && git commit -m "docs(tell-me-a-pr): add review deck for MR <id>"`. Stop.
- **Commit + push:** above + `git push`. Stop.
- **Commit + push + comment on MR:** above + post a comment:
  > 📖 **Review deck:** [`docs/tell-me-a-pr/<slug>/<slug>.html`](<url-to-file-at-head-commit>)
  >
  > Generated walkthrough — ~`<N>` slides, `<T>s` to read. Open it raw-rendered or clone & double-click.
  - **GitLab:** `glab mr note <id> --message "..."`
  - **GitHub:** `gh pr comment <id> --body "..."`

If the user previously answered for this session, do not ask again — but each new run asks fresh.

---

## Edge cases

- **Empty/tiny MR (< 10 lines changed):** generate a 3-slide mini-deck — cover, one code slide, outro. Bullets only, no section slide.
- **Docs-only MR:** skip code curation, generate a 2-slide summary (cover + outro), bullets only.
- **Huge MR (> 2000 lines):** cap at 14 slides, bias toward must-shows, add a "Not covered" slide whose bullets list the skipped files (`[skipped] path/to/file.ts`).
- **Deck already exists at target path:** prompt before overwriting.
- **Detached HEAD / no MR for branch:** ask the user for an explicit MR URL.

## Output discipline

- Never print the raw diff to the main thread — subagents read it from disk.
- Slide content is bullets, not prose. Hard caps: ≤5 bullets per slide, ≤12 words per bullet.
- Code slides render a unified diff (1–3 hunks, 15–60 lines total). No raw "code window" strings.
- File paths in code slides link to the exact MR file view (`<mr-url>/diffs#<file-hash>`).
- Brevity is the feature: every word earns its place. The reviewer should grasp each slide in under 6 seconds.

## References

- `references/heuristics.md` — the must-show patterns used by `diff-analyzer`.
- `references/narrative-patterns.md` — slide archetypes and example bullets by MR type (feature, refactor, fix, integration).
- `assets/deck-template/` — HTML/CSS/JS scaffolding and slide-type contracts.
