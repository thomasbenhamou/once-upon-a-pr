---
description: Generate an interactive slide deck that tells the story of an MR — feature plus risky/interesting code — so a reviewer can understand it effortlessly
argument-hint: "[mr-url-or-branch]  [--dry-run]"
---

Generate an interactive HTML slide deck narrating an MR like you'd walk a coworker through it.

**Target:** $ARGUMENTS

If no argument is provided, use the MR associated with the current branch.

Follow the `tell-me-a-pr` skill end-to-end:

1. Fetch the MR (abstract GitLab/GitHub).
2. Analyze the diff with heuristics + LLM reasoning.
3. Architect the narrative adaptively based on MR size.
4. Curate code windows and write narration.
5. Build the deck into `docs/tell-me-a-pr/<mr-id>/`.
6. Commit, push, and post a comment on the MR with the deck link.

If `--dry-run`, stop after step 3 and show the proposed outline for approval.

Dispatch each heavy phase to a dedicated subagent to keep the orchestrator's context lean.
