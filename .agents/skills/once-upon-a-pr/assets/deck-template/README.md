# Deck data and template

The Node runner renders a JSON array of slides into `index.html` and copies `styles.css`, `deck.js`, the local diff2html assets, fonts, and brand emblem. A generated deck opens directly from disk and needs no server or network connection.

For a quick preview, open `sample.html`. Opening the unfilled `index.html` template also takes you to that sample, keeping any slide fragment such as `#3`. Generated PR decks display their own content normally.

The visual identity is editorial and quiet: neutral white, Newsreader serif headings, DM Sans body text, and a muted plum accent. A book-and-spark emblem, italic wordmark, chapter numerals, and small colophon distinguish the slides. Subtle green/red diffs and visible numbered notes keep code readable. Edit the shared template to change the look.

Fonts and their OFL licenses live in `vendor/type/`; the original SVG emblem lives in `vendor/brand/`. They are copied into each generated deck. There are no CDN or font-service requests at viewing time.

## Slide shapes

Each slide has `kind` and, except for the button-only closing, `title`. An optional `eyebrow` overrides the small contextual label above its title. Choose the slides that help explain the change; there is no required count.

```json
[
  {
    "kind": "cover",
    "title": "A little more context on each profile",
    "subtitle": "People can add a short bio without changing the rest of their profile.",
    "changes": [
      { "label": "DB migration", "text": "Add an optional bio column." },
      { "label": "Service", "text": "Validate and save the bio." },
      { "label": "Controller", "text": "Reuse profile permissions." },
      { "label": "Editor", "text": "Expose the new bio field." }
    ],
    "meta": { "author": "alex", "files_changed": 4, "est_read_seconds": 90 }
  },
  {
    "kind": "section",
    "title": "Keep it optional",
    "caption": "Existing profiles stay as they are. A bio only appears when someone chooses to add one."
  },
  {
    "kind": "code",
    "title": "The limit belongs on the server too",
    "caption": "The editor helps people stay within the limit. The API enforces it for every caller.",
    "file": "src/users/bio.ts",
    "file_url": "https://example.com/pull/42/files",
    "diff": "diff --git a/src/users/bio.ts b/src/users/bio.ts\n--- a/src/users/bio.ts\n+++ b/src/users/bio.ts\n@@ -1 +1,4 @@\n export function validateBio(bio: string) {\n+  if (bio.length > 280) {\n+    throw new Error('Bio is too long');\n+  }\n",
    "callouts": [
      {
        "line": 2,
        "side": "new",
        "line_text": "  if (bio.length > 280) {",
        "note": "Direct API requests get the same length check as the editor.",
        "kind": "info"
      }
    ]
  },
  {
    "kind": "outro",
    "mr_url": "https://example.com/pull/42"
  }
]
```

- **`cover`:** `subtitle` introduces the reason for the change. `changes` gives a brief overview using `{ "label": "Service", "text": "Validate and save the bio." }` entries, grouped by meaningful areas. Optional `bullets` add context. Optional `meta` can carry `author`, `files_changed`, `est_read_seconds`, `branch`, `lines_added`, `lines_removed`, and `shape`. Keep visible metadata useful. Supported shapes are `feature`, `fix`, `refactor`, `integration`, `migration`, and `mixed`.
- **`section`:** `caption` and optional `bullets` explain an idea before its implementation.
- **`code`:** `file`, `file_url`, and `diff` are required. `caption` explains the decision; optional `callouts` connect notes to lines. The viewer lays out the excerpt and notes together and stacks them on small screens.
- **`risk`:** `caption` and/or `bullets` describe a supported concern and its consequence. File links help when there is a concrete review starting point. Risk slides are optional.
- **`skipped`:** optional context about omitted work. `groups` is an array of `{ "label": "generated protobuf", "count": 10 }`; counts are positive integers. A short mention elsewhere may be enough.
- **`outro`:** a large “Open pull request” button. Supply `mr_url`, or let the builder use the PR URL from metadata. Title, captions, bullets, and file counts from older decks are ignored on this slide. Put review pointers on the relevant earlier slides.

## Text

Titles are plain text. Subtitles, captions, and bullet text support `**bold**` and `==subtle emphasis==`. Tags such as `[new]`, `[fix]`, `[risk]`, `[breaking]`, and `[refactor]` are optional; natural wording is usually sufficient.

A bullet is either a string or an object:

```json
{
  "text": "The fallback changes how later requests behave too.",
  "why": "The mode is stored on the shared client, so a single unsupported RPC disables subsequent streaming attempts.",
  "file": "src/runtime/client.go",
  "file_url": "https://example.com/pull/42/files"
}
```

`why` is optional plain text shown under the main point. If a bullet links a file, supply both `file` and `file_url`. Writing length, emphasis, and slide selection are editorial choices; validation does not impose quotas.

## Diffs and annotations

Use unified diff text from the source change, with original hunk coordinates. Choose enough context to understand the decision and avoid unrelated code. Do not HTML-escape the diff in JSON: the builder handles embedding it safely, and the viewer restores escaped closing tags before rendering.

A callout needs `line`, `side`, and `line_text` plus an explanation in `note`. `side` defaults to `new`; use `old` for a removed line. `line_text` is the source text without its leading diff marker. Alternatively, use `line_start` and `line_end` to annotate a range, with `line_text` matching its first row.

`kind` can be `info`, `warn`, or `risk`. Optional `why` adds a consequence or a little context. A note can explain the consequence directly rather than splitting it into separate fields.

Validation checks that the line exists and that its text matches after whitespace normalization. The runtime checks the rendered row again; an invalid anchor is skipped with a warning. Valid notes appear beside the code with a matching gutter number. Hovering or focusing a note highlights its rows; activating it brings them into view. Notes stay attached to the actual rows when the diff scrolls or the viewport changes.

## Output and navigation

`manifest.json` contains PR identity, timestamp, source commit, and the slide data. It is also embedded as JSON in the HTML. Slides support deep links such as `#3`.

Use the previous/next buttons, arrow keys, Space, PageUp/PageDown, or Home/End. Buttons expose disabled states at the ends. The viewer respects reduced-motion preferences. The bundled `sample.html` is an illustrative profile-bio walkthrough, not an actual PR.
