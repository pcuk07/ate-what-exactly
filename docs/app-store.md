# Shipping to the App Store

What's done, and what still needs a human with an Apple Developer account.
Guideline numbers refer to the App Review Guidelines.

## Done in code

| Requirement | Where |
|---|---|
| **5.1.1(v)** In-app account deletion | `apps/mobile/app/account.tsx` calls the `delete_my_account` function from `supabase/migrations/0002_account_deletion.sql`, which removes photos, diary, calibrations, recipes, goals and every OAuth grant in one transaction |
| **5.1.2(i)** Third-party AI consent | `ConsentSheet` names Anthropic explicitly, says what is sent, and appears before the first photo ever leaves the device. Declining leaves barcode and weighed logging fully usable |
| **1.4.1 / 5.1.3** No medical claims | Every number is an estimate in copy and in form; tiers are stated in words, and a corrected estimate is never promoted to a measurement |
| Purpose strings | `NSCameraUsageDescription`, `NSFaceIDUsageDescription` in `app.json`, written for a person rather than a reviewer |
| Privacy manifest | `ios.privacyManifests` in `app.json` — required-reason APIs plus the collected data types |
| Export compliance | `usesNonExemptEncryption: false` — only OS TLS and Keychain, no custom cryptography |
| **4.8** Sign in with Apple | `AppleSignInButton` uses Apple's own system button and hands the identity token to Supabase |
| ATS | No arbitrary loads, no exceptions |
| Data protection | `com.apple.developer.default-data-protection` entitlement, so cached files are unreadable while the phone is locked |

## Still needs you

These cannot be finished from code alone.

### 1. Apple token revocation on account deletion

Apple requires that deleting an account also revokes the Apple sign-in token.
This is **not implemented**, deliberately: it needs a server-side call to
Apple's `/auth/revoke` endpoint signed with a JWT built from your Team ID, a
Key ID and a `.p8` private key. Those are credentials, not code, and inventing
placeholders would have produced something that looks finished and fails at
review.

What it needs:

1. Create a Sign in with Apple key in the Apple Developer portal; download the
   `.p8`.
2. Add `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID` and
   `APPLE_PRIVATE_KEY` to the server's environment.
3. Add a server endpoint that builds the client secret JWT (ES256, ≤ 6 months
   expiry) and POSTs the user's refresh token to
   `https://appleid.apple.com/auth/revoke`.
4. Call it from `account.tsx` *before* `delete_my_account`, so a failed
   revocation doesn't leave a deleted account with a live Apple grant.

Until this exists, submitting with Sign in with Apple enabled risks rejection.

### 2. Supabase Apple provider configuration

Sign in with Apple will fail until the Apple provider is enabled in the
Supabase dashboard with the same bundle identifier
(`app.atewhatexactly.ios`). The client code is correct; the provider is
configuration.

### 3. A privacy policy at a real URL

`account.tsx` links to `https://atewhatexactly.app/privacy`, which does not
exist yet. App Store Connect requires a reachable privacy policy URL, and it
must describe the Anthropic transfer described in `ConsentSheet`.

### 4. Privacy nutrition labels in App Store Connect

Declare, all "linked to you" and none used for tracking:

- Health & Fitness (the diary)
- Photos (meal photos)
- Contact Info — email address
- User Content

These must match what the backend actually does. A mismatch is both a
rejection and, later, a complaint.

### 5. A reviewer demo account

Signup is invite-gated, so App Review needs a working account in the review
notes that bypasses the gate — and it has to keep working across releases. A
rotated or expired reviewer login is a common, avoidable rejection.

### 6. Nothing has been run

No screen in this app has been launched on a device or simulator. Before any
submission, walk the whole flow on real hardware: sign in, photograph a meal,
answer the questions, correct the entry, delete it, delete the account.
