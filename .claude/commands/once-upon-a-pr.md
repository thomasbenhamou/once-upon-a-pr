---
description: Walk through a PR or MR with a short, calm slide deck that explains the intent and the important diffs
argument-hint: "[mr-url-or-branch]  [--dry-run]"
---

Use Once Upon a PR 🧚 to generate an interactive HTML walkthrough like a colleague explaining their work.

**Target:** $ARGUMENTS

If no argument is provided, use the MR associated with the current branch.

Follow `.claude/skills/once-upon-a-pr/SKILL.md`. Explain the reason for the change, choose the important diffs, and keep the slides clear and spacious. Use natural language and your judgment about length.

If `--dry-run`, return the proposed story outline before curating and building the deck.

Deliver the local HTML deck. Follow the user's existing instructions before committing, pushing, or posting a PR comment.
