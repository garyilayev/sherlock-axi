# Spec — Spotlight search, language switch (EN/HE) and UI translations

**Status:** Ready to implement · **Scope:** `apps/editor` only (no CLI or model changes) · **Target:** Sherlock v0.2

Three features:

1. **Spotlight search**: the header search box becomes a magnifying-glass button that opens an Apple-Spotlight-style overlay.
2. **Language switch**: a circular flag button in the header. 🇺🇸 English makes the whole UI LTR; 🇮🇱 Hebrew makes it RTL.
3. **UI translations**: every piece of UI text (nav links, statuses, labels, empty states, toasts) comes from static JSON dictionaries (`en.json`, `he.json`), chosen by the active language.

---

## 1. Spotlight search

### 1.1 Header

- Remove the `<Search>` input from `Header` (`components/Chrome.jsx`).
- Put a 34×34 icon button with the magnifying-glass icon in its place, in the header's right cluster, before the language button.
  - `aria-label`: `t('search.open')`. Tooltip: `t('search.open')` + the shortcut hint (`Ctrl K` on Windows/Linux, `⌘K` on macOS).
  - Style it like `.header .btn.icon-btn`: transparent background, white icon, 10% white on hover.

### 1.2 Opening and closing

| Trigger | Result |
|---|---|
| Click the magnifier | Open |
| `Ctrl+K` / `⌘K` (anywhere) | Toggle |
| `/` when focus isn't in an input, textarea or contenteditable | Open |
| `Esc` | Clear the query if there is one; otherwise close |
| Click on the backdrop | Close |
| Choosing a result | Close, then navigate |

- When it opens, the input gets focus immediately and the previous query is selected, like macOS Spotlight. The query is kept in memory for the session, not persisted.
- When it closes, focus returns to the element that was focused before it opened.
- Page scroll is locked while it's open (`overflow: hidden` on the panes).

### 1.3 Layout

```
┌──────────────────────── backdrop: rgba(15,27,45,.35) + backdrop-filter: blur(6px) ────────────────────────┐
│                                                                                                         │
│                 ┌──────────────── panel: 640px wide (max 92vw), top: 18vh, radius 14px ────────────────┐ │
│                 │ 🔍  Search requirements, tests, gaps, PRD sections…                         Esc      │ │  ← 56px input, 18px text
│                 ├──────────────────────────────────────────────────────────────────────────────────────┤ │
│                 │ REQUIREMENTS                                                                          │ │  ← group header, 11px caps
│                 │ ▣ REQ-003  Grant Price לא שלילי                                  Explicit · Covered   │ │  ← active row: accent-soft bg
│                 │ ▣ REQ-011  …                                                                          │ │
│                 │ TEST CASES                                                                            │ │
│                 │ ☑ TC-002   Grant Price = -5 נחסם                                        negative      │ │
│                 │ PRD SECTIONS                                                                          │ │
│                 │ § 3.8      כללי פורמט לשדות נפוצים                                                    │ │
│                 ├──────────────────────────────────────────────────────────────────────────────────────┤ │
│                 │ ↑↓ navigate   ↵ open   Esc close                                    12 results        │ │  ← footer hints, 12px
│                 └──────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- The panel uses `--surface`, a 1px `--border` and `--shadow-lg`. Opening animates opacity plus `scale(.98 → 1)` over 120ms; with `prefers-reduced-motion` there's no animation.
- The results list is scrollable with a max height of 56vh. The active row scrolls into view with `block: 'nearest'`.
- Each row shows the kind icon, the ID (mono), the title (the match is highlighted with `<mark>`), and meta on the trailing side: the classification badge, plus coverage for requirements, the type for tests, and the status for gaps and feedback.
- Below the title there's a muted one-line snippet of the description or the matched field, shown only when the match wasn't in the ID or title.

### 1.4 Empty query: suggestions

| Group | Items |
|---|---|
| **Jump to** | Overview, Requirements, Test Cases, Gaps, Feedback, PRD Source (with translated labels and nav icons) |
| **Recent** | The last 6 opened entities (tracked in memory and in `localStorage['sherlock.recent']`, wrapped in try/catch) |
| **Needs attention** | Open gaps, uncovered requirements and open feedback (up to 3 each), from `state.analysis` |

### 1.5 What is searched

| Source | Fields | Result opens |
|---|---|---|
| Model entities (all 10 kinds) | `id`, title/question, `description`, `expectedResult`, `steps[]`, `notes` | `#/<kind>/<id>` |
| PRD sections | `§id`, `heading`, `text` (first match only, for the snippet) | `#/prd/<sectionId>` |
| Feedback | `id`, `message`, thread messages | `#/feedback` |
| Commands | Translated command labels: "Open PRD", "Go to Feedback", "Switch language", … | Runs the command |

**Matching and ranking** (write this yourself; no library is needed at this scale, around 1k items):

1. Normalize the query and the fields: lowercase and strip Hebrew niqqud (`/[֑-ׇ]/g`). Split the query on whitespace into tokens. **Every token must match** somewhere in the item's searchable text (AND semantics).
2. Scores add up: exact ID match **+1000**; ID prefix (`tc-00` → TC-001…) **+500**; title starts with the query **+200**; any title word starts with a token **+80** per token; title contains a token **+40**; hit in another field **+10**. Requirements, test cases and gaps get **+5** so they sort above supporting kinds when scores tie.
3. Typing just `§3.8` or `3.8` jumps straight to that PRD section as the top result.
4. Results are grouped by kind in sidebar order, with the PRD and feedback groups last. Each group shows at most 5 rows, followed by a "Show all N" row (`t('search.showAll', {count})`) that expands the group in place.
5. Search runs on every keystroke, debounced to 60ms. Build the index once per model revision with `useMemo` on `state.project.revision`.

