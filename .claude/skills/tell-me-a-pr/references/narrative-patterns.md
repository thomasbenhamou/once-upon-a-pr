# Narrative patterns

How to write slide bullets for the `tell-me-a-pr` deck. The voice is bullet-first, terse, and addressed to a reviewer who has 90 seconds. This file is the contract — match it.

For what counts as must-consider (and what to deprioritize as boilerplate), see `heuristics.md`.

## Slide budget

Slide count tracks PR *complexity*, not size. **14 is a hard ceiling.** When torn between two budgets, pick the lower one — a 6-slide deck a reviewer reads beats a 10-slide deck they skip.

| Shape of PR | Slides | Composition |
|---|---|---|
| **Tiny / docs-only** (≤30 lines, single concern) | 2-3 | cover + (optional 1 code) + outro. No section, no risk, no skipped. |
| **Normal** (single feature, fix, or refactor with a few moving parts) | 5-9 | cover + 0-1 section + 2-5 code + (optional risk) + skipped + outro. |
| **Exceptionally complex** (cross-cutting refactor, migration + backfill, new integration with 3+ touchpoints) | 10-14 | cover + 1-2 sections + 5-9 code + risk + skipped + outro. |

Selectivity is the feature. Boilerplate, generated files, and mechanical renames stay off code slides — they go on the **Skipped** slide as grouped tallies. Reviewers skim those in the platform UI.

## Voice rules

- Reviewer-addressed. Second-person. Terse.
- You are explaining a PR to a colleague who will review it in 90 seconds.
- Every word earns its place. Cut articles, hedges, and anything an editor would red-pen.
- ≤5 bullets per slide. ≤12 words per bullet. Hard caps.
- One **bold** noun/verb per bullet at most.
- Two `==highlighter==` spans per slide at most.
- Optional tag prefix: `[risk]` `[new]` `[fix]` `[breaking]` `[refactor]`.
- No paragraphs. No "this PR does X" framing — just say what changed.
- Cover bullets answer **what changed?**
- Section bullets answer **why does this slice matter?**
- Code captions answer **what should I look at?**
- Outro bullets answer **where do I start reviewing?**

## Bullet anatomy

Three syntax knobs, used sparingly.

| Token | Meaning | Cap |
|---|---|---|
| `[tag] body` | tag chip (`risk`, `new`, `fix`, `breaking`, `refactor`) | 1 per bullet |
| `**word**` | bold ink — pick the load-bearing noun or verb | ≤1 per bullet |
| `==phrase==` | highlighter — the thing the reviewer's eye should snag on | ≤2 per slide |

Real example with all three:

```
[risk] **drops** the duplicated ==refund block== on NOT_REFUNDED
```

Read it: tag chip → load-bearing verb in bold → the concrete noun phrase highlighted. Twelve words or fewer. No hedging.

## Slide archetypes

### `cover`

Purpose: name the change in 3-5 bullets. The reviewer should know the shape of the MR before scrolling. No prose summary, no "this PR…" — just the bullet list of what moved.

```
bullets:
  - [new] CTA splits ==classical== vs ==Payvet== flows
  - [new] À venir badge on next **pending** installment
  - [fix] cleaner labels across the panel
  - [fix] drops duplicated ==refund block== on NOT_REFUNDED
  - [refactor] visibility logic moved to a single resolver
```

### `section`

Purpose: 2-3 bullets framing why the next slice matters. Not a chapter heading — a lens. Tell the reviewer what to keep in mind for the next 1-3 code slides.

```
bullets:
  - **Payvet** flow now diverges from classical at the CTA
  - everything downstream branches on ==contract.kind==
  - watch for callers that still assume one flow
```

### `code`

Purpose: caption a diff window in 2-4 bullets. The diff is right there — your job is to point at intent, not narrate syntax. Highlight the line that breaks if the reviewer skims.

```
bullets:
  - resolver **collapses** five visibility flags into one
  - [risk] silent fallback when ==contract.kind== is null
  - tests cover Payvet + classical, not the null branch
```

### `risk`

Purpose: a bullet-only "watch this" slide for risks not anchored to a single file/line — missing rollback, untested off-path of a feature flag, breaking change for downstream callers, race condition that spans services. Use **only** when ≥2 such risks exist or one risk is too cross-cutting for a code-slide callout. The `risk` slide replaces what would otherwise be a half-orphaned risk callout.

Every bullet on a `risk` slide must start with `[risk]` and almost always uses the object form so the consequence is spelled out.

```
title: "What could break"
caption: "Two risks not pinned to a single line"
bullets:
  - text: "[risk] feature flag default off"
    why:  "Off-path is what ships to staging — new code is dark-launched and untested in prod-shape data."
  - text: "[risk] no rollback for the **contracts.kind** backfill"
    why:  "Once written, undoing requires another migration; coordinate with ops before the merge window."
  - text: "[risk] downstream **CRM sync** still expects the old field"
    why:  "Salesforce job will silently drop records until the field rename ships there too. Branch is open but unmerged."
```

Anti-pattern for risk slides: bullets that *locate* a risk without naming the consequence. If you can't write a `why`, the risk belongs in a code-slide callout, not here.

### `skipped`

