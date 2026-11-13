# Deck template — slide-type contracts

The `deck-builder` subagent renders one `<section class="slide">` per slide spec
into `index.html`, replacing the `<!-- SLIDES -->` placeholder. The first slide
gets `class="slide active"`. The manifest JSON is injected into the
`<script id="manifest">` block.

`deck.js`, `styles.css`, and everything under `vendor/` are copied verbatim — do
not modify them per-deck. Customise the look by editing this template only.

## Aesthetic

Hand-drawn / sketchy on warm paper. Caveat for headings, Patrick Hand for body,
monospace for code (readability wins — code is **never** sketchy). Accents are
muted pencil tones: sage, terracotta, mustard, denim. Slides wobble by ±0.2°.
Frames around the diff, the kbd hint, and the nav buttons are drawn live by
[rough.js](https://roughjs.com/) on `DOMContentLoaded` and on resize.

## Vendor

All third-party assets live under `vendor/` and are linked **locally**. No CDN.

```
vendor/diff2html/diff2html-ui.min.js   # bundles highlight.js
vendor/diff2html/diff2html.min.css
vendor/roughjs/rough.umd.js
vendor/fonts/Caveat-latin.woff2          (Caveat 400)
vendor/fonts/Caveat-latin-700.woff2      (Caveat 700)
vendor/fonts/PatrickHand-latin.woff2     (Patrick Hand 400)
```

## Slide JSON shape (the contract)

The builder consumes a JSON array of slide specs. Slide kinds: `cover`, `section`, `risk`, `code`, `skipped`, `outro`. The shape is:

```json
[
  { "kind": "cover", "title": "...", "subtitle": "...",
    "bullets": ["[new] dual-flow CTA splits classical vs Payvet",
                "[fix] À venir badge on next pending installment",
                "[fix] drops duplicated refund block on NOT_REFUNDED claims"],
    "meta": { "author": "tbenhamou", "branch": "feat/claim-detail-pass",
              "lines_added": 142, "lines_removed": 33, "files_changed": 7,
              "shape": "feature", "est_read_seconds": 90 } },

  { "kind": "section", "title": "The CTA split",
    "caption": "Why the panel needed two buttons, not one.",
    "bullets": ["Classical and Payvet diverge after status check",
                "Old code branched at the wrong layer"] },

  { "kind": "risk", "title": "What could break",
    "caption": "Two risks not pinned to a single line",
    "bullets": [
      { "text": "[risk] Payvet flag default off in staging",
        "why": "Off-path ships dark-launched; QA hits classical only, Payvet path untested in staging." },
      { "text": "[risk] no rollback for the **kind** backfill",
        "why": "Once written, undoing requires another migration. Coordinate with ops before the merge window." }
    ] },

  { "kind": "code", "title": "Two CTAs, one resolver",
    "caption": "Resolver picks the flow before the button mounts.",
    "file": "src/claims/detail/ClaimCta.tsx",
    "file_url": "https://gitlab.com/.../diffs#abc123",
    "diff": "diff --git a/src/claims/detail/ClaimCta.tsx b/src/claims/detail/ClaimCta.tsx\n--- a/src/claims/detail/ClaimCta.tsx\n+++ b/src/claims/detail/ClaimCta.tsx\n@@ -12,4 +12,9 @@\n ...",
    "callouts": [{ "line": 34, "note": "guards Payvet behind feature flag", "kind": "warn" }] },

  { "kind": "skipped", "title": "Not in the deck",
    "caption": "Skim these in the platform UI",
    "groups": [
      { "label": "routine route handlers", "count": 12 },
      { "label": "snapshot updates", "count": 8 },
      { "label": "type-only changes", "count": 3 }
    ] },

  { "kind": "outro",
    "title": "Where to start",
    "bullets": [
      "[new] new resolver in ClaimCta.tsx",
      "[fix] verify NOT_REFUNDED snapshot test"
    ],
    "mr_url": "https://gitlab.com/.../merge_requests/1234",
    "files_changed": 7 }
]
```

Bullets are either bare strings (most cases) or objects `{ "text": "...", "why": "..." }`. The object form is required when a `[risk]` bullet's consequence can't fit the 12-word cap on `text` — `why` carries the failure mode and renders as a dimmed italic line beneath the bullet.

### Slide-budget contract

Slide count tracks PR complexity, not size. **14 is a hard ceiling.**

| Shape | Slides | Composition |
|---|---|---|
| Tiny / docs-only | 2-3 | cover + (optional 1 code) + outro. No section, no risk, no skipped. |
| Normal | 5-9 | cover + 0-1 section + 2-5 code + (optional risk) + skipped + outro. |
| Exceptional | 10-14 | cover + 1-2 sections + 5-9 code + risk + skipped + outro. |

## Slide spec → HTML mapping

### `cover`

```json
{ "kind": "cover", "title": "...", "subtitle": "...",
  "bullets": ["[new] ...", "[fix] ..."],
  "meta": { "author": "...", "branch": "...",
            "lines_added": 142, "lines_removed": 33, "files_changed": 7,
            "shape": "feature", "est_read_seconds": 90 } }
```

```html
<section class="slide" data-kind="cover">
  <h1>{{title}}</h1>
  <p class="subtitle">{{subtitle}}</p>
  <ul class="bullets">{{#bullets}}<li>{{rendered bullet}}</li>{{/bullets}}</ul>
  <div class="meta">
    <span class="shape shape-{{meta.shape}}">{{meta.shape}}</span>
    <span><strong>by</strong>{{meta.author}}</span>
    <span><strong>branch</strong>{{meta.branch}}</span>
    <span><strong>+{{meta.lines_added}}</strong>/<strong>−{{meta.lines_removed}}</strong></span>
    <span><strong>{{meta.files_changed}}</strong>files</span>
    <span class="read-time">~{{format_read_time(meta.est_read_seconds)}} read</span>
  </div>
</section>
```

- `meta.shape` is one of `feature | refactor | fix | integration | migration | mixed`. Renders as a chip in the meta strip; missing shape → omit the span (no empty chip).
- `meta.est_read_seconds` is an integer. The builder formats it: `<60` → `"45s"`, `60–119` → `"1m 30s"`, `≥120` → `"2m 15s"` (round seconds to nearest 5). Missing → omit the span.

### `section`

```json
{ "kind": "section", "title": "The CTA split",
  "caption": "Why the panel needed two buttons.",
  "bullets": ["...", "..."] }
```

```html
<section class="slide" data-kind="section">
  <h2>{{title}}</h2>
  <p class="caption">{{caption}}</p>
  <ul class="bullets">{{#bullets}}<li>{{rendered bullet}}</li>{{/bullets}}</ul>
</section>
```

### `code`

```json
{ "kind": "code", "title": "...",
  "caption": "...",
  "file": "src/x/y.ts",
  "file_url": "https://gitlab.com/.../diffs#abc123",
  "diff": "diff --git a/src/x/y.ts b/src/x/y.ts\n--- a/...\n+++ b/...\n@@ -12,4 +12,9 @@\n ...",
  "callouts": [
    { "line": 34, "note": "auth guard", "kind": "warn" },
    { "line": 39, "note": "submit() is stubbed", "kind": "risk",
      "why": "Returns STUB-${ts}. Onboarding silently breaks if shipped before BE contract lands." }
  ] }
```

```html
<section class="slide" data-kind="code">
  <div class="code-head">
    <h3>{{title}}</h3>
    <a class="file-link" href="{{file_url}}" target="_blank" rel="noreferrer">{{file}}</a>
  </div>
  <p class="caption">{{caption}}</p>
  <div class="diff-frame">
    <svg class="frame-sketch" aria-hidden="true"></svg>
    <div class="diff-container"></div>
  </div>
  <script type="application/x-diff" class="slide-diff">{{diff}}</script>
  <script type="application/json" class="slide-callouts">{{callouts as JSON, [] if none}}</script>
</section>
```

- `diff` is a unified diff string (`diff --git`, `---`, `+++`, `@@` hunks).
  HTML-escape it before injection (or rely on `<script type="application/x-diff">`
  treating its body as opaque text — `</script>` inside the diff still has to be
  escaped).
- `callouts` is **always** emitted, even as `[]`, so the script is parseable.
- `kind` in a callout is one of `info` (denim), `warn` (mustard), `risk` (terracotta).
  Default if missing: `warn`.
- `line` is the **new-file** line number (right side of the diff).
- `why` is an optional one-liner (≤25 words) explaining the consequence/failure mode. **Required when `kind: "risk"`.** Rendered in the tooltip beneath `note`, separated by a thin rule and styled as dimmed italic.

### `risk`

```json
{ "kind": "risk", "title": "What could break",
  "caption": "Two risks not pinned to a single line",
  "bullets": [
    { "text": "[risk] **token rotation** moves to gateway",
      "why": "Old in-app rotator stays wired up — double rotation if the flag flips before deploy." },
    { "text": "[risk] feature flag default off",
      "why": "Off-path is what ships to staging; the new code is dark-launched and untested in prod-shape data." }
  ] }
```

```html
<section class="slide" data-kind="risk">
  <h2>{{title}}</h2>
  <p class="caption">{{caption}}</p>
  <ul class="bullets">{{#bullets}}<li>{{rendered bullet}}</li>{{/bullets}}</ul>
</section>
```

- Same bullet rendering rules as `cover`/`section`/`outro`: tag chips, bold, highlighter, optional `why` line.
- Use only when there are ≥2 cross-cutting risks that don't anchor to a single file/line, or a single risk too important to bury in a code-slide callout.
- Almost every bullet here uses the object form (text + why) — naming the consequence is the whole point.

### `skipped`

```json
{ "kind": "skipped", "title": "Not in the deck",
  "caption": "Skim these in the platform UI",
  "groups": [
    { "label": "routine route handlers", "count": 12 },
    { "label": "snapshot updates", "count": 8 },
    { "label": "type-only changes", "count": 3 }
  ] }
```

```html
<section class="slide" data-kind="skipped">
  <h2>{{title}}</h2>
  <p class="caption">{{caption}}</p>
  <ul class="skipped-groups">
    {{#groups}}<li><span class="skipped-count">{{count}}</span> {{label}}</li>{{/groups}}
  </ul>
</section>
```

- Groups are plain text — no tag chips, no bold, no highlighter, no markdown.
- ≤6 groups. Each label ≤4 words. Counts are integers, never zero.
- If only 1-2 files would land here, dissolve the slide and put a single `[skipped]` bullet on the outro instead.

### `outro`

```json
{ "kind": "outro", "title": "Where to start",
  "bullets": ["[risk] ...", "[new] ..."],
  "mr_url": "https://...", "files_changed": 7 }
```

```html
<section class="slide" data-kind="outro">
  <h2>{{title}}</h2>
  <ul class="bullets">{{#bullets}}<li>{{rendered bullet}}</li>{{/bullets}}</ul>
  <a class="mr-cta" href="{{mr_url}}" target="_blank" rel="noreferrer">Open the MR →</a>
  <div class="deck-meta">{{files_changed}} files changed</div>
</section>
```

## Bullet rendering rules

The deck-builder applies these rules **in order** when turning a bullet entry
into HTML. They are not optional — they are the contract.

A bullet entry is either a string or an object `{ "text": "...", "why": "..." }`.
For object entries, treat `text` as the bullet string for steps 1–3, then append
the `why` rendering described in step 4.

1. **Tag prefix.** If the bullet starts with one of:
   `[risk]`, `[new]`, `[fix]`, `[breaking]`, `[refactor]`
   strip the prefix and emit a chip:
   `<span class="tag tag-{name}">{name}</span> {rest}`.
   Tag colours: `risk → terracotta`, `new → sage`, `fix → denim`,
   `breaking → mustard with terracotta border`, `refactor → muted ink`.
2. **Markdown bold.** Wrap any phrase in `**word**` and the builder emits
   `<strong>word</strong>`. Load-bearing emphasis only — **at most one** per
   bullet.
3. **Highlighter.** Wrap any phrase in `==phrase==` (Obsidian-style mark) and
   the builder emits `<mark>phrase</mark>`. **At most two** per slide.
4. **Why line (object form only).** If the entry is an object with a `why`,
   emit a sibling `<span class="bullet-why">{why}</span>` after the bullet
   text. `why` is plain text — HTML-escape it; no markdown, no chips, no
   highlighter. Renders as a dimmed italic line under the bullet.

### Hard caps (the architect must respect these)

- **≤ 5 bullets per slide.**
- **≤ 12 words per bullet.**
- **≤ 1 `**bold**` per bullet.**
- **≤ 2 `<mark>` per slide.**
- **≤ 4 callouts per code slide.**
- Bullets are flat — **no nested lists**.

## Header, progress, kbd hint, navigation

- The header bar shows MR title (left) and `current / total` plus a thin
  hand-drawn progress bar (right). The bar's frame is drawn by rough.js.
- The bottom-right cluster is **persistent**: a small caption
  `⌨ ◀ ▶ to navigate` framed by a sketchy rectangle, sitting **above** the two
  arrow buttons. The caption is always visible.
- Each arrow button has a sketchy rough.js circle outline drawn into an inline
  SVG inside the button.
- Keyboard: `←`, `→`, `Space`, `PageUp`, `PageDown`, `Home`, `End`.

## Manifest

Inject into `<script id="manifest">`:

```json
{
  "mr_id": "1234",
  "mr_title": "Two CTAs, one resolver",
  "mr_url": "https://...",
  "generated_at": "2026-04-25T12:34:56Z",
  "commit_sha": "abc123",
  "slides": [ /* the slide specs, post-render */ ]
}
```

`deck.js` uses `mr_title` (preferred) or `mr_id` to set the header title.

## HTML escaping

Always escape, in this order, when injecting into HTML:

1. `&` → `&amp;`
2. `<` → `&lt;`
3. `>` → `&gt;`
4. `"` → `&quot;` (attribute values only)

For text inside `<script type="application/x-diff">` and
`<script type="application/json">` the only sequence to worry about is the
literal string `</script>` — escape that as `<\/script>` if it appears inside
the payload. JSON inside `<script type="application/json">` is parsed by
`JSON.parse`, so escape `</` defensively before injection.
