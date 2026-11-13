---
name: once-upon-a-pr
description: Create a concise, interactive HTML walkthrough of a GitHub pull request or GitLab merge request. Use for “Once Upon a PR,” PR walkthroughs, review decks, or narrated tours of a changeset that explain the intent and the important diffs.
---

# Once Upon a PR 🧚

Walk a colleague through a change: what problem prompted it, what the author chose to do, and the few pieces of code that make it work. Produce a short, calm HTML slide deck the reviewer can open locally.

## Tell the story

Write naturally. Use a clear headline, a little explanation, and a focused diff where code helps. Short sentences and a few bullets usually work well; use the form that makes the idea easiest to understand. Explain the reasoning without narrating syntax. There are no word quotas, prescribed slide counts, or required filler slides.

Let the reader understand the problem before introducing implementation details. On the opening slide, also give a brief overview of what changed, grouped by meaningful areas such as a database migration, service, controller, or editor. Use the cover's `changes` field to show each area and a short explanation; a file count alone does not convey the scope.

Connect each selected diff to a change in behavior or a meaningful decision. Keep useful review pointers beside the relevant code. Finish with a simple closing slide containing a large “Open pull request” button.

Selectivity matters. Group related changes, leave routine churn out, and spend attention on what the reviewer would otherwise miss. The patterns in [references/heuristics.md](references/heuristics.md) are prompts for judgment, not a coverage checklist. Mention omissions when they help the reviewer orient themselves; a separate skipped slide is optional.

Ground explanations in the PR description, diff, tests, and available context. Distinguish stated intent from inference. Explain concrete risks and consequences when supported; do not invent a risk to fill a slide or claim tests passed because they were added.

See [references/narrative-patterns.md](references/narrative-patterns.md) for examples of the voice and ways to shape a story.

## Keep the experience calm

Use the bundled visual identity: a neutral light canvas, Newsreader serif headings, DM Sans body text, generous space, and a muted plum accent. The book-and-spark emblem, italic wordmark, and chapter numerals give the deck its Once Upon a PR signature. Let the content carry the slide. Diffs keep subtle added/removed colors; numbered notes explain selected lines beside the code. Annotations should earn their place.

Choose a small diff excerpt that explains one decision. Include enough context to make it intelligible, preserve original code and line numbers, and split a busy slide when that makes it easier to follow. Avoid shrinking the text to squeeze in more code.

## Generate the deck

The skill is self-contained. It needs Node.js and authenticated `gh` or `glab` for fetching. Resolve the skill directory from this file; do not assume a particular agent's installation path. Work directly, or use subagents if the host supports them and delegation would help with a large diff.

Use a temporary run directory for intermediate files. The bundled runner handles fetching, diff indexing, validation, and rendering:

```bash
node <skill-dir>/scripts/ouapr.mjs fetch --target <pr-url-or-branch> --out <run-dir>
node <skill-dir>/scripts/ouapr.mjs analyze --metadata <run-dir>/metadata.json --diff <run-dir>/diff.patch --out <run-dir>/file-index.json
node <skill-dir>/scripts/ouapr.mjs validate --metadata <run-dir>/metadata.json --file-index <run-dir>/file-index.json --slides <run-dir>/slides.json
node <skill-dir>/scripts/ouapr.mjs build --metadata <run-dir>/metadata.json --slides <run-dir>/slides.json --out docs/once-upon-a-pr/<slug>
```

1. **Read the source.** With no target, fetch the current branch's open PR/MR. If none exists, ask for a URL. Read the complete description from `description.md` and the relevant diff from the saved files, rather than printing the raw diff into the conversation. Keep enough context to understand why the change exists.
2. **Choose the story.** Use the index to locate meaningful changes, then read the relevant code and tests. Plan the shortest walkthrough that explains the change. A simple fix may need only an opening, a diff, and a closing; a larger change can follow its major decisions. If requested with `--dry-run`, return the outline here.
3. **Write the slides.** Save an array of slide objects to `slides.json`. The supported shapes and examples are in [assets/deck-template/README.md](assets/deck-template/README.md). Titles and captions can be complete, natural sentences. Bullet lists, emphasis, tags, and callouts are optional.
4. **Verify and build.** Validate the final slides, correct invalid data or anchors, then build. Treat heuristic coverage warnings as a reason to reconsider selection, not a demand to add slides. If a browser is available, inspect the rendered deck, including a code slide, for readability and layout. Check that explanations are visible and links point to the relevant PR files.
5. **Deliver.** Link `docs/once-upon-a-pr/<slug>/<slug>.html` so the user can review it. Keep intermediate artifacts in the run directory.

Code slides use unified diff text copied from the actual change. A callout identifies an original line by `line`, `side` (`new` or `old`), and exact `line_text` without the diff marker. The runner checks the anchor against the excerpt; the viewer checks it again before marking the rendered row. Preserve those correctness checks while giving the writing room to breathe.

Build into a fresh directory or confirm before replacing an existing deck. Generated files stay local unless publishing has been authorized. Do not commit, push, or post a PR comment solely because the skill was invoked; follow the user's existing instructions about those actions.
