# Sherlock — local AI QA workspace for Claude Code

```
/sherlock PRD-Grants-Module.docx
```

Claude reads the PRD and builds a structured, traceable QA model: requirements, screens,
flows, validations, test cases and gaps. Sherlock then opens it as an interactive QA
workspace in your browser. The QA reviews it and leaves feedback; Claude applies the
feedback, and the page refreshes live.

**Claude is the intelligence. Sherlock is the workspace and the agent interface.**

## Setup

```bash
npm install          # workspaces: cli, editor, qa-model
npm run build        # builds the editor (Next.js static export → apps/editor/out)
npm run setup        # installs the Claude Code skill to ~/.claude/skills/sherlock
                     # (use `node apps/cli/bin/sherlock.js setup --project` for ./.claude/skills)
```

Then, in any project in Claude Code: `/sherlock path/to/prd.docx`.

Optional: run `npm link -w @sherlock/cli` to put `sherlock` on your PATH.

## How it works

```
PRD (.docx/.pdf/.md)
  │  sherlock analyze   → .sherlock/prd.md   (sections anchored [§3.8], [§9.3/4] …)
  ▼
Claude (skill)          → reads prd.md, reasons as a QA engineer, writes model JSON
  │  sherlock create    → validates structure, links and every quoted PRD excerpt
  ▼
.sherlock/model.json    ← source of truth
  │  sherlock open      → local server (JSON API + live reload) + browser
  ▼
Editor (Next.js)        → overview, lists, inspector, PRD source view, feedback
  │  QA feedback        → .sherlock/feedback.json
  ▼
sherlock poll/feedback  → Claude patches the model: sherlock update patch.json --resolve FB-001
```

| Part | Path | Responsibility |
|---|---|---|
| Skill | `skills/sherlock/SKILL.md` | Teaches Claude the loop, the model format and the provenance rules |
| CLI (AXI) | `apps/cli` | PRD extraction, validation, storage, local server, feedback. Output is compact and agent-first |
| Editor | `apps/editor` | Renders the model. It has no QA logic |
| QA model | `packages/qa-model` | Schema, validation, traceability graph, coverage, provenance checks, patches, golden eval |

### Workspace (`.sherlock/`, next to where you run Claude)

`prd.md` / `prd.json` (extracted PRD) · `model.json` (the QA model) · `feedback.json` ·
`project.json` (revision and change log) · `history/` (previous revisions) · `server.json`

## CLI

```
sherlock analyze <prd>                 extract PRD → .sherlock/prd.md
sherlock create <model.json>           validate + install the first model
sherlock update <model|patch> [--resolve FB-1 --note "…"]
sherlock validate [file]               dry run
sherlock inspect | show <ID…>          compact status / one entity with links and sources
sherlock open [--focus ID] | stop      local server + browser
sherlock feedback | poll | resolve     QA feedback loop
sherlock eval <golden.json> [model]    regression: concept recall against a golden QA guide
```

Every command supports `--json`. Exit codes: 0 ok · 1 usage · 2 invalid · 3 not found · 4 server · 5 extraction.

## Trust features

- **Classification**: every item is `explicit`, `derived`, `inferred` or `ambiguous`. An ambiguous item must link to a gap.
- **Verified provenance**: every quoted excerpt is checked against the PRD text, including Hebrew and other RTL text,
  tables and headings. Items whose quote can't be found are flagged in the UI and in the CLI.
- **Coverage**: a requirement is *covered* when it has tests and every validation and rule linked to it is tested.
  It is *partial* when some of those have no test, and *uncovered* when it has no tests at all.

## Golden fixture

`fixtures/grants/` holds the real Grants Module PRD (Hebrew .docx) and its human-written QA
Guide. `golden.json` lists the QA concepts the guide covers. After Claude generates a model:

```bash
sherlock eval fixtures/grants/golden.json    # GOLDEN PASS at ≥ 85% concept recall
```

`npm test` covers the model logic, the CLI loop, and extraction and provenance on the real PRD.

## Editor development

```bash
sherlock open --no-browser         # in a project with a .sherlock workspace (serves the API on :4870)
npm run dev:editor                 # Next dev on :4871, proxies /api to :4870
```