### 1.6 Keyboard

- `↑` / `↓` move through all visible rows across groups, wrapping at the ends. `Home` and `End` jump to the first and last row.
- `↵` opens the active row. `Ctrl/⌘+↵` opens it and keeps Spotlight open (for fast triage).
- `Tab` is trapped inside the panel.
- ARIA: `role="dialog" aria-modal="true"`. The input has `role="combobox" aria-expanded aria-controls aria-activedescendant`, the list has `role="listbox"`, and each row has `role="option" aria-selected`.

### 1.7 RTL behaviour

- The magnifier sits on the input's inline-start side, and the Esc hint on its inline-end side.
- The meta column moves to the inline-end side automatically because the layout uses logical properties (see §3.5).
- The `↑↓` hints don't flip.

### 1.8 Component and file plan

- `src/components/Spotlight.jsx`: the overlay, input, grouped list and footer.
- `src/lib/search.js`: `buildIndex(state, prd, t)` → items, and `search(index, query)` → ranked groups. These are pure functions with unit tests.
- `App.jsx` owns the `spotlightOpen` state and the global key listener. The listener currently lives in `Search`; move it here.

---

## 2. Language switch (EN / HE)

### 2.1 Header control

- A **32px circle** in the header's right cluster, after the magnifier and before the "● Local" pill. It shows the active language's flag, cropped to the circle (`border-radius: 50%; overflow: hidden`), with a `1.5px` ring of `rgba(255,255,255,.35)` that turns to `.7` on hover and on focus-visible.
- **Use inline SVG flags, not emoji.** Windows doesn't render flag emoji: 🇮🇱 shows up as the letters "IL". Add `IsraelFlag` and `UsFlag` SVG components in `components/flags.jsx`, drawn to fill a square viewBox so they crop cleanly in the circle.
- Clicking it opens a small menu anchored under the button, on the inline-end side:

```
┌───────────────────────────┐
│ (🇺🇸)  English        ✓   │
│ (🇮🇱)  עברית              │
└───────────────────────────┘
```

  - Each language's name is always written in that language ("English", "עברית"), whatever the current UI language is.
  - Keyboard: `Enter`/`Space` opens the menu, arrow keys move, `Enter` selects, `Esc` closes.
  - `aria-label` = `t('language.switch')`; the menu is `role="menu"` and its items are `role="menuitemradio" aria-checked`.
- Spotlight also gets a command, "Switch to Hebrew" / "Switch to English".

### 2.2 What switching does

| | English (`en`) | Hebrew (`he`) |
|---|---|---|
| `<html lang>` | `en` | `he` |
| `<html dir>` | `ltr` | `rtl` |
| Sidebar | Left edge | Right edge |
| Inspector | Right pane | Left pane |
| Chevrons (back, "›" in lists, "View in PRD ›") | Point right; back points left | Mirrored |
| Text alignment everywhere | Left | Right |
| Numbers, dates | `Intl` with `en-US` | `Intl` with `he-IL` |
| UI strings | `en.json` | `he.json` |

- Switching takes effect immediately, with no reload, and keeps the current route, selection, filters and scroll position.
- **Persistence:** `localStorage['sherlock.lang']`, wrapped in try/catch.
- **Default when nothing is stored:**
  1. the stored choice;
  2. otherwise the PRD's language: `he` if more than 30% of the letters in `prd.title` plus the first section headings are Hebrew;
  3. otherwise `navigator.language` starting with `he`;
  4. otherwise `en`.
- **No flash of wrong direction:** static export pre-renders in English, so add a tiny inline script in `app/layout.jsx` `<head>` that reads `localStorage` and sets `document.documentElement.lang` and `dir` before first paint. Put `suppressHydrationWarning` on `<html>`.

### 2.3 Direction of user content (decision)

The requirement is that **everything** follows the selected direction, and that is the default here:

- Layout, alignment, list bullets, table column order, step numbering and the inspector all follow the UI direction.
- Model and PRD text (titles, descriptions, excerpts, steps) is **aligned** to the UI direction too. Mixed-script strings still need to render in the right order, though: "Grant Price לא שלילי" must not come out scrambled in LTR mode. So:
  - Replace the per-element `dir={dirOf(text)}` calls (in Overview, EntityList, Inspector, PrdViewer, Chrome and ui.jsx) with a `<Bidi>` wrapper that renders `<span className="bidi">`.
  - Add `.bidi { unicode-bidi: plaintext; text-align: start; }`. With `plaintext`, each paragraph's character order follows its own content, while alignment comes from the element's direction, which is the UI direction.
  - Keep `dirOf()` for one job only: choosing the Spotlight snippet direction. Otherwise delete it.
- The exception is IDs, `§` numbers, code and mono chips, which always render LTR in isolation (`<bdi dir="ltr">`), so `TC-002` never shows up as `002-TC`.

> **Open question for Gary:** in Hebrew mode, should English model content (for example a model generated from an English PRD) still be right-aligned? The spec says yes, meaning the whole page follows the chosen direction. The alternative is `dir="auto"` per paragraph, which is what the editor does today.

