# Hosting the frontend

The app is fully client-side (Convex backend already lives in the
cloud), so the frontend ships as static files: `aube run build` writes
`build/` with a `200.html` SPA fallback. Host it anywhere static;
deep links and the `/meals` redirect resolve client-side.

## Recommended: Vercel

1. Import the repo. Framework Preset: `Other` (we ship pure static).
   Install Command: `bun install` (npm fails to resolve deps here);
   Build Command: `npm run build`; Output Directory: `build`.
2. Environment (all deployments): `PUBLIC_CONVEX_URL` =
   `https://fantastic-lynx-682.convex.cloud` (baked in at build time).
3. SPA fallback: add `vercel.json` at the repo root so deep links
   serve the shell (Vercel does not do this by default for static
   output):

   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/200.html" }] }
   ```

4. OAuth: point the Convex deployment at the hosted URL (Google
   needs no changes — the callback stays on convex.site).
   Sign-in works from any origin listed in `ALLOWED_ORIGINS`
   (comma-separated exact origins) or matching
   `ALLOWED_ORIGIN_SUFFIXES` (e.g. `.vercel.app` covers all PR
   previews):

   ```sh
   npx convex env set SITE_URL https://<your-app>.vercel.app
   npx convex env set ALLOWED_ORIGINS http://localhost:5173,https://<your-app>.vercel.app
   npx convex env set ALLOWED_ORIGIN_SUFFIXES .vercel.app
   ```
   The client returns to `window.location.href` after login, so each
   origin lands back where it started. See `OAUTH_SETUP.md` for the
   trust model.

## Caveats

- **Preview URLs just work** once the suffix rule is set — no per-PR
  env changes. Without a suffix rule, previews stay anonymous-mode
  (`Invalid redirectTo` fails closed).
- **`SITE_URL` itself stays single-valued** (default return target);
  the allowlist is what multi-enables origins, so no more flipping
  back and forth for laptop dev.
- **Subpaths break asset URLs.** The build uses absolute `/_app/...`

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
