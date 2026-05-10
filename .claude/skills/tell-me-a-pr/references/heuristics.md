# Must-show heuristics

Patterns that automatically mark a file as `must_show: true` in Phase 2. These are the safety net — the LLM may find other interesting things, but these should never be missed.

## Security & auth

- Files under `**/auth/**`, `**/authn/**`, `**/authz/**`, `**/permissions/**`, `**/rbac/**`.
- Diffs containing: `hasPermission`, `isAdmin`, `requireAuth`, `bypassAuth`, `@PreAuthorize`, `policy`, `guard`.
- Changes to JWT/session/cookie config.
- **Reason:** `security-sensitive path`.

## Data layer

- DB migrations: `**/migrations/**`, `**/schema.prisma`, `**/*.sql`, Flyway/Liquibase paths.
- ORM model/entity changes (adding/removing fields, changing types).
- **Reason:** `schema change`.

## External integrations

- New imports from SDKs for payment, identity, CRM, messaging: `stripe`, `salesforce`, `mulesoft`, `twilio`, `sendgrid`, `segment`, `intercom`.
- New HTTP clients pointing at non-internal domains.
- Changes to webhook handlers (`**/webhooks/**`, `**/callbacks/**`).
- **Reason:** `new external integration` or `integration change`.

## Public API surface

- Route/controller files: `**/routes/**`, `**/controllers/**`, `**/handlers/**`, `**/api/**`.
- OpenAPI/GraphQL schema files: `*.openapi.yaml`, `schema.graphql`, `*.proto`.
- Added/removed endpoints.
- **Reason:** `public API change`.

## Infrastructure & deploy

- Terraform, CloudFormation, Kubernetes manifests, Dockerfiles, CI workflows.
- Environment variable additions to `.env.example`.
- **Reason:** `infra/deploy change`.

## Dependencies

- `package.json`, `pnpm-lock.yaml`, `requirements.txt`, `Gemfile`, `go.mod`, `Cargo.toml`, `pom.xml` with new top-level dependencies (not just version bumps).
- **Reason:** `new dependency`.

## Feature flags

- Any addition under `**/flags/**`, `**/features/**`, or matching `featureFlag`, `launchDarkly`, `split.io`.
- **Reason:** `feature flag`.

## UI entry points

- New routes in frontend routers: `**/router.ts`, `**/routes.tsx`, `pages/**`, `app/**/page.tsx`.
- **Reason:** `new UI route`.

## Heuristic interaction rules

- A file can match multiple heuristics — concatenate reasons.
- If a file matches a heuristic AND has `lines_added < 5`, still mark must-show but flag `suggested_window_expansion: true` so the curator widens the window to include surrounding context.
- A test file (`*.test.*`, `*.spec.*`, `__tests__/**`) matching a heuristic is downgraded to `interesting_score: 0.5` unless the test file itself is the only mention (e.g., new test for a new auth rule).

## What NOT to must-show

- Pure formatting/whitespace changes.
- Lockfile-only changes (the `package.json` bump is the signal, not the lockfile).
- Generated files (detect by common patterns: `**/generated/**`, `*.gen.ts`, files with `@generated` header).
- `.gitignore`, editor configs, commit hooks.
