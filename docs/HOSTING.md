# Hosting the frontend

The app is fully client-side (Convex backend already lives in the
cloud), so the frontend ships as static files: `aube run build` writes
`build/` with a `200.html` SPA fallback. Host it anywhere static;
deep links and the `/meals` redirect resolve client-side.

## Recommended: Vercel

1. Import the repo. Framework preset can stay automatic; set:
   - Build command: `npm run build` (plain `vite build`, no aube needed)
   - Output directory: `build`
2. Environment (all deployments): `PUBLIC_CONVEX_URL` =
   `https://fantastic-lynx-682.convex.cloud` (baked in at build time).
3. SPA fallback: add `vercel.json` at the repo root so deep links
   serve the shell (Vercel does not do this by default for static
   output):

   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/200.html" }] }
   ```

4. OAuth: flip the Convex deployment's return origin to the hosted URL
   (Google needs no changes — the callback stays on convex.site):

   ```sh
   npx convex env set SITE_URL https://<your-app>.vercel.app
   ```

## Caveats

- **One origin at a time.** `SITE_URL` is single-valued: sign-in works
  only from the matching origin. PR preview deployments get unique
  URLs, so Google sign-in there fails closed (`Invalid redirectTo`) —
  previews are anonymous-mode only unless you flip `SITE_URL` to them.
  Flip back to `http://localhost:5173` for laptop dev.
- **Subpaths break asset URLs.** The build uses absolute `/_app/...`
  paths. Root hosting (Vercel/Cloudflare/Render defaults) is fine;
  project-site subpaths (e.g. `user.github.io/repo/`) need a
  `paths.base` setting — prefer root hosting instead.
- **Which backend?** Above points the hosted frontend at the dev
  deployment (same data you test with). A separate prod deployment
  (own `SITE_URL`, own Google client) is the later step — see
  `OAUTH_SETUP.md` follow-up #3.

Cloudflare Pages, Render static, and GH Pages all work with the same
`build/` output; only the SPA-rewrite mechanism differs (Cloudflare:
Pages Rules / Functions fallback; Render: rewrite rule to
`/200.html`; GH Pages: root hosting only, no server rewrites — use
the `404.html` copy trick or prefer another host).
