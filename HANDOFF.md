Sherlock v0.1 — status (2026-09-27)

Branch v0.1-validation. Everything below was verified on Windows 11 / Node 22.

Verified
- npm install, npm test (34 tests: model, CLI loop, server API, workspace paths, PDF, real-PRD extraction).
- npm run build: Next.js static export into apps/editor/out. The earlier Bun fallback bundle is gone.
- CLI server: static assets with immutable caching, 404 for missing assets, SPA fallback, JSON API, SSE live reload;
  next dev proxies /api (including SSE) to it.
- Full CLI flow on Windows: analyze → create → open (detached, reused, opens the browser) → inspect/show →
  feedback/poll → update --resolve → resolve → stop → eval. Writes survive a watching server under load.
- /sherlock run on the Grants PRD from a scratch project (E:\Users\Gary\Projects\sherlock-scratch\grants):
  145 requirements, 168 tests, 49 gaps, traceability 100%, golden 53/53.
- Browser pass (Chrome via Playwright), light at 1440px and dark at 1280px, including the live feedback loop.
  Screenshots are in sherlock-scratch/screenshots.

Known issues / next
- npm audit flags the postcss bundled inside next@15 (build-time only). Fixing it needs next@16.
- Arrows in Hebrew item titles read backwards. SKILL.md now warns about it; the editor doesn't rewrite content.
- Title detection for PDFs: a PDF has no title style, so the first lines land in a "Preamble" section.
