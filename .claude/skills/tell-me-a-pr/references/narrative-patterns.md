# Narrative patterns

How to write slide bullets for the `tell-me-a-pr` deck. The voice is bullet-first, terse, and addressed to a reviewer who has 90 seconds. This file is the contract — match it.

For what counts as must-show in the first place, see `heuristics.md`.

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

Each shape lists slide kinds in order with a 1-bullet teaser so a subagent can pattern-match. Bullets shown are the *first* bullet of that slide — not the whole slide.

### Feature

cover (3-5 changes) → section (intent) → 2-4 code slides → outro

```
cover    - [new] notification center in the header
section  - new endpoints all funnel through ==NotificationService==
code     - [new] /api/notifications/mark-all-read **bypasses** cache
code     - Salesforce sync fires on ==dismiss==, fail-open
code     - Vue tree mounts under <Header>, lazy-loaded
outro    - start in ==NotificationService.markAllRead==
```

### Refactor

cover (before/after framing) → section (motivation) → 2-3 code slides → outro

```
cover    - [refactor] **collapses** 4 resolvers into one
section  - old shape leaked ==contract.kind== into the view
code     - new resolver — single switch on contract.kind
code     - migration bridge keeps old callers alive for 1 release
outro    - delete bridge in next sprint — see ==TODO(2026-05)==
```

### Fix

cover (1 root cause + 2 effects) → 1-2 code slides → outro

```
cover    - [fix] **null** contract.kind crashed the panel
code     - guard added at ==resolveVisibility== entry
outro    - regression test in ==ClaimDetails.spec==
```

### Integration

cover → section (the contract) → API code slide → consumer code slide → outro

```
cover    - [new] Exabanque settlement webhook
section  - contract is ==settlement_id + status==, idempotent
code     - handler **rejects** unknown status, 400
code     - consumer maps status → domain event
outro    - retry policy lives in ==ExabanqueClient==
```

### Migration

cover (risk-forward) → DDL code slide → backfill code slide → rollout outro (extra `[risk]` tags)

```
cover   - [breaking] adds ==contracts.kind== NOT NULL
cover   - [risk] backfill runs in 3 batches, 2M rows
code    - DDL — default 'classical' then drop default
code    - backfill script **chunked** by 100k, idempotent
outro   - [risk] roll forward only — see runbook link
```

### Docs-only

2-slide mini deck (cover + outro)

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
