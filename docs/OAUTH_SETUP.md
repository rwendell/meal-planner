# Google OAuth (implemented)

Sign-in runs through [@convex-dev/auth](https://labs.convex.dev/auth)
(Google provider) with the community SvelteKit adapter
`@mmailaender/convex-auth-svelte`. Invite codes keep working alongside —
they're still how new family members join, and anonymous use is unchanged.

## How identity flows

- `householdMembers.authSubject` holds the Convex Auth **user ID**
  (the `users` row ID). Never `tokenIdentifier` — it embeds the session
  ID (`iss|userId|sessionId`) and rotates every sign-in. Legacy
  tokenIdentifier links are recognized by their middle segment and
  rewritten on next touch (`linkMatches` in `authCheck.ts`).
- `src/convex/authCheck.ts` is the trust boundary:
  - `assertCaller` (queries): rejects caller rows linked to a *different*
    sign-in; anonymous callers pass through as before.
  - `assertCallerMutation` (mutations): same, plus auto-links an
    unclaimed caller row to the signer.
- `create` / `join` stamp new member rows via `linkNewMember`, so the
  creator becomes owner-linked and joiners link at join time.
- `myMemberships` returns every membership for the signer; the layout
  reconciles them into the local roster (all kitchens survive a new
  device, not just the active one).
- `claimHouseholds` is the one-time migration: links this device's roster
  rows to the sign-in. Rows claimed by someone else count as skipped.
- `authProfile` exposes the signer's email/name for the account UI.
- Enforced (caller verified + auto-linked): all `households.ts`
  mutations, `plans.setSlot` / `plans.clearDay`, `plans.applyList`.
- NOT yet enforced: `meals`, `shopping`, `recipes` mutations take no
  caller at all (household-scoped, as before). See follow-ups.

## Names and pictures

- Anonymous members get a stable per-browser `{Adjective} {Produce}`
  name (`src/lib/anon-names.ts`, e.g. "Sunny Tomato") via
  `deviceName()` in `session.svelte.ts`, instead of "Me".
- `householdMembers` carries `image` (Google picture URL) and
  `autoNamed` (true while the name is auto-generated).
- On link (`linkNewMember`, `claimHouseholds`, caller auto-link) the
  member's picture refreshes from the `users` table (via
  `getAuthUserId` — session JWTs carry only `sub`, never profile
  claims), and an auto-generated name is replaced once by the stored
  OAuth name (then frozen; explicit renames via `renameMember` clear
  `autoNamed`).
- `MemberAvatar` renders the picture when present, initials otherwise.

## Client wiring (client-only)

Deliberately no SvelteKit server auth: no `hooks.server.ts`, no
`+layout.server.ts`. The `/sveltekit` adapter entry hammered
`invalidateAll()` on every token change and added a Convex roundtrip to
every page load, which froze the UI after sign-in. Instead:

- `src/routes/+layout.svelte` — `setupConvexAuth({ convexUrl })` from
  `@mmailaender/convex-auth-svelte/svelte` reuses the existing
  `setupConvex()` client and talks to the `auth:signIn` / `auth:signOut`
  Convex actions directly; tokens live in namespaced localStorage.
  Memberships reconcile into the roster; the claim runs once per
  sign-in; auto-provision waits for auth and only creates a kitchen
  when the signer has no memberships anywhere.
- Profile page `Account` card — Sign in with Google / sign-out + address.

## Backend files

- `src/convex/auth.config.ts` — `{ domain: CONVEX_SITE_URL,
  applicationID: "convex" }` (this SITE_URL form is required; a Google
  domain here is wrong for Convex Auth).
- `src/convex/auth.ts` — `convexAuth({ providers: [Google] })`.
- `src/convex/http.ts` — `auth.addHttpRoutes(http)` → callback at
  `<site-url>/api/auth/callback/google`.
- `src/convex/schema.ts` — `...authTables` plus `authSubject` +
  `by_authSubject` on `householdMembers`.

## Env vars (dev `fantastic-lynx-682` — already set)

| var | value |
|---|---|
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google Cloud OAuth web client |
| `SITE_URL` | `http://localhost:5173` (dev) |
| `JWT_PRIVATE_KEY` / `JWKS` | headless `jose` RS256 pair |

Google redirect URI (dev):
`https://fantastic-lynx-682.convex.site/api/auth/callback/google`

Backups (age-encrypted, never committed):
`~/.secrets/meal-planner-google-id.age`,
`~/.secrets/meal-planner-google-secret.age`
(`secret-get meal-planner-google-secret` to read).

## Local network testing (e.g. phone on same Wi-Fi)

No new infra: the backend is already cloud, and `aube run dev:host`
exposes Vite on the LAN. Google needs no changes — the OAuth
`redirect_uri` is the convex.site callback (origin-independent); only
the post-login return to the app is origin-bound, via single-valued
`SITE_URL` (prefix-matched, so it must equal the exact origin):

```sh
aube run dev:host
hostname -I  # pick the LAN IP, e.g. 192.168.1.20
npx convex env set SITE_URL http://192.168.1.20:5173
```

Open the LAN URL on the device. Flip back for laptop-only dev:

```sh
npx convex env set SITE_URL http://localhost:5173
```

One origin at a time: while set to the LAN IP, sign-in from
localhost (and vice versa) fails closed with `Invalid redirectTo`.

## Follow-ups

1. **Phase B cutover:** drop `callerMemberId` args and derive the caller
   purely from `ctx.auth` (keeping an anonymous path while invite codes
   exist).
2. **Household-scoped writes:** `meals` / `shopping` / `recipes`
   mutations identify no caller — add membership checks when Phase B
   lands.
3. **Prod:** separate Google OAuth client with the prod `.site` callback,
   prod `SITE_URL`, and the same `npx convex env set` vars with
   `--deployment-name prod`.
4. Tokens must never go in function arguments; always derive identity
   server-side via `ctx.auth.getUserIdentity()`.