### 2.4 CSS changes: move to logical properties

Audit `styles.css` and swap every physical property for its logical equivalent. Known places:

| Selector | Change |
|---|---|
| `.sidebar` | `border-right` → `border-inline-end` |
| `.prd-outline` | `border-right` → `border-inline-end` |
| `.search .icon` / `.search kbd` | `left`/`right` → `inset-inline-start`/`inset-inline-end` (the header search is removed; reuse this for the Spotlight input) |
| `.metric .m-icon` | `right: 18px` → `inset-inline-end: 18px` |
| `.menu-pop` | `right: 0` → `inset-inline-end: 0` |
| `.nav-item .count`, `.nav-item .alert` | `margin-left: auto` → `margin-inline-start: auto` |
| `.table th`, `.search-results button`, `.nav-item`, `.menu-pop button`, `.metric`, `.breakdown button`, `.coverage-strip .card` | `text-align: left` → `text-align: start` |
| `.feature-list` | `padding: 0 0 0 12px` → `padding-inline-start: 12px` |
| `.source-quote[dir='rtl']` radius hack | Use `border-start-end-radius` / `border-end-end-radius` instead |
| `.panes` padding `0 16px 16px 20px` | `padding-block: 0 16px; padding-inline: 20px 16px` |
| `.inspector` fixed position (≤1000px) | `right: 12px` → `inset-inline-end: 12px` |
| Chevron icons | Add `.flip-rtl { transform: scaleX(-1) }` under `[dir='rtl']` and apply it to `chevronLeft`, `chevronRight` and `arrow` |

Grid areas (`sidebar | main | inspector`) flip automatically under `dir="rtl"`, so no change is needed there. Add a lint step (§4.6) so physical properties don't creep back in.

### 2.5 Fonts

`--sans` already includes `'Noto Sans Hebrew'`. Under `:lang(he)`, use `--sans: 'Rubik', 'Noto Sans Hebrew', 'Segoe UI', Arial, sans-serif;` with system fonts only, to stay local-first. Line height stays at 1.5. Also check that `.overview-title` (32px/700) reads well in Hebrew; if needed, drop the letter-spacing to 0 under `:lang(he)`.

---

## 3. UI translations (static JSON)

### 3.1 Files

```
apps/editor/src/i18n/
├── en.json          # source of truth for keys
├── he.json          # must have exactly the same key set
├── index.js         # I18nProvider, useI18n(), t(), formatters
└── i18n.test.js     # key parity + placeholder parity
```

- Keep it static JSON that is imported at build time: `import en from './en.json'`. No runtime fetching, and no i18n library; about 60 lines of custom code is enough, and it keeps the static export trivial.
- Don't translate the model's data. Enum **values** stay English in `model.json` (`classification: "derived"`); only their **display labels** are translated, through `t('classification.derived')`.

### 3.2 API

```js
const { lang, dir, setLang, t, fmt } = useI18n();

t('nav.requirements')                         // "Requirements" / "דרישות"
t('overview.coverageSummary', { covered: 2, total: 4 })
t('list.shown', { count: 5 })                 // plural via Intl.PluralRules
fmt.number(12345)                             // "12,345"
fmt.date(iso)                                 // Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' })
fmt.relative(iso)                             // Intl.RelativeTimeFormat → "2 min ago" / "לפני 2 דקות"
```

- Interpolation uses `{name}` placeholders.
- Plurals: a key can be an object like `{ "one": "…", "other": "…" }` (Hebrew also uses `two` and `many` when `Intl.PluralRules('he')` returns them). Pick the form with `new Intl.PluralRules(lang).select(count)`, falling back to `other`.
- A missing key falls back to `en`. If it's missing there too, show the key itself and `console.warn` once per key in development.
- `timeAgo()` in `lib/meta.js` is replaced by `fmt.relative`.
- The existing lookup tables in `lib/meta.js` (`CLASS_HELP`, `SOURCE_STATUS.label`, `COVERAGE.label`, `VIEW_LABEL`, `KINDS[*].label`) keep only their **tones and keys**. All their labels move to JSON.

### 3.3 Coverage rule

Every string a user can see in `apps/editor/src` must go through `t()`, including `aria-label`, `title` and `placeholder` attributes and toast messages. The only exceptions:

- Model and PRD content
- IDs, `§` numbers and file names
- Product and UI names that the PRD itself keeps in English: "Sherlock", "Claude", "Ctrl ↵"

### 3.4 Dictionaries

Hebrew wording follows the Hebrew QA Guide's vocabulary (דרישות, מסכים, זרימות, מקרי בדיקה, פערים, ולידציות).

**`en.json`**

