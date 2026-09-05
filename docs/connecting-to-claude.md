# Connecting the diary to Claude

The MCP connector lets someone log meals and ask about their diary from their
own Claude, without opening the app. This is what that involves.

## What Claude can do once connected

| Tool | What it does |
|---|---|
| `get_daily_totals` | A day's entries grouped by meal, with totals and what's left |
| `get_week` | Seven days of calories against the goal, plus the average |
| `get_history` | Recent entries, newest first, with tiers |
| `lookup_barcode` | Nutrition for a barcode, without logging it |
| `log_barcode_meal` | Logs a scanned product at a given weight (Tier A) |
| `log_meal` | Logs a described meal with your own estimate (Tier D) |
| `correct_entry` | Fixes a past entry and teaches the app about that dish |
| `get_goals` | The daily targets and whether flexible days are on |
| `suggest_usual` | The habitual meal for a time of day |

Photo estimation deliberately isn't here: it belongs in the app, where the
consent and the resizing happen.

The server's `instructions` tell the connecting Claude what the tiers mean and
ask it not to present a Tier D estimate as a precise figure. Tool descriptions
are written for a stranger's session, not for us.

## Wearables are not our job

If someone has both this connector and a Whoop connector in their Claude, they
can already ask questions spanning both in one conversation. We never touch
Whoop's API to make that work — building our own integration would duplicate
what connector composition does for free.

## The OAuth flow

Supabase Auth identifies people inside our app, but it is not an OAuth
authorization server that a third party can register against. So the server
implements a small one:

```
Claude                          Our server                    Supabase
  │  GET /.well-known/oauth-protected-resource
  │ ─────────────────────────────→ │
  │  POST /oauth/register (DCR)    │
  │ ─────────────────────────────→ │  stores client + redirect URIs
  │  GET /oauth/authorize + PKCE   │
  │ ─────────────────────────────→ │  consent screen
  │                                │ ──── sign in ──────────────→ │
  │  ← redirect with code          │
  │  POST /oauth/token + verifier  │
  │ ─────────────────────────────→ │  checks PKCE, issues tokens
  │  POST /mcp with Bearer token   │
  │ ─────────────────────────────→ │  scoped to that user's rows
```

Decisions worth knowing:

- **PKCE with S256 is mandatory.** `plain` is rejected outright.
- **Redirect URIs match exactly.** The one exception is loopback addresses,
  where the port may vary because native clients pick one at random — the host,
  scheme and path must still match.
- **An unrecognised redirect URI is never redirected to.** The error is shown in
  place, so a mistyped registration can't become an open redirect.
- **Authorization codes are single-use and live 60 seconds.** Consuming one
  deletes it, so a replay finds nothing.
- **Refresh tokens rotate.** Each belongs to a family; presenting an already-used
  token revokes the whole family, on the assumption it was stolen.
- **Access tokens last an hour** and carry `diary:read` / `diary:write` scopes.

## Transport

Streamable HTTP, stateless: each request builds a server bound to the caller's
identity, so one person's connector can never observe another's session. There's
no SSE stream to resume, so `GET` and `DELETE` on `/mcp` return 405.

## Testing it locally

```bash
npm run dev:server
curl -s localhost:8080/.well-known/oauth-authorization-server | jq
# An unauthenticated call should 401 with a WWW-Authenticate header:
curl -i -X POST localhost:8080/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Both are covered by `packages/server/src/__tests__/app.test.ts`.

## Not verified yet

The flow above is implemented and unit-tested, but **no MCP client has actually
connected to it**. Before trusting it, run through a real connection from Claude
and confirm: discovery, registration, the consent screen, the code exchange, a
`tools/list`, and one round of token refresh.
