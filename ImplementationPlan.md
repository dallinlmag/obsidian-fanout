# Fanout Plugin — Implementation Plan

## Problem
Users want to write everything in their daily note and have the plugin automatically distribute (fan out) sections to other notes in the vault based on configurable rules.

## Approach
Build a focused v1 with: section parsing by any header level, rule-based distribution via the settings UI, multiple trigger modes (auto on new daily note creation, manual command, batch from folder, single file), and configurable append behavior (end of file, optional date backlink sub-header).

## Design Decisions
- **Rules defined in plugin settings tab** — add/edit/delete rules via Obsidian's settings UI (persisted with `saveData`)
- **Source header selection** — dropdown populated from the daily note template headings
- **Parses all header levels** — `#` through `######` are all recognized; rules match by exact header line
- **Target note selection** — typeahead file search using `AbstractInputSuggest`
- **Triggers**: auto-trigger on new daily note creation + manual command + settings buttons for single file and batch folder
- **Append behavior per rule**: append to end of target note, one newline padding before content, optionally prepend a `### [[filename]]` backlink
- **Daily note detection**: centralized in `daily-note-utils.ts` with three-tier fallback: Periodic Notes (new calendar-set/Svelte store format) → Periodic Notes (legacy `settings.daily`) → core Daily Notes plugin via `obsidian-daily-notes-interface`
- **Template diffing**: sections unchanged from the template are skipped (no copy for boilerplate)
- **Idempotency**: two layers — `FanoutComplete` frontmatter property on source files + `processedDates` list for auto-trigger
- **FanoutComplete stamping**: after successful fanout, source file gets `FanoutComplete: YYYY-MM-DD` (local time) in frontmatter; files with this property are skipped by default
- **Debug logging**: all console output gated behind a configurable toggle (off by default)

## File Structure
```
src/
  main.ts              # Plugin lifecycle — registers command, auto-trigger, settings tab
  settings.ts          # DEFAULT_SETTINGS, settings tab UI (rules CRUD, actions, debug toggle)
  types.ts             # FanoutRule, FanoutPluginSettings interfaces, fanoutLog helper
  parser.ts            # parseSections() — splits markdown by any header level
  fanout.ts            # executeFanout() — matches sections to rules, appends to targets
  trigger.ts           # Auto-trigger, manual fanout, batch folder fanout
  daily-note-utils.ts  # Daily note detection with Periodic Notes + core Daily Notes fallback
  ui/
    FileSuggest.ts     # AbstractInputSuggest for markdown file typeahead
    FolderSuggest.ts   # AbstractInputSuggest for folder typeahead
```

## Data Model

### FanoutRule
```ts
interface FanoutRule {
  id: string;                 // unique rule ID
  sourceHeader: string;       // full header line to match (e.g., "## Dreams")
  targetPath: string;         // vault path of target note (e.g., "Journal/Dream Journal.md")
  includeDateHeader: boolean; // if true, add [[backlink]] sub-header before content
  enabled: boolean;           // toggle individual rules on/off
}
```

### FanoutPluginSettings
```ts
interface FanoutPluginSettings {
  rules: FanoutRule[];
  headerLevel: number;        // legacy, parser now handles all levels
  processedDates: string[];   // ISO dates already processed (idempotency)
  debugLogging: boolean;      // toggle console output (default: false)
  skipIfAlreadyProcessed: boolean; // skip files with FanoutComplete property (default: true)
}
```

## Implemented (v1)

### 1. ✅ Types and settings interfaces (`types.ts`, `settings.ts`)
- `FanoutRule` and `FanoutPluginSettings` interfaces
- `DEFAULT_SETTINGS` with sensible defaults (debug logging off, empty rules)
- `fanoutLog()` shared logger gated by `debugLogging` setting
- `setDebugLogging()` to toggle at runtime

### 2. ✅ Settings tab UI (`settings.ts`)
- **Rules section**: styled card containers for each rule with:
  - Source header dropdown (populated from daily note template headings)
  - Target note typeahead file search (`FileSuggest`)
  - Include date header toggle
  - Enabled toggle + delete button
  - "Add rule" button
