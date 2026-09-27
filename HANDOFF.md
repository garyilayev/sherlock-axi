Sherlock v0.1 — build status (2026-09-27)

Repo: E:\Users\Gary\Projects\sherlock-axi (monorepo: apps/cli, apps/editor, packages/qa-model, skills/sherlock, fixtures/grants).

Done
qa-model: schema, validation, traceability graph, coverage, provenance check (works on Unicode and RTL text; searches headings too), patch/diff, golden eval.
CLI (AXI): analyze, create, update (full model or patch, with --resolve/--note), validate, inspect, show, open, stop, feedback, poll, resolve, eval, setup. Compact output, NEXT hints, --json, exit codes.
The PRD extractor has no dependencies: .docx is read from the zip XML, .md is parsed, PDF uses pdfjs or pdftotext. It infers section numbering for messy PRDs: missing parents, stray numbers, duplicate numbers.
Local server: static editor + JSON API + SSE live reload. The editor refreshes and shows a toast when Claude updates the model.
Editor (Next.js static export): styled after Gary's mockup, with a dark header, light sidebar, overview metric cards, key features, recent updates, content breakdown, and an inspector with flow steps, related requirements, source and notes. Also: traceability tree, feedback threads, a PRD viewer that highlights excerpts and lists the items generated from each section, and RTL support.
Golden fixture: the real Hebrew Grants PRD plus the human QA Guide. golden.json holds 53 concepts with an 85% recall threshold. Per Gary, Claude does not pre-generate a Grants model.
Tests: 16 passing (node --test), including the real-PRD extraction tests.
Not verified
next build never ran, because npm was blocked in both sandboxes. The same components were bundled with Bun and checked end to end in Chromium. apps/editor/out contains that Bun build, so the editor works before a build.
Next ideas
Run /sherlock on the Grants PRD in Claude Code, then sherlock eval fixtures/grants/golden.json.
Tune golden.json terms once a real generated model exists.