```json
{
  "app": {
    "name": "Sherlock",
    "qaGuide": "QA Guide",
    "loading": "Opening Sherlock…",
    "connecting": "Connecting to the local workspace",
    "serverDown": "Local server not reachable",
    "serverDownHint": "Start it from your project with {cmd}.",
    "noModel": "No QA model yet",
    "noModelHint": "Run {cmd} in Claude Code.",
    "noModelPrdHint": "PRD {doc} is extracted. Claude will create the model with {cmd}."
  },
  "header": {
    "local": "Local",
    "connecting": "Connecting",
    "offline": "Offline",
    "localTooltip": "Connected to the local Sherlock server — changes appear live",
    "offlineTooltip": "Local server not reachable",
    "openPrd": "Open PRD",
    "more": "More",
    "reload": "Reload model",
    "allFeedback": "All feedback",
    "copyPath": "Copy workspace path",
    "prdLabel": "PRD: {doc}"
  },
  "language": {
    "switch": "Change language",
    "en": "English",
    "he": "עברית",
    "switchTo": "Switch to {name}"
  },
  "search": {
    "open": "Search",
    "placeholder": "Search requirements, tests, gaps, PRD sections…",
    "jumpTo": "Jump to",
    "recent": "Recent",
    "attention": "Needs attention",
    "commands": "Commands",
    "prdSections": "PRD sections",
    "feedback": "Feedback",
    "noResults": "No results for “{query}”",
    "noResultsHint": "Try an ID like TC-012, a section like §3.8, or fewer words.",
    "showAll": "Show all {count}",
    "results": { "one": "1 result", "other": "{count} results" },
    "hintNavigate": "navigate",
    "hintOpen": "open",
    "hintClose": "close"
  },
  "nav": {
    "overview": "Overview",
    "requirements": "Requirements",
    "screens": "Screens",
    "flows": "Flows",
    "actions": "Actions",
    "validations": "Validations",
    "businessRules": "Business Rules",
    "states": "States",
    "permissions": "Permissions",
    "testCases": "Test Cases",
    "gaps": "Gaps",
    "feedback": "Feedback",
    "prd": "PRD Source",
    "groupModel": "Model",
    "groupReview": "Review",
    "back": "Back",
    "openGaps": "Open gaps",
    "openFeedback": "Open feedback"
  },
  "kind": {
    "requirements": "Requirement",
    "screens": "Screen",
    "flows": "Flow",
    "actions": "Action",
    "validations": "Validation",
    "businessRules": "Business Rule",
    "states": "State Model",
    "permissions": "Permission",
    "testCases": "Test Case",
    "gaps": "Gap"
  },
  "sidebar": {
    "generatedFrom": "Generated from PRD",
    "by": "by Claude Code + Sherlock",
    "revision": "Rev {rev}"
  },
  "classification": {
    "explicit": "Explicit",
    "derived": "Derived",
    "inferred": "Inferred",
    "ambiguous": "Ambiguous",
    "unclassified": "Unclassified",
    "help": {
      "explicit": "Directly stated in the PRD",
      "derived": "Logically follows from an explicit requirement",
      "inferred": "Standard QA reasoning, not specified in the PRD",
      "ambiguous": "The PRD does not determine the expected behavior",
      "none": "No classification set."
    }
  },
  "coverage": {
    "covered": "Covered",
    "partial": "Partial",
    "uncovered": "Uncovered",
    "ambiguous": "Ambiguous",
    "openGap": "Open gap",
    "tests": { "one": "1 test", "other": "{count} tests" },
    "noTests": "No tests",
    "untested": "untested:",
    "openGapLabel": "open gap:"
  },
  "source": {
    "verified": "Verified in PRD",
    "paraphrased": "Paraphrased",
    "section-only": "Section cited",
    "inherited": "Via linked item",
    "section-mismatch": "Found in another section",
    "excerpt-not-found": "Excerpt not in PRD",
    "section-not-found": "Section not in PRD",
    "missing": "No source",
    "no-prd": "PRD not loaded",
    "section": "Section {id}",
    "tracedVia": "Traced via",
    "mismatch": "Quote found in §{found}, not §{cited}",
    "missingHint": "No PRD source — ask Claude where this came from.",
    "viewInPrd": "View in PRD"
  },
  "status": {
    "review": { "ready": "Ready", "needs-review": "Needs review" },
    "gap": { "open": "Open", "answered": "Answered", "resolved": "Resolved", "closed": "Closed", "dismissed": "Dismissed" },
    "feedback": { "open": "Open", "resolved": "Resolved", "dismissed": "Dismissed", "all": "All" },
    "updated": "Updated",
    "updatedRev": "Updated rev {rev}"
  },
  "priority": { "critical": "Critical", "high": "High", "medium": "Medium", "low": "Low" },
  "testType": {
    "happy-path": "Happy path", "negative": "Negative", "boundary": "Boundary", "empty": "Empty",
    "invalid": "Invalid", "validation": "Validation", "state-transition": "State transition",
    "permission": "Permission", "dependency": "Dependency", "bulk": "Bulk", "filter": "Filter",
    "sort": "Sort", "lifecycle": "Lifecycle", "error-handling": "Error handling", "ui": "UI", "integration": "Integration"
  },
  "overview": {
    "revision": "Revision {rev}",
    "updated": "updated {time}",
    "allTraced": "All traced",
    "notTraced": { "one": "1 not traced", "other": "{count} not traced" },
    "needReview": "Need review",
    "allAnswered": "All answered",
    "keyFeatures": "Key Features",
    "noKeyFeatures": "No key features listed.",
    "coverageTraceability": "Coverage & Traceability",
    "coverageSummary": "{covered} of {total} requirements fully covered",
    "traceSummary": "traced to the PRD · {verified} quotes verified verbatim",
    "traced": "Traced",
    "sourceIssues": "Source issues",
    "sourceIssuesLabel": "Source issues:",
    "allSourced": "Every item cites a PRD section or a linked item.",
    "recentUpdates": "Recent Updates",
    "changeCreated": "Guide generated from the PRD with {count} items.",
    "changeRevision": "Revision {rev}: {parts}.",
    "changeAdded": "{count} added",
    "changeModified": "{count} modified",
    "changeRemoved": "{count} removed",
    "changeProject": "project details updated",
    "resolves": "resolves {ids}",
    "disclaimer": "This QA guide was generated from {doc} and includes both explicit requirements and inferred QA elements. Review the classifications to understand the source and confidence level of each item.",
    "contentBreakdown": "Content Breakdown"
  },
  "list": {
    "filter": "Filter {kind}…",
    "all": "All",
    "allTypes": "All types",
    "shown": "{count} shown",
    "empty": "Nothing matches these filters.",
    "col": {
      "id": "ID", "class": "Class", "coverage": "Coverage", "tests": "Tests", "source": "Source",
      "type": "Type", "priority": "Priority", "requirements": "Requirements", "steps": "Steps", "tested": "Tested"
    },
    "gapsIntro": "Open questions where the PRD does not determine the expected behavior. Sherlock never silently turns these into requirements.",
    "requirementsIntro": "A requirement is covered when it has tests and every linked validation and business rule is tested.",
    "hasFeedback": { "one": "1 open feedback", "other": "{count} open feedback" }
  },
  "inspector": {
    "close": "Close inspector",
    "missingEntity": "This item no longer exists in the model (it may have been removed in the latest revision).",
    "flowSteps": "Flow Steps",
    "steps": "Steps",
    "testSteps": "Test Steps",
    "preconditions": "Preconditions",
    "testData": "Test Data",
    "expectedResult": "Expected Result",
    "elements": "Elements",
    "fields": "Fields",
    "states": "States",
    "transitions": "Transitions",
    "definition": "Definition",
    "field": "Field",
    "rule": "Rule",
    "errorMessage": "Error message",
    "role": "Role",
    "access": "Access",
    "allowed": "Allowed",
    "denied": "Denied",
    "question": "Question",
    "impact": "Why it matters",
    "options": "Possible answers",
    "suggested": "Suggested default",
    "answer": "Answer",
    "details": "Details",
    "coverage": "Coverage",
    "relatedRequirements": "Related Requirements",
    "relatedItems": "Related Items",
    "related": "Related",
    "source": "Source",
    "notes": "Notes",
    "traceability": "Traceability",
    "feedback": "Feedback",
    "more": "+{count} more"
  },
  "feedback": {
    "title": "Feedback",
    "intro": "Everything the QA has asked Claude to change or explain. Claude reads this with {cmd}, updates the model, and replies here.",
    "type": { "correction": "Correction", "missing": "Missing", "question": "Question", "remove": "Remove", "other": "Other" },
    "qa": "QA",
    "claude": "Claude",
    "placeholder": "Feedback for Claude on {id}…",
    "send": "Send to Claude",
    "saved": "{id} saved locally. Claude picks it up with {cmd}.",
    "addDetail": "Add detail…",
    "replyToReopen": "Reply to reopen…",
    "add": "Add",
    "reopen": "Reopen",
    "withdraw": "Withdraw",
    "changedIn": "Changed in rev {rev}:",
    "empty": "No {status} feedback. Select any item and use “Send to Claude”.",
    "quick": {
      "expectedWrong": "The expected result is wrong: ",
      "addTestFor": "Add a test for ",
      "addBoundary": "Add a boundary/negative case: ",
      "whereFrom": "Where did this requirement come from?",
      "prdSays": "The PRD says ",
      "missingCoverage": "Missing test coverage for ",
      "missingStep": "This flow is missing a step: ",
      "wrongOrder": "Step order is wrong: ",
      "answer": "Answer: ",
      "notAGap": "This is not a real gap — the PRD covers it in §",
      "why": "Why did Sherlock generate this?",
      "wrong": "This is wrong: ",
      "irrelevant": "Not relevant — remove it."
    }
  },
  "prd": {
    "title": "PRD Source",
    "stats": "{sections} sections · {words} words",
    "findSection": "Find section…",
    "citingCount": "QA items citing this section",
    "generatedFrom": "Generated from this section:",
    "highlighted": "Highlighted: the exact PRD text this item was generated from.",
    "notExtracted": "No PRD extracted. Run {cmd}."
  },
  "toast": {
    "modelUpdated": "Claude updated the guide — rev {rev}",
    "itemsChanged": { "one": "1 item changed", "other": "{count} items changed" }
  }
}
```

