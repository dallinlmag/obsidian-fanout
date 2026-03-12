# Fanout Plugin — Implementation Plan

## Problem
Users want to write everything in their daily note and have the plugin automatically distribute (fan out) sections to other notes in the vault based on configurable rules.

## Approach
Build a focused v1 with: section parsing by header level, rule-based distribution via the settings UI, two trigger modes (auto on new daily note creation + manual command), and configurable append behavior (end of file, optional date sub-header).

## Design Decisions
- **Rules defined in plugin settings tab** — add/edit/delete rules via Obsidian's settings UI (persisted with `saveData`)
- **Source header selection** — dropdown populated from the daily note template headings (falls back to free-text if no template)
- **Default header level: `##` (h2)** — configurable globally in settings (1–6)
- **Triggers**: auto-trigger when a new daily note is created + manual command palette command ("Fanout: Distribute daily note")
- **Append behavior per rule**: append to end of target note (default), optionally prepend a date sub-header (e.g., `### 2026-03-12`)
- **Daily note detection**: uses `obsidian-daily-notes-interface` package (same approach as obsidian-rollover-daily-todos) for reliable daily note finding, supporting both core Daily Notes and Periodic Notes plugins
- **Idempotency**: track which daily notes have been processed to avoid duplicate fanout (capped at 90 days)

## File Structure
```
src/
  main.ts         # Plugin lifecycle — minimal, registers commands/events
  settings.ts     # FanoutPluginSettings defaults, settings tab UI with template header dropdown
  types.ts        # FanoutRule, FanoutPluginSettings interfaces
  parser.ts       # Parse a note's markdown into sections by header level
  fanout.ts       # Core logic: apply rules to parsed sections, write to targets
  trigger.ts      # Auto-trigger on daily note create, manual fanout, daily note detection
```

## Data Model

### FanoutRule
```ts
interface FanoutRule {
  id: string;                 // unique rule ID
  sourceHeader: string;       // full header line to match (e.g., "## Dreams")
  targetPath: string;         // vault path of target note (e.g., "Journal/Dream Journal.md")
  includeDateHeader: boolean; // if true, add date as sub-header before content
  enabled: boolean;           // toggle individual rules on/off
}
```

### FanoutPluginSettings
```ts
interface FanoutPluginSettings {
  rules: FanoutRule[];
  headerLevel: number;        // default 2 (##), configurable 1–6
  processedDates: string[];   // ISO dates already processed (idempotency)
}
```

## Completed (v1)

### 1. ✅ Define types and settings interfaces (`types.ts`, `settings.ts`)
- Created `FanoutRule` and `FanoutPluginSettings` interfaces
- Defined `DEFAULT_SETTINGS` with sensible defaults

### 2. ✅ Build the settings tab UI (`settings.ts`)
- Global settings: header level dropdown (1–6)
- Rules list: display existing rules with edit/delete in styled card containers
- "Add rule" button that creates new rules
- Each rule has: source header (dropdown from template + custom option), target note path, include date toggle, enabled toggle, delete button
- Persist on change via `saveSettings()`

### 3. ✅ Implement section parser (`parser.ts`)
- `parseSections(content, headerLevel)` → `Map<string, string>`
- Splits markdown by the specified header level
- Returns map of full header line → section body content
- Handles edge cases: no headers, content before first header, nested headers

### 4. ✅ Implement fanout engine (`fanout.ts`)
- `executeFanout(app, sections, rules, date)` → count of sections distributed
- For each enabled rule, finds matching section by `sourceHeader`
- Reads target note (creates with parent folders if needed)
- Appends content with optional date sub-header (`### YYYY-MM-DD`)

### 5. ✅ Implement trigger logic (`trigger.ts`)
- Auto-trigger: listens for `vault.on("create")` events, detects new daily notes
- Uses `obsidian-daily-notes-interface` (`getDailyNoteSettings`, `getAllDailyNotes`, `getDailyNote`) for reliable daily note finding
- Finds previous daily note by scanning and sorting all daily notes by date
- Checks if previous day's note has already been processed (using `processedDates`)
- Manual fanout: finds today's daily note via `getDailyNote` and processes it

### 6. ✅ Wire up main.ts (`main.ts`)
- Stripped all sample/placeholder code
- Registered manual command: "Fanout: Distribute daily note"
- Registered auto-trigger event listener (vault create)
- Registered settings tab
- Added `markProcessed` with 90-day cap on stored dates

### 7. ✅ Add template header dropdown to settings
- Reads the daily note template file path from `getDailyNoteSettings()`
- Extracts all headings via regex `/#{1,} .*/g`
- Populates the source header dropdown with template headings
- Falls back to free-text input for custom headers not in the template

### 8. ✅ Use obsidian-daily-notes-interface for daily note detection
- Installed `obsidian-daily-notes-interface` as a dependency
- Replaced manual path construction with library functions
- Supports both core Daily Notes and Periodic Notes plugin configurations
- Handles custom date formats and folder paths

### 9. ✅ Build and verify
- `npm run build` passes cleanly
- All TypeScript compiles without errors

## Out of Scope (v2+)
- HTTP callouts (Home Assistant, etc.)
- Table/markdown entity appending
- Creating new notes (vs. appending to existing)
- Rule files (external config)
- Custom source notes (non-daily-note)
- Prepend mode
- Regex/pattern matching for headers
- Undo functionality
