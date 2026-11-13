# Deterministic Once Upon a PR V1

Historical implementation plan. The current skill and template include the later visual redesign and flexible writing guidance.

## Summary

Build a frictionless V1 where the skill remains copyable and self-contained, but deterministic work moves into a dependency-free bundled Node runner. Users only need the skill folder, Node, and `gh` or `glab`. The LLM stays responsible for narrative judgment; the runner handles fetching, diff indexing, schema validation, HTML rendering, and callout correctness. Also fix the current callout drawing alignment bug in the deck template.

## Key Changes

- Add a bundled Node CLI at `scripts/ouapr.mjs` inside the skill folder, mirrored for both Claude Code and Codex skill copies.
- Keep the CLI dependency-free: Node built-ins only, plus shelling out to existing `gh`/`glab`.
- Supported commands:
  - `fetch --target <url|branch|empty> --out <run-dir>`: resolves PR/MR metadata and writes `metadata.json` plus `diff.patch`.
  - `analyze --metadata <metadata.json> --diff <diff.patch> --out <file-index.json>`: parses files, hunks, line maps, change types, line counts, and deterministic `must_consider` / `boilerplate` flags.
  - `validate --metadata <metadata.json> --file-index <file-index.json> --slides <slides.json>`: enforces slide schema, bullet caps, risk `why`, slide cardinality, must-consider coverage, and callout anchors.
  - `build --metadata <metadata.json> --slides <slides.json> --out docs/once-upon-a-pr/<slug>`: copies template assets, renders HTML, embeds manifest, and writes the final deck.
- Revise `SKILL.md` so the LLM workflow becomes:
  - CLI fetches and indexes the PR.
  - LLM writes the narrative outline and code-slide intent as JSON.
  - CLI validates the JSON before continuing.
  - LLM chooses callout notes/risk wording, but every anchor must pass CLI validation.
  - CLI builds the final HTML.
- Update `.claude/commands/once-upon-a-pr.md` and README so publishing is explicit-confirmation only, matching the current skill safety rule.

## Callout Alignment Fix

- Update `deck.js` so callout overlays are positioned inside the scrollable `.diff-container`, not relative to `.diff-frame`.
- Compute circle geometry from the actual rendered code cell for the target row, using `line`, `side`, and `line_text`.
- Account for `scrollTop` and `scrollLeft`, long code rows, hidden slides becoming active, resize events, and font/layout settling.
- Keep runtime fail-safe behavior: if the target row is absent or `line_text` does not match, skip the callout and log a warning instead of drawing on the wrong line.
- Apply the template fix to future decks; optionally regenerate existing sample decks only if useful for visual comparison.

## Test Plan

- Add Node `--test` coverage for:
  - slug generation, metadata normalization, and Jira key extraction.
  - unified diff parsing, file stats, hunk maps, old/new line maps.
  - heuristic classification for auth, migrations, API files, generated files, lockfiles, docs, and type-only changes.
  - slide validation: bullet limits, risk `why`, required slide order, skipped-slide rules, callout `line_text` matching.
  - HTML build escaping for bullets, diffs, callouts, and manifest JSON.
- Add a regression fixture from `136987-kep-5825-cri-api-add-streaming-rpcs-for-cri-list` to verify slides 7 and 8 callout anchors validate.
- Use the existing Playwright dev setup for an optional visual regression check: render the generated deck, jump to slides 7 and 8, and assert each callout circle overlaps its target row.

## Assumptions

- V1 does not publish an npm package yet; the bundled Node script is the default frictionless path.
- V1 supports both Claude Code and Codex by keeping their skill copies in sync.
- Users are expected to have Node and either `gh` or `glab`; there is no `npm install`.
- The LLM still decides what is interesting and how to explain risk; the CLI only verifies structure, anchors, and deterministic facts.