Purpose: a grouped tally of changes deliberately left out of the deck. Builds reviewer trust — they see the curator's judgment about what was uninteresting *and* know they should skim those areas in the platform UI.

Always include this slide unless the PR is genuinely tiny (≤2 files OR ≤30 lines).

Format is a list of `{ label, count }` rows, *not* free-text bullets. Counts come from the analyzer; labels come from the `Skipped category` field on each boilerplate-tagged file.

```
title: "Not in the deck"
caption: "Skim these in the platform UI"
groups:
  - label: "routine route handlers"
    count: 12
  - label: "snapshot updates"
    count: 8
  - label: "type-only changes"
    count: 3
  - label: "doc tweaks"
    count: 1
```

Rules:

- ≤6 groups. If more, merge thematically related categories (`generated migrations` + `snapshot updates` → `mechanical churn`).
- Each label is plain text, ≤4 words, no markdown, no chips.
- Counts are integers, never zero.
- If only one or two files would land here, dissolve the slide and put a single bullet on the outro instead: `[skipped] 2 mechanical churn files`.

### `outro`

Purpose: tell the reviewer where to start. 2-4 bullets pointing at the riskiest file, the open question, or the test gap. End with a link or stat, not a thank-you.

```
bullets:
  - start in ==ClaimDetailsResolver.ts== — the visibility collapse
  - [risk] no test for null contract.kind
  - 5 files, +120 / -180
```

`[risk]` bullets must convey the consequence — not just label or locate. When the consequence won't fit the 12-word cap, use the object form so the reviewer reads the failure mode under the bullet:

```yaml
bullets:
  - text: "[risk] submit() stub in stores/breeder.ts"
    why:  "Returns STUB-${ts}. Onboarding silently breaks if shipped before BE contract lands."
```

## MR-type playbooks

Each shape lists slide kinds in order with a 1-bullet teaser so a subagent can pattern-match. Bullets shown are the *first* bullet of that slide — not the whole slide. Skipped slide is implied between code and outro for any non-tiny PR; omit when noted.

### Feature (normal complexity, 5-7 slides)

cover → (optional section) → 2-4 code slides → skipped → outro

```
cover    - [new] notification center in the header
section  - new endpoints all funnel through ==NotificationService==
code     - [new] /api/notifications/mark-all-read **bypasses** cache
code     - Vue tree mounts under <Header>, lazy-loaded
skipped  - 6 routine route handlers · 4 snapshot updates · 2 type-only
outro    - start in ==NotificationService.markAllRead==
```

### Refactor (normal complexity, 5-7 slides)

cover (before/after) → section (motivation) → 2-3 code slides → skipped → outro

```
cover    - [refactor] **collapses** 4 resolvers into one
section  - old shape leaked ==contract.kind== into the view
code     - new resolver — single switch on contract.kind
code     - migration bridge keeps old callers alive for 1 release
skipped  - 18 mechanical renames · 3 mirror tests
outro    - delete bridge in next sprint — see ==TODO(2026-05)==
```

### Fix (tiny/easy, 2-3 slides)

cover (1 root cause) → optional 1 code slide → outro. No section, no skipped.

```
cover - [fix] **null** contract.kind crashed the panel
code  - guard added at ==resolveVisibility== entry
outro - regression test in ==ClaimDetails.spec==
```

### Integration (normal complexity, 5-7 slides)

cover → section (the contract) → API code → consumer code → skipped → outro

```
cover    - [new] Exabanque settlement webhook
section  - contract is ==settlement_id + status==, idempotent
code     - handler **rejects** unknown status, 400
code     - consumer maps status → domain event
skipped  - 3 generated client files · 5 mirror tests
outro    - retry policy lives in ==ExabanqueClient==
```

### Migration (exceptionally complex, 8-12 slides)

cover (risk-forward) → DDL code → backfill code → **risk slide** → skipped → outro

```
cover   - [breaking] adds ==contracts.kind== NOT NULL
cover   - [risk] backfill runs in 3 batches, 2M rows
code    - DDL — default 'classical' then drop default
code    - backfill script **chunked** by 100k, idempotent
risk    - [risk] no rollback once backfill commits — coordinate with ops
risk    - [risk] downstream Salesforce sync still reads old field
skipped - 6 generated migrations · 4 type-only changes
outro   - [risk] roll forward only — see runbook link
```

### Docs-only (2 slides)

cover + outro. No skipped slide.

```
cover - [refactor] README **rewritten** for new onboarding flow
outro - changes in ==docs/onboarding.md== — skim the diff
```

## Anti-patterns

- **"This PR introduces…"** — don't editorialise; say what changed.
- **3-clause subordinate sentences** — split into 2 bullets or cut.
- **Restating the file path in the bullet** — the file-link chip already does that.
- **"Note that…" / "It's worth mentioning…"** — just say it.
- **Code slide bullets that explain syntax** — the diff is right there; explain intent, not language.
- **"Cleanly", "elegantly", "nicely"** — neutral about correctness; describe, don't praise.
- **Bullet that ends with a question mark** — if you're unsure, say so as a `[risk]` tag, not a rhetorical.
- **Two bullets that say the same thing two ways** — pick one.