**`he.json`**

```json
{
  "app": {
    "name": "Sherlock",
    "qaGuide": "מדריך QA",
    "loading": "פותח את Sherlock…",
    "connecting": "מתחבר לסביבת העבודה המקומית",
    "serverDown": "השרת המקומי אינו זמין",
    "serverDownHint": "הפעילו אותו מתיקיית הפרויקט באמצעות {cmd}.",
    "noModel": "עדיין אין מודל QA",
    "noModelHint": "הריצו {cmd} ב-Claude Code.",
    "noModelPrdHint": "ה-PRD {doc} חולץ. Claude ייצור את המודל באמצעות {cmd}."
  },
  "header": {
    "local": "מקומי",
    "connecting": "מתחבר",
    "offline": "מנותק",
    "localTooltip": "מחובר לשרת Sherlock המקומי — שינויים מוצגים בזמן אמת",
    "offlineTooltip": "השרת המקומי אינו זמין",
    "openPrd": "פתיחת PRD",
    "more": "עוד",
    "reload": "טעינת המודל מחדש",
    "allFeedback": "כל המשובים",
    "copyPath": "העתקת נתיב סביבת העבודה",
    "prdLabel": "PRD: {doc}"
  },
  "language": {
    "switch": "החלפת שפה",
    "en": "English",
    "he": "עברית",
    "switchTo": "מעבר ל{name}"
  },
  "search": {
    "open": "חיפוש",
    "placeholder": "חיפוש דרישות, בדיקות, פערים וסעיפי PRD…",
    "jumpTo": "מעבר אל",
    "recent": "אחרונים",
    "attention": "דורש טיפול",
    "commands": "פקודות",
    "prdSections": "סעיפי PRD",
    "feedback": "משובים",
    "noResults": "אין תוצאות עבור „{query}”",
    "noResultsHint": "נסו מזהה כמו TC-012, סעיף כמו §3.8, או פחות מילים.",
    "showAll": "הצגת כל ה-{count}",
    "results": { "one": "תוצאה אחת", "two": "2 תוצאות", "other": "{count} תוצאות" },
    "hintNavigate": "ניווט",
    "hintOpen": "פתיחה",
    "hintClose": "סגירה"
  },
  "nav": {
    "overview": "סקירה כללית",
    "requirements": "דרישות",
    "screens": "מסכים",
    "flows": "זרימות",
    "actions": "פעולות",
    "validations": "ולידציות",
    "businessRules": "כללים עסקיים",
    "states": "מצבים",
    "permissions": "הרשאות",
    "testCases": "מקרי בדיקה",
    "gaps": "פערים",
    "feedback": "משובים",
    "prd": "מקור ה-PRD",
    "groupModel": "מודל",
    "groupReview": "סקירה",
    "back": "חזרה",
    "openGaps": "פערים פתוחים",
    "openFeedback": "משובים פתוחים"
  },
  "kind": {
    "requirements": "דרישה",
    "screens": "מסך",
    "flows": "זרימה",
    "actions": "פעולה",
    "validations": "ולידציה",
    "businessRules": "כלל עסקי",
    "states": "מודל מצבים",
    "permissions": "הרשאה",
    "testCases": "מקרה בדיקה",
    "gaps": "פער"
  },
  "sidebar": {
    "generatedFrom": "נוצר מתוך PRD",
    "by": "על ידי Claude Code + Sherlock",
    "revision": "גרסה {rev}"
  },
  "classification": {
    "explicit": "מפורש",
    "derived": "נגזר",
    "inferred": "מוסק",
    "ambiguous": "לא חד-משמעי",
    "unclassified": "לא מסווג",
    "help": {
      "explicit": "מופיע במפורש ב-PRD",
      "derived": "נובע לוגית מדרישה מפורשת",
      "inferred": "היסק QA מקובל, לא מוגדר ב-PRD",
      "ambiguous": "ה-PRD אינו קובע את ההתנהגות הצפויה",
      "none": "לא הוגדר סיווג."
    }
  },
  "coverage": {
    "covered": "מכוסה",
    "partial": "חלקי",
    "uncovered": "לא מכוסה",
    "ambiguous": "לא חד-משמעי",
    "openGap": "פער פתוח",
    "tests": { "one": "בדיקה אחת", "two": "2 בדיקות", "other": "{count} בדיקות" },
    "noTests": "אין בדיקות",
    "untested": "ללא בדיקה:",
    "openGapLabel": "פער פתוח:"
  },
  "source": {
    "verified": "אומת ב-PRD",
    "paraphrased": "ניסוח חופשי",
    "section-only": "צוטט סעיף",
    "inherited": "דרך פריט מקושר",
    "section-mismatch": "נמצא בסעיף אחר",
    "excerpt-not-found": "הציטוט לא נמצא ב-PRD",
    "section-not-found": "הסעיף לא קיים ב-PRD",
    "missing": "אין מקור",
    "no-prd": "ה-PRD לא נטען",
    "section": "סעיף {id}",
    "tracedVia": "מקושר דרך",
    "mismatch": "הציטוט נמצא ב-§{found} ולא ב-§{cited}",
    "missingHint": "אין מקור ב-PRD — שאלו את Claude מאיפה זה הגיע.",
    "viewInPrd": "הצגה ב-PRD"
  },
  "status": {
    "review": { "ready": "מוכן", "needs-review": "דורש סקירה" },
    "gap": { "open": "פתוח", "answered": "נענה", "resolved": "טופל", "closed": "סגור", "dismissed": "נדחה" },
    "feedback": { "open": "פתוח", "resolved": "טופל", "dismissed": "נדחה", "all": "הכל" },
    "updated": "עודכן",
    "updatedRev": "עודכן בגרסה {rev}"
  },
  "priority": { "critical": "קריטי", "high": "גבוה", "medium": "בינוני", "low": "נמוך" },
  "testType": {
    "happy-path": "תרחיש תקין", "negative": "שלילי", "boundary": "ערכי גבול", "empty": "ערך ריק",
    "invalid": "ערך לא תקין", "validation": "ולידציה", "state-transition": "מעבר מצב",
    "permission": "הרשאות", "dependency": "תלות", "bulk": "פעולה מרובה", "filter": "סינון",
    "sort": "מיון", "lifecycle": "מחזור חיים", "error-handling": "טיפול בשגיאות", "ui": "ממשק", "integration": "אינטגרציה"
  },
  "overview": {
    "revision": "גרסה {rev}",
    "updated": "עודכן {time}",
    "allTraced": "הכל מקושר ל-PRD",
    "notTraced": { "one": "פריט אחד לא מקושר", "other": "{count} לא מקושרים" },
    "needReview": "דורש סקירה",
    "allAnswered": "כולם נענו",
    "keyFeatures": "יכולות מרכזיות",
    "noKeyFeatures": "לא הוגדרו יכולות מרכזיות.",
    "coverageTraceability": "כיסוי ועקיבות",
    "coverageSummary": "{covered} מתוך {total} דרישות מכוסות במלואן",
    "traceSummary": "מקושרים ל-PRD · {verified} ציטוטים אומתו מילה במילה",
    "traced": "מקושר",
    "sourceIssues": "בעיות מקור",
    "sourceIssuesLabel": "בעיות מקור:",
    "allSourced": "כל פריט מצטט סעיף ב-PRD או פריט מקושר.",
    "recentUpdates": "עדכונים אחרונים",
    "changeCreated": "המדריך נוצר מתוך ה-PRD עם {count} פריטים.",
    "changeRevision": "גרסה {rev}: {parts}.",
    "changeAdded": "{count} נוספו",
    "changeModified": "{count} עודכנו",
    "changeRemoved": "{count} הוסרו",
    "changeProject": "פרטי הפרויקט עודכנו",
    "resolves": "מטפל ב-{ids}",
    "disclaimer": "מדריך QA זה נוצר מתוך {doc} וכולל גם דרישות מפורשות וגם רכיבי QA מוסקים. עברו על הסיווגים כדי להבין את המקור ואת רמת הביטחון של כל פריט.",
    "contentBreakdown": "פילוח התוכן"
  },
  "list": {
    "filter": "סינון {kind}…",
    "all": "הכל",
    "allTypes": "כל הסוגים",
    "shown": "מוצגים {count}",
    "empty": "אין פריטים שתואמים לסינון.",
    "col": {
      "id": "מזהה", "class": "סיווג", "coverage": "כיסוי", "tests": "בדיקות", "source": "מקור",
      "type": "סוג", "priority": "עדיפות", "requirements": "דרישות", "steps": "שלבים", "tested": "נבדק"
    },
    "gapsIntro": "שאלות פתוחות שבהן ה-PRD אינו קובע את ההתנהגות הצפויה. Sherlock לעולם לא הופך אותן לדרישות בשקט.",
    "requirementsIntro": "דרישה מכוסה כאשר יש לה בדיקות וכל ולידציה וכלל עסקי המקושרים אליה נבדקים.",
    "hasFeedback": { "one": "משוב פתוח אחד", "other": "{count} משובים פתוחים" }
  },
  "inspector": {
    "close": "סגירת החלונית",
    "missingEntity": "הפריט כבר לא קיים במודל (ייתכן שהוסר בגרסה האחרונה).",
    "flowSteps": "שלבי הזרימה",
    "steps": "שלבים",
    "testSteps": "שלבי הבדיקה",
    "preconditions": "תנאים מקדימים",
    "testData": "נתוני בדיקה",
    "expectedResult": "תוצאה צפויה",
    "elements": "רכיבים",
    "fields": "שדות",
    "states": "מצבים",
    "transitions": "מעברים",
    "definition": "הגדרה",
    "field": "שדה",
    "rule": "כלל",
    "errorMessage": "הודעת שגיאה",
    "role": "תפקיד",
    "access": "גישה",
    "allowed": "מותר",
    "denied": "אסור",
    "question": "שאלה",
    "impact": "למה זה חשוב",
    "options": "תשובות אפשריות",
    "suggested": "ברירת מחדל מוצעת",
    "answer": "תשובה",
    "details": "פרטים",
    "coverage": "כיסוי",
    "relatedRequirements": "דרישות קשורות",
    "relatedItems": "פריטים קשורים",
    "related": "קשורים",
    "source": "מקור",
    "notes": "הערות",
    "traceability": "עקיבות",
    "feedback": "משוב",
    "more": "+{count} נוספים"
  },
  "feedback": {
    "title": "משובים",
    "intro": "כל מה שצוות ה-QA ביקש מ-Claude לשנות או להסביר. Claude קורא את זה באמצעות {cmd}, מעדכן את המודל ומגיב כאן.",
    "type": { "correction": "תיקון", "missing": "חסר", "question": "שאלה", "remove": "הסרה", "other": "אחר" },
    "qa": "QA",
    "claude": "Claude",
    "placeholder": "משוב ל-Claude על {id}…",
    "send": "שליחה ל-Claude",
    "saved": "{id} נשמר מקומית. Claude יקבל אותו באמצעות {cmd}.",
    "addDetail": "הוספת פרטים…",
    "replyToReopen": "השיבו כדי לפתוח מחדש…",
    "add": "הוספה",
    "reopen": "פתיחה מחדש",
    "withdraw": "משיכה",
    "changedIn": "שונה בגרסה {rev}:",
    "empty": "אין משובים ({status}). בחרו פריט כלשהו ולחצו „שליחה ל-Claude”.",
    "quick": {
      "expectedWrong": "התוצאה הצפויה שגויה: ",
      "addTestFor": "הוסיפו בדיקה עבור ",
      "addBoundary": "הוסיפו מקרה גבול/שלילי: ",
      "whereFrom": "מאיפה הגיעה הדרישה הזו?",
      "prdSays": "ב-PRD כתוב ",
      "missingCoverage": "חסר כיסוי בדיקות עבור ",
      "missingStep": "בזרימה חסר שלב: ",
      "wrongOrder": "סדר השלבים שגוי: ",
      "answer": "תשובה: ",
      "notAGap": "זה לא פער אמיתי — ה-PRD מכסה את זה בסעיף §",
      "why": "למה Sherlock יצר את זה?",
      "wrong": "זה שגוי: ",
      "irrelevant": "לא רלוונטי — להסיר."
    }
  },
  "prd": {
    "title": "מקור ה-PRD",
    "stats": "{sections} סעיפים · {words} מילים",
    "findSection": "חיפוש סעיף…",
    "citingCount": "פריטי QA שמצטטים את הסעיף",
    "generatedFrom": "נוצר מתוך סעיף זה:",
    "highlighted": "מסומן: הטקסט המדויק ב-PRD שממנו נוצר הפריט.",
    "notExtracted": "לא חולץ PRD. הריצו {cmd}."
  },
  "toast": {
    "modelUpdated": "Claude עדכן את המדריך — גרסה {rev}",
    "itemsChanged": { "one": "פריט אחד השתנה", "two": "2 פריטים השתנו", "other": "{count} פריטים השתנו" }
  }
}
```

