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
- **Selectivity is the feature.** The deck is *not* a coverage report. It surfaces the risky and interesting parts of the PR — boilerplate, routine route handlers, generated files, and mechanical renames stay out. The reviewer reads the deck, then skims the rest in the platform UI.
- **Adaptive, lean by default.** Slide count tracks PR *complexity*, not size. Tiny/easy PR → 2-3 slides. Normal feature/fix → 5-9 slides. Exceptionally complex PR → 10-14 slides. **14 is a hard ceiling.** When in doubt, cut a slide.
- **Heuristics as safety net.** LLM judgment decides most things, but a fixed heuristic list (see `references/heuristics.md`) marks files `must_consider` so critical code (migrations, auth, new integrations) is never silently dropped — though it may still be merged into a grouped bullet or listed on the Skipped slide rather than getting its own code slide.
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

Use the object form **only** when needed — most bullets are still bare strings. It is mandatory whenever the bullet starts with `[risk]` and the consequence isn't already plainly stated in the text. Exception: bullets on a dedicated `risk` slide always use object form so they can carry `why`, `file`, and `file_url`.

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
  "meta": { "author": "...", "branch": "...",
            "lines_added": 142, "lines_removed": 33, "files_changed": 7,
            "shape": "feature", "est_read_seconds": 90 } }

{ "kind": "section", "title": "...", "caption": "...", "bullets": ["...", "..."] }

{ "kind": "risk", "title": "...", "caption": "...",
  "bullets": [
    { "text": "[risk] **token rotation** moves to gateway",
      "why": "Old in-app rotator stays wired up — double rotation if the flag flips before deploy.",
      "file": "src/auth/token-rotation.ts",
      "file_url": "https://.../diffs#abc" },
    { "text": "[risk] feature flag default off; **off-path** untested",
      "why": "Staging exercises the off-path first; prod-shape data can break unseen.",
      "file": "src/flags/notifications.ts",
      "file_url": "https://.../diffs#def" }
  ] }

{ "kind": "code", "title": "...", "caption": "...",
  "file": "src/...", "file_url": "https://.../diffs#abc",
  "diff": "<unified diff string starting with `diff --git` or `--- a/... +++ b/... @@`>",
  "callouts": [{ "line": 34, "side": "new", "line_text": "if (!user) return",
                 "note": "auth guard", "kind": "info|warn|risk",
                 "why": "consequence/failure mode — required when kind is risk" }] }

{ "kind": "skipped", "title": "Not in the deck",
  "caption": "Skim these in the platform UI",
  "groups": [
    { "label": "routine route handlers", "count": 12 },
    { "label": "generated migrations", "count": 6 },
    { "label": "snapshot updates", "count": 18 },
    { "label": "doc tweaks", "count": 3 }
  ] }

{ "kind": "outro", "title": "...", "bullets": ["...", "..."],
  "mr_url": "...", "files_changed": 14 }
