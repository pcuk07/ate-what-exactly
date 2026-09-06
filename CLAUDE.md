# CLAUDE.md — working on awe

Read this before changing anything. `README.md` says what the product is;
this says how to work on it and which rules are not negotiable.

## What this is

**awe** (Ate What Exactly) is a food diary whose distinguishing idea is that
**every entry records how confident it is**. Photo apps guess and present the
guess as fact; barcode apps are exact until food has no wrapper. awe does both
and never blurs the difference.

## The rules that matter most

These are the ones that took judgement to get right. Breaking them silently
undoes the product.

1. **A tier is derived from the data source, never asserted by a caller.**
   `tierForSource()` in `packages/core/src/tiers.ts` is the only way to get one.
   A = label data, B = weighed, C = published menu data, D = estimated.
2. **A correction never promotes a tier.** Correcting a photo guess leaves it a
   photo guess. Repeating a meal inherits its tier, because the evidence is
   unchanged.
3. **Totals are computed server-side from components.** Claude is asked for
   weights and per-100 g profiles, never for a total. No number in the database
   originates from a model's arithmetic.
4. **Never invent data to make something look finished.** If macros aren't
   known, they stay zero — not plausible-looking guesses. If credentials are
   needed (Apple Team ID, `.p8` keys), document what's required rather than
   writing placeholder code that fails at review. See `docs/app-store.md`.
5. **Only photo estimation costs money.** Barcode, recipe, manual and repeat
   logging never call the Anthropic API. Guard the vision path, not the others.
6. **Say what isn't done.** `README.md` has a "Not done yet" section. Keep it
   truthful — including that no screen has ever run on a device.

## Layout

```
packages/core     Domain logic. No I/O, no framework, no secrets. Zod only.
packages/server   REST API + MCP connector + repositories. Owns every secret.
apps/mobile       Expo app. Talks only to packages/server (and Supabase auth/storage).
supabase/         Migrations. RLS on every table, no exceptions.
```

`MealService` is the single write path. The app's REST API and the MCP tools
both go through it, so a meal logged by talking to Claude and one logged in the
app are treated identically.

## Conventions

- Domain types are camelCase; database columns are snake_case. The mappers in
  `packages/server/src/repositories/mappers.ts` are the only translation point.
- `@awe/core` runs with `exactOptionalPropertyTypes`. The server turns it off —
  Express, the MCP SDK and the Anthropic SDK all model optionals as
  `T | undefined`, which produced noise without catching real bugs.
- Copy is calm and specific. Errors say what happened and what to do next.
  Nothing is a "failure"; going over a calorie goal is amber, never red,
  because red means error.
- Destructive actions use an Undo toast, not a confirmation dialog. The one
  exception is account deletion, which is irreversible so there is nothing to
  undo — that gets a typed confirmation.

## Checks

```bash
npm install
npm run build -w packages/core   # server and app depend on its emitted types
npm test                         # 153 tests
npm run typecheck                # all three packages, including the Expo app
```

Tests never touch a live third-party service. Open Food Facts and Claude are
exercised through fixtures in `packages/core/fixtures/`. Keep it that way.

The mobile app has no test runner; its safety net is `tsc` against real Expo
types, which has already caught genuine bugs (a wrong import, invalid style
types). Don't skip it.

## Where things stand

Built and tested: the engine, REST API, MCP connector with OAuth, schema, and
an app covering sign-in, photo and barcode logging, recipes, corrections, the
weekly view, goals and account deletion.

**Never run against a real backend.** No Supabase project exists, so no
sign-in has succeeded, no photo has been uploaded, and no vision call has been
made. That's the next milestone, and it will surface things — first contact
with a real backend always does.

Also outstanding: Apple token revocation on delete, a real privacy policy URL,
and the Live Activities / widgets work from the design doc's §7.8, which
depends on alpha Expo packages that need a spike first.