---

## 4. Acceptance criteria

### 4.1 Spotlight
- [ ] The header has no text input, only a magnifier button with a tooltip and aria-label.
- [ ] `Ctrl/⌘+K`, `/` and a click all open it; `Esc`, a backdrop click and choosing a result close it. Focus returns to where it was.
- [ ] Typing `tc-00` lists test cases first. `§3.8` or `3.8` puts the PRD section at the top. A Hebrew query (for example `שלילי`) finds Hebrew titles.
- [ ] Every token has to match. Results are grouped, show at most 5 per group with a "Show all" row, and match highlighting works in both scripts.
- [ ] Keyboard only: open, type, `↓↓`, `↵` reaches the inspector without using the mouse. `Ctrl+↵` keeps the panel open.
- [ ] An empty query shows Jump to, Recent and Needs attention.
- [ ] Typing gives no noticeable lag with 300 entities and 250 PRD sections: under 16ms per keystroke after the index is built.

### 4.2 Language and direction
- [ ] The flag circle shows 🇺🇸 or 🇮🇱 as an SVG that renders correctly on Windows.
- [ ] Choosing Hebrew flips `<html dir="rtl" lang="he">` immediately: the sidebar moves to the right, the inspector to the left, chevrons mirror, and all text is right-aligned, with no reload and the route kept.
- [ ] The choice survives a reload, with no flash of LTR on first paint.
- [ ] Mixed strings ("Grant Price לא שלילי", "TC-002") render in the correct order in both directions, and IDs never flip.
- [ ] Hebrew mode shows no horizontal scrollbar and nothing overlapping at 1280px and 1536px.

