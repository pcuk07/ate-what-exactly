# Getting awe running end to end

The first time anything here touches a real backend. Expect a couple of the
steps below to bite — that's normal, and each one names the symptom so you can
tell which is which.

You need: Node 22+, an Anthropic API key with credit on it, a Supabase project,
and a Mac with Xcode (or a phone with Expo Go, with the caveat in step 8).

---

## 1. Check the project's region

**Dashboard → Project Settings → General → Region.**

It needs to be an EU region — `eu-west-1` (Ireland) or `eu-central-1`
(Frankfurt). The design assumes EU residency for GDPR (design doc §10.1), and a
Supabase project's region **cannot be changed after creation**. If it's in the
US, recreate the project now: it costs nothing today and is painful once there
is real data in it.

## 2. Apply the schema

**Dashboard → SQL Editor → New query.**

Run these two files, in order, as two separate queries:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_account_deletion.sql`

**These are not idempotent.** `create policy` fails if the policy already
exists, so if a run stops halfway, don't just re-run the whole file — note
where it stopped.

Check it worked:

- **Table Editor** lists `foods`, `restaurant_items`, `goals`, `recipes`,
  `meals`, `calibrations`, `corrections`, and three `oauth_*` tables.
- **Storage** lists a `meal-photos` bucket, marked **private**.

> If the `storage.objects` policies fail with a permissions error, create them
> instead under **Storage → Policies** on the `meal-photos` bucket: allow
> `select`, `insert` and `delete` to authenticated users where
> `(storage.foldername(name))[1] = auth.uid()::text`. That expression is the
> whole point — it's what keeps one person's photos out of another's reach.

## 3. Make the sign-in email send a *code*, not a link

**This one will definitely bite you if you skip it.**

The app asks for a six-digit code, but Supabase's default magic-link email
sends only a link. Go to **Authentication → Email Templates → Magic Link** and
make sure the template includes the token:

```html
<p>Your awe sign-in code is: <strong>{{ .Token }}</strong></p>
```

Also confirm **Authentication → Providers → Email** is enabled.

*Symptom if skipped:* the email arrives, but contains no code to type.

## 4. Collect the keys

**Dashboard → Project Settings → API.** You need the Project URL, the `anon`
public key, and the `service_role` key.

The `service_role` key bypasses RLS. It belongs only in the server's `.env`,
never in the app, never in git. `.gitignore` already excludes `.env`.

## 5. Server environment

Create `.env` in the repository root:

```bash
NODE_ENV=development
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080

SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>

ANTHROPIC_API_KEY=<your key>
VISION_MODEL=claude-opus-5

# openssl rand -base64 48
MCP_TOKEN_SECRET=<48+ random characters>

OFF_USER_AGENT=awe/0.1 (you@example.com)
```

The server refuses to start if any of these is missing or malformed — that's
deliberate, so a misconfiguration fails at boot rather than at 3 a.m.

## 6. App environment

Create `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8080
EXPO_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

> **On a physical phone, `localhost` is the phone itself, not your Mac.** Use
> your machine's LAN address instead — `http://192.168.1.42:8080` — and make
> sure both are on the same Wi-Fi.
>
> *Symptom if skipped:* sign-in works (that goes straight to Supabase) but
> every screen fails to load, because those calls go through your server.

## 7. Start the server

```bash
npm install
npm run build -w packages/core   # the server and app depend on its emitted types
npm run dev:server
```

Check it: `curl localhost:8080/health` → `{"status":"ok","version":"0.1.0"}`

## 8. Run the app

```bash
npm run dev:mobile
```

**Expo Go is fine for the main flow** — camera, barcode scanning, secure
storage and photo logging all work there. **Sign in with Apple needs a
development build**, because it requires an entitlement Expo Go can't grant.
Use the email code in Expo Go, or build properly:

```bash
npx expo run:ios      # needs a Mac with Xcode
```

## 9. Walk the whole thing

In this order, because each step depends on the last:

1. **Sign in** — enter your email, then the code from the email.
   *Proves:* Supabase auth, the Keychain session store, the auth gate.
2. **Scan a barcode** on any packaged food, adjust the weight, log it.
   *Proves:* Open Food Facts, the food cache, RLS on `meals`. Costs nothing.
3. **Photograph a meal** and accept the consent sheet.
   *Proves:* image resizing, Storage upload, the Anthropic vision call, and the
   clarifying-question flow. This is the only step that costs money — about 3¢.
4. **Open the entry, change the calories, save.**
   *Proves:* the correction loop and per-dish calibration.
5. **Photograph the same dish again** and see whether the estimate has moved
   toward your correction. *Proves:* calibration is actually feeding back.
6. **Delete the entry**, and hit Undo before the toast disappears.
7. **Check the weekly view**, then **Goals → Account & privacy**.

## What will probably break first

In rough order of likelihood:

| Symptom | Cause |
|---|---|
| Email arrives with no code | Step 3 — the template has no `{{ .Token }}` |
| Sign-in works, every screen fails | Step 6 — `localhost` on a physical device |
| Photo logs but no image on the entry | Storage policies from step 2 |
| Vision call returns a 502 | No credit on the Anthropic key, or a wrong model id |
| Server won't boot | A missing `.env` value — the error names which one |

None of this has ever been run. When something fails, the useful thing to send
back is the **exact error text** plus which step it was — that's enough to fix
it without guessing.