```

**Slide kind semantics:**

| Kind | Purpose | Required cardinality |
|---|---|---|
| `cover` | Name the change. Shape + read-time on meta. | Always exactly 1, first slide. |
| `section` | Frame the next 1-3 code slides. | 0-2 per deck. Skip on tiny PRs. |
| `risk` | Bullet-only "watch this" slide for risks not anchored to a single file/line (missing rollback, untested off-path of a flag, breaking change for downstream callers, etc.). | 0-1 per deck. Use only when ≥2 such risks exist or a single risk is too cross-cutting for a `code` callout. |
| `code` | One file, 1-3 hunks, 15-60 lines of diff, ≤4 callouts. | The bulk of the deck. |
| `skipped` | Grouped tally of changes deliberately left out. Builds reviewer trust. | Always 1, second-to-last, *unless* PR is tiny (≤2 files, ≤30 lines). Position before `outro`. |
| `outro` | Where to start reviewing. | Always exactly 1, last slide. |

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
>    - Compute `files_url` for fallback review links: GitLab → `<mr_url>/diffs`; GitHub → `<mr_url>/files`.
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
>   "files_url": "https://.../diffs-or-files",
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
>     "must_consider": true,
>     "must_consider_reason": "new public API surface",
>     "boilerplate": false,
>     "boilerplate_reason": null,
>     "interesting_score": 0.9,
>     "interesting_reason": "introduces the notification center endpoints",
>     "diff_hunk_hints": [0, 2]
>   }
> ]
> ```
>
> Apply the heuristics in `references/heuristics.md`:
> - `must_consider: true` if the file matches an "include" heuristic (security, data layer, integrations, public API, infra, deps, flags, UI entry points). The architect downstream is allowed to merge these into a grouped bullet or skip them — but never silently drop them.
> - `boilerplate: true` if the file matches a "Deprioritize / boilerplate" heuristic (routine handler mirroring siblings, autogenerated migration, snapshot/lockfile-only churn, pure rename, mirror test file). Boilerplate files cannot get their own code slide. They land on the Skipped slide unless they also have `must_consider: true` *and* a non-trivial reason — in which case the architect decides.
> - `interesting_score` (0–1) is your judgment of whether the file is worth a code slide for *this* PR specifically. Mirror the question: "would a reviewer learn something they couldn't infer from the file path?" High = yes; low = no.
> - `diff_hunk_hints` is optional — if you want to nudge the curator toward specific hunks (by index in the file's diff), include them; otherwise omit the field.
>
> Return JSON only. No prose.

### Phase 3 — Architect the narrative

Dispatch a `story-architect` subagent with the file entries from Phase 2 plus the MR metadata.

> You are planning the slide deck for an MR walkthrough. Selectivity is the feature — the deck surfaces the risky and interesting parts; reviewers skim the rest in the platform UI.
>
> Input: MR metadata + the file analysis from the diff-analyzer.
>
> **Step 1 — State the PR thesis.** Before picking slides, write the thesis: a single sentence (≤15 words) of what this PR is *really* about. Examples: *"Splits the claim CTA into Payvet and classical flows."* / *"Backfills the contracts.kind column in three batches."* Every slide you emit must serve this thesis. If a slide doesn't, drop it.
>
> **Step 2 — Pick the PR shape.** One of: `feature | refactor | fix | integration | migration | mixed`. Use the playbooks in `references/narrative-patterns.md` for ordering hints. Compute from the analyzer entries: many `change_type: "added"` and a coherent feature area → `feature`; high delete/add ratio with no behavior change → `refactor`; tiny diff with one bug → `fix`; new external SDK + webhook handler → `integration`; migration + backfill → `migration`; otherwise → `mixed`.
>
> **Step 3 — Pick the slide budget.** Tracks complexity, not line count. **14 is a hard ceiling.**
> - **Tiny / easy** (single concern, ≤2 risky files, ≤200 lines) → **2-3 slides** (cover + 1 code + outro, or cover + outro for docs-only).
> - **Normal** (single feature/fix/refactor with a few moving parts) → **5-9 slides**.
> - **Exceptionally complex** (cross-cutting refactor, migration with backfill, new integration with 3+ touchpoints) → **10-14 slides**.
> When torn between two budgets, pick the lower one. A 6-slide deck a reviewer reads beats a 10-slide deck they skip.
>
> **Step 4 — Compute `est_read_seconds`.** ~10s per cover/section/skipped/outro slide, ~15s per `risk` slide, ~25s per `code` slide. Surface as `meta.est_read_seconds` on the cover.
>
> **Step 5 — Order and select slides.**
> - Default ordering: cover → (optional section) → code slides (most-risky first when risk-heavy; user-facing-intent first when feature-heavy) → optional `risk` slide for cross-cutting risks → `skipped` → outro.
> - Every file with `must_consider: true` must end up somewhere: a code slide, a grouped bullet on a section/outro, or a line on the Skipped slide. Never silently dropped.
> - Files with `boilerplate: true` go on the Skipped slide (grouped by category) — not on code slides.
> - Files with low `interesting_score` (<0.4) and no `must_consider` flag also land on Skipped, grouped.
> - Use a `risk` slide only when ≥2 cross-cutting risks exist that don't anchor to a single file/line, or one risk is too important to bury in a code-slide callout.
> - Every bullet on a `risk` slide must use object form with `text`, `why`, `file`, and `file_url`. Pick the best changed file to inspect first. For truly cross-file risks, choose the primary review starting point and mention the broader surface in `why`. If the exact diff anchor is unavailable, use `files_url` as a fallback URL rather than omitting the link.
>
> **Step 6 — Always include a Skipped slide** unless the PR is genuinely tiny (≤2 files OR ≤30 lines changed). Even on small PRs with 5+ files, the reviewer benefits from seeing the curator's judgment about what was uninteresting.
>
> **Bullet rules — enforce these on every slide you emit:**
> - ≤5 bullets per slide.
> - ≤12 words per bullet.
> - Tag prefix optional, from this closed set: `[risk] [new] [fix] [breaking] [refactor]`.
> - Markdown bold (`**word**`) for load-bearing emphasis, ≤1 per bullet.
> - Highlighter (`==phrase==`) for the one thing the eye should land on, ≤2 per slide.
> - No prose paragraphs. No "narration". No trailing summaries.
> - **`[risk]` bullets must convey the consequence**, not just label/locate. If it can't fit in 12 words, use the object form `{ "text": "[risk] ...", "why": "consequence in ≤25 words" }` — never emit a `[risk]` bullet that doesn't tell the reviewer what could go wrong.
> - On `risk` slides, every bullet must be object-form and include `file` and `file_url`, pointing to the best changed file for review. Prefer a platform diff/file anchor; fallback to the MR files/diffs page.
>
> Return a JSON object matching this contract exactly:
>
> ```json
> {
>   "thesis": "Adds a notification center with three endpoints and an inbox.",
>   "slides": [
>     { "kind": "cover", "title": "Notification center, v1",
>       "subtitle": "Three endpoints, one inbox, no more polling",
>       "bullets": [
>         "[new] dual-flow CTA splits classical vs Payvet",
>         { "text": "[risk] **token rotation** moves to the gateway",
>           "why": "Old in-app rotator stays wired up; double rotation if the gateway flag flips before deploy." },
>         "==first slice== of the realtime project"
>       ],
>       "meta": { "author": "tbenhamou", "branch": "feat/notifs",
>                 "lines_added": 142, "lines_removed": 33, "files_changed": 7,
>                 "shape": "feature", "est_read_seconds": 90 } },
>
>     { "kind": "section", "title": "The API", "caption": "Three endpoints wrap the domain",
>       "bullets": ["[new] `GET /notifications`", "[new] `POST /notifications/:id/dismiss`", "[refactor] auth moves to middleware"] },
>
>     { "kind": "code", "title": "Three new endpoints",
>       "caption": "Wraps the domain API and adds the dismiss path",
>       "file": "src/notifications/api.ts",
>       "file_url": "https://gitlab.com/.../diffs#abc123" },
>
>     { "kind": "risk", "title": "What could break",
>       "caption": "Two risks not pinned to a single line",
>       "bullets": [
>         { "text": "[risk] new auth middleware on every route",
>           "why": "Bypass on a typo would silently expose the inbox API; no integration test covers the deny path yet.",
>           "file": "src/http/auth-middleware.ts",
>           "file_url": "https://gitlab.com/.../diffs#auth-middleware" },
>         { "text": "[risk] feature flag default off",
>           "why": "Off-path is what ships to staging — the new code is dark-launched and untested in prod-shape data.",
>           "file": "src/notifications/flags.ts",
>           "file_url": "https://gitlab.com/.../diffs#flags" }
>       ] },
>
>     { "kind": "skipped", "title": "Not in the deck",
>       "caption": "Skim these in the platform UI",
>       "groups": [
>         { "label": "snapshot updates", "count": 8 },
>         { "label": "type-only changes", "count": 3 },
>         { "label": "doc tweaks", "count": 1 }
>       ] },
>
>     { "kind": "outro", "title": "Where to start",
>       "bullets": ["start in ==NotificationService.markAllRead==", "[risk] no test for null inbox"],
>       "mr_url": "...", "files_changed": 14 }
>   ]
> }
> ```
>
> For `code` slides you only emit `title`, `caption`, `file`, and `file_url`. The curator fills in `diff` and `callouts` in Phase 4.
>
> The `thesis` field is for downstream phases — the curator and builder use it to keep slides on-message. Keep it ≤15 words, plain text.

**If `--dry-run`:** stop here, print the outline, exit.

### Phase 4 — Curate code diffs

Dispatch a `code-curator` subagent per code slide (parallel). Provide the file path, the file_url, and any callout intent the architect mentioned.

The curator:

1. Reads the file at HEAD and the matching hunks from `/tmp/tell-me-a-pr-<mr-id>/diff.patch`.
2. Selects 1–3 hunks that best illustrate the change. Total 15–60 lines of diff, lean tighter when possible.
3. Builds a unified-diff string starting with `--- a/<path>\n+++ b/<path>\n@@ ... @@\n …` covering only those hunks. Format must be diff2html-compatible.
4. Strips secrets in the diff body — same regex as before (`api[_-]?key`, `secret`, `password`, `token` followed by `=` or `:` with a string literal). Redact the **value**, not the whole line, so the diff still reads.
5. Maps callouts **after selecting the final diff slice**. For each thing worth highlighting, return an anchored callout:
   `{ "line": N, "side": "new|old", "line_text": "...", "note": "...", "kind": "info|warn|risk", "why": "..." }`.
   - `line` is the line number on the requested side of the final curated diff slice. Default side is `"new"`; use `"old"` only for removed code.
   - `line_text` is the exact visible code text on that rendered diff row, without the leading `+`, `-`, or space marker. It is mandatory.
   - For a multi-line highlight, use `line_start` and `line_end` instead of `line`; `line_text` must match the first highlighted row.
   - Do not anchor callouts to blank lines, braces-only lines, or comment-only lines unless the note is specifically about that line.
   - `note` is a ≤14-word one-liner: what the highlighted code does.
   - `why` is **required** when `kind` is `"risk"` — a ≤25-word explanation of the consequence or failure mode (e.g. "returns a stub value; production callers will silently get garbage if shipped before the BE contract lands"). Optional for `info`/`warn`. Plain text only.
   - Validate each callout against the exact `diff` you return. If `line_text` does not match, if the line is absent from the curated slice, or if the anchor is visually unhelpful, fix the anchor before returning.
6. Returns:

   ```json
   { "diff": "--- a/...\n+++ b/...\n@@ ... @@\n …",
     "callouts": [
       { "line": 34, "side": "new", "line_text": "if (!hasPermission(req)) return forbidden()",
         "note": "auth guard", "kind": "warn" },
       { "line": 39, "side": "new", "line_text": "return `STUB-${Date.now()}`",
         "note": "submit() is stubbed", "kind": "risk",
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
   - Each bullet entry is either a string or an object `{ "text": "...", "why": "...", "file": "...", "file_url": "..." }`. For object form, render `why` as a dimmed italic `<span class="bullet-why">…</span>` beneath the bullet text. When `file` and `file_url` are present, render a separate `<a class="bullet-file-link" href="…" target="_blank" rel="noreferrer">Review {file}</a>` beneath `why`. Both forms otherwise follow the same rules below.
   - Strip `[tag]` prefixes from the start of the bullet text and render them as `<span class="tag tag-<tag>">tag</span>`.
   - Convert `**phrase**` → `<strong>phrase</strong>`.
   - Convert `==phrase==` → `<mark>phrase</mark>`.
   - `why` is plain text — escape, do not run markdown on it.
4. Render code slides:
   - Embed the unified diff inside `<script type="application/x-diff" class="slide-diff">…</script>` — the deck.js runtime hands it to diff2html.
   - Before rendering, validate every callout against its slide's final `diff`: side/line exists, `line_text` matches the target row after trimming repeated whitespace, risk callouts have `why`, and no anchor lands on a blank/brace/comment-only line unless the note is about that line. Retry the curator once if validation fails.
   - Embed callouts inside `<script type="application/json" class="slide-callouts">[…]</script>` — the runtime overlays rough.js sketches keyed by `side` + `line` + `line_text`.
5. Render `risk` slides as `<section class="slide" data-kind="risk">` with `<h2>{title}</h2>`, optional `<p class="caption">{caption}</p>`, and the bullet list under `<ul class="bullets">`. Same bullet rendering rules as cover/section/outro, plus the per-risk file link for object bullets with `file` and `file_url`.
6. Render `skipped` slides as `<section class="slide" data-kind="skipped">` with `<h2>{title}</h2>`, optional `<p class="caption">{caption}</p>`, and a `<ul class="skipped-groups">` of `<li><span class="skipped-count">{count}</span> {label}</li>` rows. No tags, no markdown, no highlighter — plain text only.
7. Render the cover meta with the full set of fields — author, branch, +/− line counts, files_changed, **shape**, and **est_read_seconds**. Format per the cover spec in `assets/deck-template/README.md`. Missing optional fields render gracefully (no empty span).
8. Write a `manifest.json` with MR id, generation timestamp, commit SHA, the thesis, and the slide spec — so re-runs can diff and the deck is reproducible.

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

- **Empty/tiny MR (< 10 lines changed):** generate a 2-slide mini-deck — cover + outro. Bullets only, no code slide, no Skipped.
- **Tiny MR (10–30 lines, ≤2 files):** 2-3 slides — cover + (optional 1 code slide if the change is non-trivial) + outro. No Skipped slide.
- **Docs-only MR:** skip code curation, generate a 2-slide summary (cover + outro), bullets only.
- **Huge MR (> 2000 lines):** still capped at 14 slides. Bias toward `must_consider` files with high `interesting_score`. Use a `risk` slide if cross-cutting risks exist. Skipped slide is mandatory and groups the long tail by category.
- **Deck already exists at target path:** prompt before overwriting.
- **Detached HEAD / no MR for branch:** ask the user for an explicit MR URL.

## Output discipline

- Never print the raw diff to the main thread — subagents read it from disk.
- Slide content is bullets, not prose. Hard caps: ≤5 bullets per slide, ≤12 words per bullet.
- Code slides render a unified diff (1–3 hunks, 15–60 lines total). No raw "code window" strings.
- File paths in code slides link to the exact MR file view (`<mr-url>/diffs#<file-hash>`).
- Brevity is the feature: every word earns its place. The reviewer should grasp each slide in under 6 seconds.

## References

- `references/heuristics.md` — the must-consider and deprioritize patterns used by `diff-analyzer`.
- `references/narrative-patterns.md` — slide archetypes and example bullets by MR type (feature, refactor, fix, integration).
- `assets/deck-template/` — HTML/CSS/JS scaffolding and slide-type contracts.