### 4.3 Translations
- [ ] Every UI string comes from `en.json`/`he.json`. A grep check (see 4.6) finds no hard-coded English in JSX text nodes, `aria-label`, `title` or `placeholder`.
- [ ] Nav links, kind badges, classification, coverage, source, review, gap and feedback statuses, priorities and test types all switch language.
- [ ] Plurals are correct in both languages (1, 2 and 5).
- [ ] Dates and relative times follow the locale.

### 4.4 Tests (`node --test` + Playwright)
- `i18n.test.js`:
  - key parity between `en.json` and `he.json`, recursively, including plural objects;
  - the same `{placeholders}` in both languages for every key;
  - no empty values.
- `search.test.js`: ranking order, multi-token AND matching, `§` shortcut, niqqud-insensitive Hebrew matching, the 5-per-group limit.
- Playwright:
  - open Spotlight with the keyboard, search, open a result;
  - switch to Hebrew and assert `dir="rtl"`, the sidebar's `getBoundingClientRect().left > 1000` and translated nav text;
  - reload and confirm Hebrew persists;
  - take screenshots of Overview, a list and the inspector in both languages.

### 4.5 Out of scope
- Translating model or PRD content (Claude writes content in the PRD's language; see SKILL.md).
- More languages. The structure should allow adding `xx.json` plus a flag component with no other code changes.
- Server-side locale detection (the editor is a static export).

### 4.6 Guardrails
- Add `npm run lint:i18n -w @sherlock/editor`, a small Node script that fails when:
  - JSX text or string literals in `aria-label=`, `title=` or `placeholder=` contain Latin letters and aren't wrapped in `t(`;
  - `styles.css` uses `margin-left`, `margin-right`, `padding-left`, `padding-right`, `left:`, `right:`, `text-align: left` or `text-align: right`.
  
  Existing allowances go in an allowlist inside the script.

---

## 5. Implementation order

1. `i18n/` (JSON + provider + tests), wrapping `App` in `I18nProvider`. Replace strings component by component: Chrome, Overview, EntityList, Inspector, Feedback, PrdViewer, ui.jsx, App.
2. The CSS move to logical properties, the `.flip-rtl` class, `<Bidi>` replacing `dirOf`, and the pre-paint direction script in `layout.jsx`.
3. The flag button and language menu, persistence and the default-language logic.
4. `lib/search.js` + tests, then `Spotlight.jsx`, then removing the old `Search` and moving the key listener to `App`.
5. Playwright checks and screenshots in both languages, then the i18n lint script.