- **Actions section**:
  - "Run fanout" — distributes today's daily note
  - "Batch fanout from folder" — folder typeahead + run button, processes all files in folder
  - "Run fanout on a specific file" — file typeahead + run button
- **Advanced section**:
  - Debug logging toggle
  - Skip already processed files toggle (controls FanoutComplete check)

### 3. ✅ Section parser (`parser.ts`)
- `parseSections(content, headerLevel)` → `Map<string, string>`
- Splits markdown on **any header level** (`#{1,6}` regex)
- Keys are the full header line (e.g., `## Movies`)
- Empty/whitespace-only lines filtered from section bodies
- `getTemplateSections(app, headerLevel)` loads and parses the daily note template for diffing

### 4. ✅ Fanout engine (`fanout.ts`)
- `executeFanout(app, sections, rules, date, sourceNoteName, templateSections)` → count
- For each enabled rule: trims sourceHeader, looks up in sections map
- Skips empty sections and sections identical to the template
- Creates target note and parent folders if they don't exist (try/catch for existing folders)
- Appends content with one newline padding; optionally prepends `### [[sourceNoteName]]` backlink
- All logging via `fanoutLog()`

### 5. ✅ Trigger logic (`trigger.ts`)
- **Auto-trigger**: `vault.on("create")` detects new daily notes, processes the previous daily note
- `getLastDailyNote()` scans and sorts all daily notes by date using moment.js
- **Manual fanout**: `manualFanout()` finds today's note via `findTodaysDailyNote()` and processes it
- **Batch**: `batchFanoutFolder()` processes every markdown file in a folder, uses basename as date
- `runFanoutOnFile()` shared core that checks FanoutComplete frontmatter, loads template sections, calls `executeFanout`, and stamps FanoutComplete on success
- Idempotency: FanoutComplete frontmatter check (skippable via setting) + `processedDates` for auto-trigger

### 5b. ✅ Daily note detection (`daily-note-utils.ts`)
- `getEffectiveDailyNoteSettings(app)` — three-tier fallback for reading daily note config:
  1. Periodic Notes plugin (new Svelte store / calendar-set format)
  2. Periodic Notes plugin (legacy `settings.daily` format)
  3. Core Daily Notes plugin (via `obsidian-daily-notes-interface`)
- `findTodaysDailyNote(app)` — finds today's note by first trying the interface library, then manual vault scanning
- `getLastDailyNote(app)` — finds the previous daily note by scanning and date-sorting
- `isDailyNote(app, file)` — checks if a file matches the daily note format/folder
- `getDailyNoteDateStr(app, file)` — extracts the date string from a daily note path

### 6. ✅ Plugin entry point (`main.ts`)
- Minimal lifecycle: `onload` registers command, auto-trigger event, settings tab
- Initializes debug logging from saved settings
- `markProcessed()` with 90-day cap on stored dates

### 7. ✅ UI components (`ui/`)
- `FileSuggest` — `AbstractInputSuggest<TFile>` for markdown file typeahead search
- `FolderSuggest` — `AbstractInputSuggest<TFolder>` for folder typeahead search

### 8. ✅ FanoutComplete frontmatter stamping (`trigger.ts`)
- `hasFanoutComplete(content)` — checks if frontmatter contains `FanoutComplete:` property
- `stampFanoutComplete(app, file)` — adds or updates `FanoutComplete: YYYY-MM-DD` (local time) in frontmatter; creates frontmatter block if none exists
- `runFanoutOnFile()` checks for FanoutComplete before processing (respects `skipIfAlreadyProcessed` setting)
- "Skip already processed files" toggle in Advanced settings (default: on)

## Out of Scope (v2+)
- HTTP callouts (Home Assistant, etc.)
- Table/markdown entity appending
- Creating new notes (vs. appending to existing)
- Rule files (external config)
- Custom source notes (non-daily-note)
- Prepend mode
- Regex/pattern matching for headers
- Undo functionality
