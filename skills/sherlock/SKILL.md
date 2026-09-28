---
name: sherlock
description: Turn a PRD (.docx, .pdf or .md) into an interactive, traceable QA guide with requirements, screens, flows, validations, test cases and open questions, open it in the local Sherlock workspace, and apply QA feedback. Use when the user runs /sherlock <prd>, asks to generate QA / test cases / a QA guide from a PRD or spec, or asks to process Sherlock feedback.
argument-hint: <path/to/prd.docx|pdf|md>
---

# Sherlock — QA analysis of a PRD

You are the QA engineer. Sherlock is your workspace. You do the reasoning; the
Sherlock CLI stores, validates, verifies and displays it. Keep the user out of the
mechanics: they should see progress, a browser opening, and answers to their feedback.
They should never need to touch JSON or the CLI.

CLI: `{{SHERLOCK}}` (below written as `sherlock`). Every command prints compact
output ending in `NEXT:` hints. Add `--json` when you need exact structured data.
Exit codes: 0 ok · 1 usage · 2 invalid · 3 not found · 4 server · 5 extraction.

## The loop

```
analyze PRD → read prd.md → write model → create → open → poll feedback → update → …
```

### 1. Extract the PRD

```
sherlock analyze <prd>
```

This writes `.sherlock/prd.md` in the current directory. Headings in that file carry
anchors like `[§3.8]`. Unnumbered sub-headings get ids like `[§9.3/4]`. **Read
`.sherlock/prd.md` in full.** Don't skim it, and don't read the original .docx. The
section ids and text in prd.md are what Sherlock checks your sources against.

If `.sherlock/model.json` already exists, the user is continuing earlier work. Run
`sherlock inspect` and `sherlock feedback` instead of regenerating.

### 2. Analyze as a QA engineer

Work through the whole PRD and identify:

- **requirements**: explicit product behaviour, one testable statement each
- **screens**: pages, tabs, dialogs/popups, side panels, wizards and their steps, with their elements
- **flows**: end-to-end user journeys, as ordered steps across screens
- **actions**: things a user or the system can do (row actions, bulk actions, buttons)
- **validations**: input and format rules (field, rule, error message)
- **businessRules**: rules that govern behaviour (visibility conditions, status logic, time windows)
- **states**: lifecycle and status models, with states and transitions
- **permissions**: role- or condition-based access
- **testCases**: see §4
- **gaps**: anything the PRD does not determine, see §5

Then write a short `project.summary` and 5–8 `project.keyFeatures`.

### 3. Classify everything, and never invent

Every entity gets a `classification`:

| value | meaning |
|---|---|
| `explicit` | directly stated in the PRD |
| `derived` | follows logically from an explicit statement |
| `inferred` | standard QA reasoning, not specified (e.g. "Esc closes the popup") |
| `ambiguous` | the PRD does not determine the behaviour |

**Never silently turn an assumption into a requirement.** When the expected behaviour is
unclear, create a GAP. Any item you mark `ambiguous` must link to a GAP
(`gapIds: ["GAP-004"]`), or validation will warn.

### 4. Test cases

Every test case must link to at least one requirement (`requirementIds`). Link it to
each validation or rule it exercises too (`validationIds`, `ruleIds`). Coverage is
computed from these links:

- **covered**: the requirement has tests, and every linked VAL/RULE has a test
- **partial**: the requirement has tests, but some linked VAL/RULE has none
- **uncovered**: the requirement has no tests

