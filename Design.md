# Fanout — Design Document

## What

Fanout is an Obsidian plugin that lets you write everything in your daily note and automatically distributes sections to other notes in your vault. You edit one place — the daily note — and Fanout copies the content under each header to the notes you specify.

## Why

Daily notes are a natural capture point for thoughts, dreams, ideas, habits, and media tracking. But spreading that information across dedicated journals and trackers is tedious. Fanout automates the distribution so you can focus on writing.

## How it works

1. You write your daily note using headers to organize sections (e.g., `# Dreams`, `## Movies`, `# 💡Ideas`).
2. You configure **rules** in Fanout's settings — each rule maps a header to a target note.
3. When triggered, Fanout parses the daily note by headers, matches each section to its rule, and appends the content to the target note.

### Section parsing

- Fanout splits on **any header level** (`#` through `######`).
- Each header becomes a section key; the body is all content until the next header.
- Empty lines and whitespace-only lines are stripped from section bodies.
- If a section's body is identical to the daily note template's default content, it is skipped (no copy for unchanged sections).

### Rules

Each rule has:
- **Source header** — selected from a dropdown populated from the daily note template headings.
- **Target note** — selected via a typeahead file search (`AbstractInputSuggest`).
- **Include date header** — optional toggle that prepends a `### [[YYYY-MM-DD]]` backlink to the source daily note above the copied content.
- **Enabled** — toggle to activate/deactivate individual rules.

### Triggers

- **Auto-trigger** — when a new daily note is created (`vault.on("create")`), Fanout processes the previous daily note.
- **Manual command** — "Fanout: Distribute daily note" from the command palette processes today's note.
- **Run fanout button** — in settings, runs fanout on today's note.
- **Single file** — in settings, pick any file and run fanout on it.
- **Batch from folder** — in settings, pick a folder and run fanout on every markdown file in it.

### Append behavior

- Content is appended to the **end** of the target note.
- A single newline is added before the appended content as padding.
- If the target note does not exist, it is created (along with any missing parent folders).
- If the `include date header` option is on, a `### [[filename]]` backlink header is inserted before the content.

### Idempotency

Fanout uses two layers of duplicate prevention:

1. **FanoutComplete frontmatter** (primary) — After a successful fanout, the source file gets a `FanoutComplete: YYYY-MM-DD` property in its frontmatter (using local time). Before processing any file, Fanout checks for this property and skips the file if present. This can be overridden via the "Skip already processed files" toggle in settings (on by default).
2. **processedDates list** (auto-trigger only) — Processed daily note dates are tracked in plugin settings. A date won't be auto-processed twice. The list is capped at 90 entries to prevent unbounded growth.

### Daily note detection

Fanout supports multiple daily note sources with automatic fallback:

1. **Periodic Notes plugin** (new calendar-set format) — if the Periodic Notes community plugin is installed and has a daily note config enabled in its active calendar set, Fanout reads format/folder/template from there. This handles the newer Svelte-store-based settings that the Periodic Notes plugin uses.
2. **Periodic Notes plugin** (legacy format) — if the plugin uses the older flat `settings.daily` structure, Fanout reads from that.
3. **Core Daily Notes plugin** — if neither Periodic Notes format is available, Fanout falls back to the built-in Daily Notes plugin via `obsidian-daily-notes-interface`.

This means users can use either the core Daily Notes or the Periodic Notes plugin — Fanout will detect and use whichever is active.

## Use cases

- Dreams → Dream journal
- Daily resolution / habit tracking
- Ideas for videos, projects, etc.
- Time tracking for projects
- Pokemon pack openings → collection tracker
- Task tracking from todo lists
- Movies, books, games stats → media logs
- Features to implement → project backlogs

## Future (v2+)

- HTTP callouts with payload from section data (e.g., Home Assistant dashboards)
- Append to a table or other markdown entity
- Create new notes instead of appending
- Rule files (external YAML/JSON config)
- Custom source notes (not just daily notes)
- Prepend mode
- Regex/pattern matching for headers
- Undo functionality
