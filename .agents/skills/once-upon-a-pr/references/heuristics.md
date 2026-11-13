# Choosing what matters

Use these as cues when reading the change. The runner flags likely areas for attention; it cannot decide what makes a good story. Reconsider flags in the context of this PR.

## Look closely

- Authentication, permissions, and session boundaries: who can now do what?
- Schema changes and migrations: what happens to existing data?
- External integrations and webhooks: how do failures and retries behave?
- Public APIs and shared types: does the contract change for callers?
- Infrastructure, deployment configuration, and feature flags: what activates the behavior?
- Dependencies: what capability or compatibility change is introduced?
- UI entry points: what changes for the person using the product?
- Tests: which scenario establishes the behavior or exposes an important gap?

Read relevant surrounding code before deciding. A small guard can be the central decision; a large generated file can contribute nothing to the explanation.

## Usually group or leave out

Generated clients, lockfiles, snapshots, mechanical renames, mirror implementations, routine wiring, and accompanying documentation usually belong in a brief mention rather than separate code slides.

Context can reverse that judgment. A public type may be the contract change. A test may contain the clearest explanation of a bug. Documentation may be the entire purpose of the PR. A seemingly generated migration may lock a table or rewrite data.

The index's `must_consider`, `boilerplate`, and `interesting_score` fields are starting points. Cover an important concern in the most useful place, or leave it out deliberately when it does not serve this walkthrough. Do not make the deck a file inventory.
