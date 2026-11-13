# Writing the walkthrough

Sound like a colleague explaining their work. Keep the deck short because you selected well, rather than compressing every sentence until it becomes cryptic.

## Start with the reason

An opening should let a reviewer understand the problem and intended result before seeing implementation names. If the PR description does not explain why, investigate the relevant code or issue context. Label an inference when the source is ambiguous.

For example, a profile-editing feature might open with:

> **A little more context on each profile**
>
> People can add a short bio without changing the rest of their profile.

Follow the intent with a small overview of the areas touched. For this example: a database migration adds an optional column, the service validates and saves the value, the controller applies profile permissions, and the editor exposes the field. This gives the reader both the reason for the change and a map of what is coming.

## Explain the decision beside the code

A good code slide answers “why this change?” while the diff shows how it works.

Instead of:

> Validates length, trims whitespace, persists.

Try:

> The API enforces the same limit as the editor, so direct requests cannot bypass it.

Use a small excerpt that makes the decision visible. A note can explain a guard or a fallback, or connect two steps the reader might miss. Not every changed line needs an annotation.

## Give the story its own shape

These are possible paths, not templates to fill:

- **A fix:** what went wrong, the boundary that changes, and evidence for the fix.
- **A feature:** what someone can now do, the main decisions behind it, and any important limitation.
- **A refactor:** what made the old design difficult, the new boundary, and how behavior is preserved.
- **An integration:** why the connection exists, how data moves, and what happens when the other side fails.
- **A migration:** what changes for existing data, the transition, and any operational consequences.

Order the code around those ideas rather than the file tree. A dedicated risk or skipped slide is useful only when it adds understanding. A tiny change can end after one diff.

Close with a large “Open pull request” button. Put review guidance on the relevant earlier slides so the closing page stays simple.

## Leave room to think

Prefer a useful sentence to a string of keywords. A short paragraph is welcome when it connects cause and effect; bullets work when there are genuinely separate points. Use ordinary language and introduce unfamiliar terms through their purpose.

Leave off decorative labels, repetitive summaries, and metadata that competes with the story. A clear title and a calm diff may be enough. When a slide feels crowded, cut secondary material or give the next idea its own space.

Describe risks through consequences, with evidence or an explicit uncertainty. “This changes the shared client mode, so later requests also use the fallback” helps a reviewer more than “mutates client-wide mode.” Distinguish tests present in the PR from checks actually run during generation.