Cover what the PRD makes relevant: happy path, negative, boundary, empty, invalid,
state-transition, permission, dependent fields, bulk, filter/sort, lifecycle, error
handling. Don't generate filler. Every test should trace to something the PRD says or
clearly implies. Prefer fewer, sharper tests with concrete data (e.g. "Grant Price
= -5 → blocked") over vague ones.

`type` ∈ happy-path, negative, boundary, empty, invalid, validation, state-transition,
permission, dependency, bulk, filter, sort, lifecycle, error-handling, ui, integration.
`priority` ∈ critical, high, medium, low.

### 5. Gaps

A gap is a first-class open question, not a failure. Create one when:

- the PRD contradicts itself
- a behaviour, limit, message or edge case is unspecified
- the PRD itself flags an open question or TBD (copy those in and cite them)

Fields: `question` (required), `impact` (why QA cares), `options` (plausible answers),
`relatedIds`, `priority`, `status: "open"`.

### 6. Provenance: quote, don't paraphrase

Every non-gap entity needs a `source`:

```json
"source": { "section": "3.8", "excerpt": "exact words copied from that section of prd.md" }
```

- `section` is the id from the `[§…]` anchor (e.g. `"3.8"`, `"9.3/12"`).
- `excerpt` is a short **verbatim** quote (5–25 words) from that section. Use `…` to join
  two fragments of the same section. Keep the PRD's language: if the PRD is in Hebrew,
  quote the Hebrew.
- A derived or inferred test that has no quote of its own can use
  `"source": { "requirementId": "REQ-012" }`. It then inherits provenance through that link.

Sherlock checks every excerpt against the PRD text. Unverifiable quotes are shown to
the QA as source issues, so fix any that `create`/`update` warns about.

**Cite the deepest anchor above the words you quote.** Text under `### [§5.1/1]` belongs
to §5.1/1, not §5.1. A quote from a sub-heading's body cited to its parent comes back as
`SOURCE_SECTION_MISMATCH` (the warning names the right section: use it).

Good and bad excerpts:

| | excerpt | why |
|---|---|---|
| ✅ | `"לא שלילי. יכול להיות 0"` (§3.8) | short, verbatim, the exact rule under test |
| ✅ | `"Actions \| צהוב \| מספר המשימות הפתוחות"` | a table row: cells joined by `\|` still verify |
| ✅ | `"Void (5.4)… Add to Exhibit (5.7)"` | `…` joins two fragments of one section |
| ❌ | `"Grant Price must be non-negative"` | a translation or paraphrase, not a quote |
| ❌ | a whole paragraph | too long to review; quote the 5–25 words that matter |
| ❌ | a heading cited as the parent of its own sub-section's text | wrong section id |

In JSON, escape double quotes inside strings (`\"`). Hebrew abbreviations use them
constantly (ע\"פ, מע\"מ), and an unescaped one breaks the whole file.

Use `notes` to explain your reasoning on derived, inferred or ambiguous items. It
appears in the inspector as "Notes", and it answers the QA's question "why did Sherlock
generate this?"

### 7. Model format

Write the model to `.sherlock/model.draft.json`. The model is the source of truth; the
UI renders from it. IDs are stable. Never renumber existing IDs, only append new ones.

```json
{
  "schemaVersion": 1,
  "project": {
    "name": "Grants Module",
    "subtitle": "QA Guide",
    "summary": "One paragraph: what the module does and what this guide covers.",
    "keyFeatures": [ { "title": "Create and manage proposed grants", "requirementIds": ["REQ-001", "REQ-004"] } ]
  },
  "requirements": [
    { "id": "REQ-001", "title": "…", "description": "…", "classification": "explicit",
      "priority": "high", "screenIds": ["SCREEN-002"], "gapIds": [],
      "source": { "section": "3.8", "excerpt": "…" } }
  ],
  "screens": [
    { "id": "SCREEN-001", "title": "…", "description": "…", "classification": "explicit",
      "elements": ["Search", "Filters: Branch, Tax Treatment", "Table columns: …"],
      "requirementIds": ["REQ-001"], "source": { … } }
  ],
  "flows": [
    { "id": "FLOW-001", "title": "…", "description": "…", "classification": "derived",
      "steps": [ { "title": "Open Proposed › Draft", "detail": "What the user sees / system does", "screenId": "SCREEN-003" } ],
      "requirementIds": ["REQ-001"], "notes": "…", "source": { … } }
  ],
  "actions": [ { "id": "ACT-001", "title": "Void", "description": "…", "screenIds": [], "requirementIds": [], "classification": "explicit", "source": { … } } ],
  "validations": [
    { "id": "VAL-001", "title": "Grant Price is non-negative", "field": "Grant Price", "rule": "decimal ≥ 0",
      "errorMessage": "…", "requirementIds": ["REQ-010"], "classification": "explicit", "source": { … } }
  ],
  "businessRules": [ { "id": "RULE-001", "title": "…", "rule": "…", "requirementIds": [], "classification": "explicit", "source": { … } } ],
  "states": [
    { "id": "STATE-001", "title": "Grant lifecycle", "states": ["Draft", "Pending Board", "Outstanding"],
      "transitions": [ { "from": "Draft", "to": "Pending Board", "trigger": "Add to Exhibit" } ],
      "requirementIds": [], "classification": "explicit", "source": { … } }
  ],
  "permissions": [ { "id": "PERM-001", "title": "…", "role": "…", "allowed": ["…"], "denied": ["…"], "classification": "explicit", "source": { … } } ],
  "testCases": [
    { "id": "TC-001", "title": "Reject negative Grant Price", "type": "negative", "priority": "high",
      "classification": "derived", "requirementIds": ["REQ-010"], "validationIds": ["VAL-001"], "screenIds": ["SCREEN-003"],
      "preconditions": ["A Draft grant exists"], "steps": ["Open Edit on the grant", "Enter Grant Price = -5", "Save"],
      "expectedResult": "Save is blocked and an inline error is shown; value unchanged.",
      "source": { "requirementId": "REQ-010" } }
  ],
  "gaps": [
    { "id": "GAP-001", "question": "…?", "impact": "…", "options": ["…", "…"], "priority": "high",
      "status": "open", "classification": "ambiguous", "relatedIds": ["REQ-010"],
      "source": { "section": "12", "excerpt": "…" } }
  ]
}
```

Any string value that is a valid ID (for example in `requirementIds`, `screenIds`,
`relatedIds`, `steps[].screenId`) becomes a link in the traceability graph. A link to an
ID that does not exist is an error. Write the descriptive text in the PRD's language;
IDs, field names and enum values stay in English.

#### Large PRDs: write the model in parts

Don't write a big model as one file. Write part files into `.sherlock/parts/`. They are
merged in name order: arrays concatenate, `project` merges.

```
.sherlock/parts/00-project.json        { "project": { … } }
.sherlock/parts/01-gaps.json           { "gaps": [ … ] }        ← first: everything else links to them
.sherlock/parts/02-requirements.json
.sherlock/parts/03-screens-flows-actions.json
.sherlock/parts/04-checks.json         validations, businessRules, states, permissions
.sherlock/parts/05-tests-a.json        testCases, split by PRD area
.sherlock/parts/06-tests-b.json
```

Run `sherlock validate .sherlock/parts` after each part, before you write the tests.
It catches bad quotes early, while they are cheap to fix. Then run
`sherlock create .sherlock/parts`. The CLI accepts the directory wherever it accepts a
model file.

Rough sizing, from a real 10.6k-word Hebrew PRD (245 sections): ~145 requirements,
~30 screens, ~10 flows, ~30 validations, ~30 rules, ~165 test cases and ~48 gaps. That
is about one requirement per testable statement, a little over one test per
requirement, and one gap per row of the PRD's open-questions appendix plus the
contradictions you find. A 2-page PRD should be a fraction of that. Don't pad it.

### 8. Create, open and report

```
sherlock create .sherlock/model.draft.json    # validates; fix errors and rerun
sherlock open                                  # starts the local server, opens the browser
```

If `create` fails with `MODEL_INVALID`, fix the listed errors and rerun it. Resolve
source warnings (`SOURCE_EXCERPT_NOT_FOUND`, `SOURCE_SECTION_MISMATCH`) with
`sherlock update` before you report. Then tell the user, briefly:

```
Analyzed PRD-Grants-Module.docx
  48 requirements · 17 screens · 9 flows · 22 validations · 96 test cases · 21 gaps
  Coverage 88% · Traceability 97%
Sherlock is open at http://localhost:4870. Review, and leave feedback on any item.
```

If `BROWSER: not opened`, give the user the URL.

### 9. Feedback loop

The QA leaves feedback in the browser. Each item is stored as `FB-###` with a
`targetId`. To get it:

```
sherlock poll --timeout 540     # blocks until new feedback arrives (settles for 8s to batch it)
sherlock feedback               # all open feedback
sherlock show TC-023 REQ-004    # full context for the targets
```

If the user says they are reviewing, run `poll` and keep polling while they work. If
they say they're done, run `feedback`.

For each item:

1. Re-read the relevant section of `.sherlock/prd.md`. The PRD is the authority, not the
   QA's claim and not your earlier output. If the QA is right, fix the model. If the PRD
   says otherwise, answer with the quote. If the PRD is silent, add or update a GAP.
2. Make the change as a patch, which is smaller and safer than rewriting the model:

```json
{
  "merge":  [ { "id": "TC-023", "expectedResult": "…" } ],
  "upsert": [ { "id": "TC-097", "title": "Accept Grant Price = 0", … } ],
  "remove": [ "TC-019" ]
}
```

```
sherlock update .sherlock/patch.json --resolve FB-001,FB-002 --note "Fixed expected result per §3.8; added TC-097 for zero."
```

- `merge` shallow-merges fields into an existing entity; `upsert` adds or replaces a
  whole entity; `remove` deletes an entity and strips references to it.
- New IDs continue from the highest existing one (`sherlock inspect` shows the counts).
- `--note` is shown to the QA as Claude's reply, so make it specific: what changed and
  which § backs it.
- If a question needs an answer and no model change, use
  `sherlock resolve FB-003 --note "REQ-004 comes from §5.2: '…'"`. Use `--dismiss` only
  when the feedback is out of scope, and explain why.

The browser refreshes itself after every update. Summarize to the user in 1–3 lines,
then keep polling if they are still reviewing.

## Common mistakes

- **Missing contradictions.** Compare every "X only" and "all except Y" statement with
  the tables and menus elsewhere in the PRD. Real example: "Duplicate: row menu in Draft
  only" versus a Pending Board row menu that lists Duplicate. Each contradiction is a
  GAP, and the affected requirement is `ambiguous` with `gapIds`.
- **Skipping the open-questions appendix.** Each row becomes its own GAP, cited to that
  appendix section.
- **Unlinked checks.** Each VAL/RULE needs at least one test that lists it in
  `validationIds`/`ruleIds`. Otherwise its requirement shows as *partial*.
- **Vague tests.** "Verify the filter works" isn't a test. Use concrete data and the
  boundary: "Grant Date = today − 30 → '15 days left' in red; − 29 → '16 days left' in
  turquoise".
- **Arrow chains in RTL text.** In Hebrew titles, `A → B → C` renders reversed. Put
  sequences in `steps`, or use `←` in RTL text.
- **Answering feedback in the wrong language.** Reply (`--note`) in the language the QA
  wrote in.

## Rules of thumb

- Keep CLI output out of your replies. Report outcomes, not logs.
- Don't regenerate the whole model to handle feedback. Patch it.
- Don't delete gaps the QA answered. Set `status: "answered"` and add the answer in `answer`.
- If the PRD changes, run `sherlock analyze` again, then `sherlock validate`, and fix any
  sources that broke.
