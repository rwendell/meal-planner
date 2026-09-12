# Google OAuth setup (later)

The app currently identifies household members with invite codes — no
passwords, no accounts. When you're ready for real Google sign-in, the
seam is small on purpose:

- Every server function takes `householdId` / `memberId` explicitly.
- The client keeps exactly one identity object: `{ householdId, memberId }`
  in `src/lib/session.svelte.ts`, populated by onboarding today.
- To switch to OAuth, that object gets populated from the Convex Auth
  session instead of localStorage, and `memberId` resolves from the
  authenticated user rather than the join form.

## Steps

1. Install the Convex Auth component:

   ```sh
   aube add @convex-dev/auth
   ```

2. In the [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project (or reuse one) and configure the OAuth consent
     screen (External, your email as test user is enough to start).
   - Create Credentials → OAuth client ID (Web application).
   - Authorized redirect URI: `https://<your-deployment>.convex.site/api/auth/callback/google`
     (use the dev deployment URL first; add the prod URL later).
   - Note the client ID and client secret.

3. Store them on each deployment (never commit them):

   ```sh
   npx convex env set CONVEX_AUTH_GOOGLE_ID "<id>" --deployment-name dev
   npx convex env set CONVEX_AUTH_GOOGLE_SECRET "<secret>" --deployment-name dev
   ```

4. Add `src/convex/auth.config.ts`:

   ```ts
   export default {
     providers: [
       {
         domain: "https://accounts.google.com",
         applicationID: process.env.CONVEX_AUTH_GOOGLE_ID!,
       },
     ],
   };
   ```

   Follow the [@convex-dev/auth Svelte setup](https://labs.convex.dev/auth)
   (`convex/auth.ts` with Google provider, `ConvexProviderWithAuth` via
   `convex-svelte` auth helpers) for the client wiring.

5. Link auth to households: on first sign-in, look up a member by the
   Google subject (`ctx.auth.getUserIdentity()`); if none exists, run the
   existing join/create flow once and store the subject on the member row.
   After that, `memberId` comes from the session and the invite form is
   only needed for joining additional households.

## Notes

- Keep invite codes working alongside OAuth — they're still the way new
  family members join a household, and they work without any account.
- OAuth tokens must never go in function arguments; always derive identity
  server-side via `ctx.auth.getUserIdentity()`.
- After switching, delete the auto-provision effect in
  `src/routes/+layout.svelte` (first-visit household creation) since
  anonymous provisioning no longer makes sense.
