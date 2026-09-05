# Architecture

How the code is laid out and why. The design decisions behind it live in the
design doc; this file is about the implementation.

## Packages

```
packages/core     Domain logic. No I/O, no framework, no secrets.
packages/server   HTTP API + MCP connector + repositories. Owns every secret.
apps/mobile       Expo app. Talks only to packages/server.
supabase/         Migrations and seed data.
```

`@awe/core` is deliberately dependency-light (Zod only) and side-effect free, so
every rule about tiers, calibration, meal types and totals is unit-testable
without a database, a network or a device. The interesting logic lives there:

- `tiers.ts` — a tier is a property of the **data source**, not something a
  caller can assert. `tierForSource()` is the only way to get one.
- `nutrition.ts` — all arithmetic, including `macroConsistency()`, which flags
  rows whose stated calories contradict their macros (bad label data, or a model
  that made something up).
- `calibration.ts` — the per-dish correction factor, as a geometric mean of
  `ln(corrected / original)`. Clamped to 0.5–2.0 so one wild correction can't
  distort a dish permanently.
- `vision.ts` — the vision prompt and the deterministic application of a user's
  answers to the model's components.
- `day.ts` / `usual.ts` — the Today and Week views, and the "your usual?" rule.

## Two clients, two purposes

`packages/server/src/supabase.ts` exposes exactly two clients:

- **`createUserClient(config, token)`** — carries the caller's JWT, so RLS
  applies. This is the default for anything serving a request from the app.
- **`getAdminClient(config)`** — service role, bypasses RLS. Only for the shared
  food tables and for the OAuth tables, which have no per-user scope.

MCP callers are the awkward case: we hold no Supabase session for them, so RLS
can't scope their queries. `http/context.ts` wraps the admin client in a proxy
that forces `.eq("user_id", …)` onto every select, update and delete against a
user-owned table. That's belt and braces: a forgotten filter becomes impossible
rather than merely unlikely.

## One write path

`MealService` is the only thing that creates a meal row. The REST API and the
MCP tools both go through it, which is why a meal logged by talking to Claude
and one logged in the app get identical treatment — same tier rules, same
inferred meal type, same calibration.

Totals are always computed server-side from components. Claude is asked for
weights and per-100 g profiles, never for a total, so no number in the database
originates from a model's arithmetic.

## Adding a nutrition source

1. Write an adapter in `packages/core/src/sources/` that maps the source's
   response to `Food`. Return `null` rather than a row with no usable energy
   figure — a confident zero is worse than nothing.
2. Add a fixture and tests. **Never** hit the live service from a test.
3. Wire it into `resolveFood()`, keeping the precedence rule: our own
   corrections always beat a third-party row.

Before enabling any live source, check its terms and whether it publishes the
data at all. If a source blocks automated access, document the limitation
instead of working around it.

## Migrations

Sequentially numbered in `supabase/migrations/`. RLS is enabled on every table
with no exceptions; public data gets a narrow explicit policy, and the OAuth
tables get RLS with **zero** policies so they're unreachable except by the
service role.

Since no Supabase project exists yet, migrations may still be edited in place.
Once one exists and has run them, switch to append-only.

## Testing

```bash
npm test        # vitest, both packages
npm run typecheck
```

`@awe/core` runs with `exactOptionalPropertyTypes`. The server package turns it
off: Express, the MCP SDK and the Anthropic SDK all model optional properties as
`T | undefined`, so it produced noise at every integration point without
catching anything in our own code.

The server suite includes `app.test.ts`, which boots the real Express app on an
ephemeral port and checks the endpoints that must work before anyone can
connect: health, both OAuth discovery documents, and that unauthenticated MCP
calls are refused with a `WWW-Authenticate` header pointing at the metadata.
