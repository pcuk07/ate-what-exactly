# awe

**Ate What Exactly.** A food diary that records **how confident each entry is**,
instead of presenting every number as a fact.

Photo-based calorie apps hallucinate portions. Barcode apps are accurate right
up until you eat something that didn't come in a wrapper — which is most
restaurant meals. This one does both, and is honest about the difference.

Every entry carries a tier:

| Tier | Source | Typical error |
|---|---|---|
| **A** | Barcode matched to label data | ±1–2 % |
| **B** | Home-cooked, ingredients weighed | ±2–5 % |
| **C** | Matched to a chain's published nutrition | ±5–15 % |
| **D** | Estimated from a photo or a description | ±15–30 % |

A ±30 % guess and a scanned yoghurt look different everywhere they appear, and
a correction never promotes a guess to a measurement.

## Status

**Pre-release.** The engine, the API, the MCP connector and the schema are built
and tested (150 tests). The app now signs in, logs by photo or barcode, saves
weighed recipes, and lets you correct an entry — but it has never been run
against a real Supabase project or on a device. See [Not done yet](#not-done-yet).

## How it works

```
 Expo app (iOS/Android) ─┐
                         ├─→ Node service layer ─→ Supabase (Postgres + Auth + Storage)
 Anyone's Claude ────────┘         │
   via remote MCP + OAuth          └─→ Claude API (vision) ─→ Open Food Facts
```

One service layer, two front doors. The app's REST API and the MCP tools call
the same functions, so a meal logged by talking to Claude and a meal logged in
the app take exactly the same path into the database.

### The three-tap flow

1. **Capture.** One camera surface — it recognises a barcode or a plate itself,
   so there's no mode to choose. A barcode skips straight to logging.
2. **One question.** Claude asks only what would move the number by ≥10 %
   ("half or all of it?"), as chips with the likeliest answer preselected.
3. **Logged.** With an Undo toast, not a confirmation dialog.

### The parts worth a look

| Where | What |
|---|---|
| `packages/core/src/calibration.ts` | Corrections teach the app per dish, using a geometric mean of past ratios. No ML, fully inspectable. |
| `packages/core/src/vision.ts` | Claude returns components and questions; **we** do the arithmetic, so totals are reproducible and the model can never hand us a number we didn't compute. |
| `packages/core/src/usual.ts` | "Your usual breakfast?" — deterministic, from your own last 30 days. |
| `packages/core/src/photos.ts` | A photo path must live in your own folder. Storage RLS guards the upload; this guards the *claim*, which RLS can't see. |
| `packages/server/src/auth/` | OAuth 2.1 with PKCE and refresh-token reuse detection, so other people can connect this to their own Claude. |
| `supabase/migrations/0001_initial_schema.sql` | RLS on every table; the OAuth tables have RLS with *zero* policies, so only the service role can reach them. |

## Running it

```bash
npm install
cp .env.example .env          # fill in Supabase + Anthropic keys
npm run build -w packages/core
npm run dev:server            # http://localhost:8080

# In another terminal, once EXPO_PUBLIC_API_URL points at the server:
npm run dev:mobile
```

Database:

```bash
supabase db push              # applies migrations in supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql   # local development only
```

## Checks

```bash
npm test          # 150 tests across core and server
npm run typecheck
```

Tests never touch a live third-party site: Open Food Facts and Claude are
exercised through fixtures in `packages/core/fixtures/`.

## Privacy, in short

The app ships no secrets — only the Supabase URL and anon key, both public by
design and guarded by RLS. Photos are downscaled to 1568 px on device, which
strips EXIF (a GPS tag in a food photo is a home address), and are never sent
anywhere until you've agreed to it on a screen that names Anthropic explicitly,
as App Store guideline 5.1.2(i) requires. The vision model is pinned to one
that's eligible for zero data retention. Sessions live in the Keychain, not
AsyncStorage. Account deletion removes photos, diary, calibrations and every
OAuth grant in one transaction.

## Not done yet

Being straight about what's built and what isn't:

- **The mobile app has never been run.** It's written against Expo SDK 54 APIs
  and typechecks against the real ones, but has not been installed, launched, or
  tested on a device or simulator. Every screen below is unproven in that sense.
- **No Supabase project exists**, so the migrations have never been applied, no
  sign-in has ever succeeded, and no photo has ever been uploaded. The
  repositories have only been exercised against in-memory fakes.
- **The vision call has never hit the real API.** `VisionService` is covered by
  its schema contract, not by a live request.
- **`restaurant_items` seed data is invented placeholder figures**, clearly
  marked. Real chain data has to be sourced one chain at a time, checking each
  publishes it and that their terms allow it.
- **Liquid Glass, Live Activities and widgets** from the design doc's §7.8 are
  designed but not implemented; they depend on alpha Expo packages that need a
  spike first.
- **Sign in with Apple is written but unverifiable here.** It needs the Apple
  provider enabled in Supabase and a device to run on. Crucially, **Apple token
  revocation on account deletion is deliberately not implemented** — it needs
  your Team ID, Key ID and `.p8` private key, and faking those would produce
  something that looks finished and fails at review. See
  [docs/app-store.md](docs/app-store.md).
- **No privacy policy exists** at the URL the app links to.

## The design doc

Everything here follows from a design document covering the accuracy model, the
UX system, and the App Store and GDPR requirements — including the parts that
were considered and rejected, and two places where the original brief had to be
pushed back on (a ±1–2 % accuracy target that isn't physically achievable from a
photo, and an assumption that Ireland mandates calorie posting, which it
doesn't).
