
---

## Obsidian Plugin Development Skill Guide

This section documents real-world Obsidian API patterns, gotchas, and working code learned from building the Fanout plugin. Use this as a reference when building or modifying any Obsidian plugin.

### Plugin entry point pattern

```ts
import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, MySettingTab } from "./settings";
import type { MyPluginSettings } from "./types";

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "my-command",
      name: "Do something",
      callback: () => this.doSomething(),
    });

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        // handle new file
      }),
    );

    this.addSettingTab(new MySettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData() as Partial<MyPluginSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

### Settings tab with the Setting API

Use method chaining on `Setting` objects. Each call adds a control to the row:

```ts
import { App, PluginSettingTab, Setting, Notice } from "obsidian";

export class MySettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Toggle
    new Setting(containerEl)
      .setName("Enable feature")
      .setDesc("Turn this feature on or off")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    // Dropdown
    new Setting(containerEl)
      .setName("Choose level")
      .addDropdown(drop => {
        drop.addOption("h1", "Heading 1");
        drop.addOption("h2", "Heading 2");
        drop.setValue(this.plugin.settings.level);
        drop.onChange(async (value) => {
          this.plugin.settings.level = value;
          await this.plugin.saveSettings();
        });
      });

    // Text input
    new Setting(containerEl)
      .setName("File path")
      .addText(text => {
        text.setPlaceholder("Enter path…").setValue(this.plugin.settings.path);
        text.onChange(async (value) => {
          this.plugin.settings.path = value.trim();
          await this.plugin.saveSettings();
        });
      });

    // Button
    new Setting(containerEl)
      .setName("Run action")
      .addButton(btn =>
        btn.setButtonText("Run").setCta().onClick(() => {
          new Notice("Action executed!");
        })
      );
  }
}
```

### File and folder typeahead (AbstractInputSuggest)

This is the standard pattern for autocomplete inputs in settings. Not well-documented in official docs.

**FileSuggest** — autocomplete for markdown files:

```ts
import { AbstractInputSuggest, App, TFile } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
  private onSelect: (file: TFile) => void;

  constructor(app: App, inputEl: HTMLInputElement, onSelect: (file: TFile) => void) {
    super(app, inputEl);
    this.onSelect = onSelect;
  }

  getSuggestions(query: string): TFile[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getMarkdownFiles()
      .filter(f => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.setValue(file.path);
    this.onSelect(file);
    this.close();
  }
}
```

**FolderSuggest** — autocomplete for folders:

```ts
import { AbstractInputSuggest, App, TFolder } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private onSelect: (folder: TFolder) => void;

  constructor(app: App, inputEl: HTMLInputElement, onSelect: (folder: TFolder) => void) {
    super(app, inputEl);
    this.onSelect = onSelect;
  }

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    const folders: TFolder[] = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof TFolder && f.path.toLowerCase().includes(q)) {
        folders.push(f);
      }
    }
    return folders.sort((a, b) => a.path.localeCompare(b.path));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path || "/");
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.path);
    this.onSelect(folder);
    this.close();
  }
}
```

**Usage in settings** — attach to any `.addText()` input:

```ts
new Setting(containerEl)
  .setName("Target note")
  .addText(text => {
    text.setPlaceholder("Search for a note…").setValue(rule.targetPath);
    new FileSuggest(this.app, text.inputEl, (file) => {
      rule.targetPath = file.path;
      void this.plugin.saveSettings();
    });
  });
```

Key details:
- **Files**: use `app.vault.getMarkdownFiles()` — returns `TFile[]`
- **Folders**: use `app.vault.getAllLoadedFiles()` filtered by `instanceof TFolder`
- Constructor takes `(app, inputEl, callback)` — the inputEl comes from the Setting's text component

### Vault file operations

```ts
import { App, TFile, normalizePath } from "obsidian";

// Read a file
const content = await app.vault.read(file);

// Write/update a file
await app.vault.modify(file, newContent);

// Create a new file
const newFile = await app.vault.create(normalizePath("path/to/file.md"), "initial content");

// Create a folder — THROWS if it already exists, so always wrap in try/catch
try {
  await app.vault.createFolder("path/to/folder");
} catch {
  // folder already exists, that's fine
}

// Look up a file by path
const file = app.vault.getAbstractFileByPath("path/to/file.md");
if (file instanceof TFile) {
  // it's a file
}

// List all markdown files
const allFiles = app.vault.getMarkdownFiles();

// List all files and folders
const everything = app.vault.getAllLoadedFiles();
```

**Important**: always use `normalizePath()` from obsidian when constructing paths. Always check `instanceof TFile` or `instanceof TFolder` after `getAbstractFileByPath()`.

### Events and commands

```ts
// Vault events — file creation, modification, deletion
this.registerEvent(
  this.app.vault.on("create", (file) => { /* TAbstractFile */ })
);
this.registerEvent(
  this.app.vault.on("modify", (file) => { /* TAbstractFile */ })
);
this.registerEvent(
  this.app.vault.on("delete", (file) => { /* TAbstractFile */ })
);

// Workspace events — file open, layout change
this.registerEvent(
  this.app.workspace.on("file-open", (file) => { /* TFile | null */ })
);

// User-visible messages
new Notice("Something happened!");
new Notice("With a timeout", 5000); // 5 seconds

// moment.js is globally available (bundled by Obsidian, not importable)
const today = window.moment();
const formatted = window.moment().format("YYYY-MM-DD");
```

### Frontmatter (YAML) manipulation

Obsidian notes can have YAML frontmatter blocks. Here's how to read and modify them:

```ts
// Detect frontmatter
const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

// Check if a property exists
function hasProperty(content: string, propName: string): boolean {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;
  return new RegExp(`^${propName}\\s*:`, "m").test(fmMatch[1] ?? "");
}

// Add or update a property
async function setFrontmatterProp(app: App, file: TFile, key: string, value: string): Promise<void> {
  const content = await app.vault.read(file);
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);

  if (fmMatch) {
    const fmBody = fmMatch[2] ?? "";
    const propRegex = new RegExp(`^${key}\\s*:.*$`, "m");
    let newFmBody: string;
    if (propRegex.test(fmBody)) {
      newFmBody = fmBody.replace(propRegex, `${key}: ${value}`);
    } else {
      newFmBody = fmBody + `\n${key}: ${value}`;
    }
    const newContent = fmMatch[1] + newFmBody + fmMatch[3] + content.slice((fmMatch[0] ?? "").length);
    await app.vault.modify(file, newContent);
  } else {
    // No frontmatter — create one
    const newContent = `---\n${key}: ${value}\n---\n` + content;
    await app.vault.modify(file, newContent);
  }
}
```

Note: use `\r?\n` in regex to handle both Unix and Windows line endings.

### Daily Notes vs Periodic Notes — detection and fallback

This is critical and poorly documented. There are three possible sources for "daily note" configuration:

| Source | Plugin ID | How to access | Config fields |
|--------|-----------|---------------|---------------|
| Core Daily Notes | `daily-notes` | `(app as any).internalPlugins.getPluginById("daily-notes").instance.options` | `format`, `folder`, `template` |
| Periodic Notes (legacy) | `periodic-notes` | `(app as any).plugins.getPlugin("periodic-notes").settings.daily` | `format`, `folder`, `template`, `enabled` |
| Periodic Notes (new) | `periodic-notes` | `plugin.calendarSetManager.getActiveConfig("day")` | `format`, `folder`, `templatePath`, `enabled` |

**Key differences**:
- Core Daily Notes uses `template`; Periodic Notes (new) uses `templatePath`
- Periodic Notes stores settings in a Svelte writable store — accessing `.daily` directly returns `undefined`
- The npm package `obsidian-daily-notes-interface` only works with core Daily Notes and legacy Periodic Notes

**Recommended detection pattern** (3-tier fallback):

```ts
function getDailyNoteConfig(app: App): { format: string; folder: string; template: string } {
  try {
    const periodicNotes = (app as any).plugins?.getPlugin("periodic-notes");
    if (periodicNotes) {
      // Method 1: calendarSetManager API (newest Periodic Notes versions)
      if (periodicNotes.calendarSetManager) {
        try {
          const dayConfig = periodicNotes.calendarSetManager.getActiveConfig("day");
          if (dayConfig?.enabled) {
            return {
              format: dayConfig.format || "YYYY-MM-DD",
              folder: (dayConfig.folder ?? "").trim(),
              template: (dayConfig.templatePath ?? "").trim(),
            };
          }
        } catch { /* fallthrough */ }
      }

      // Method 2: Svelte store (intermediate versions)
      if (typeof periodicNotes.settings?.subscribe === "function") {
        let storeValue: any = null;
        const unsub = periodicNotes.settings.subscribe((val: any) => { storeValue = val; });
        if (typeof unsub === "function") unsub();

        if (storeValue?.calendarSets?.length > 0) {
          const activeSet = storeValue.calendarSets.find(
            (s: any) => s.id === storeValue.activeCalendarSet
          ) ?? storeValue.calendarSets[0];
          if (activeSet?.day?.enabled) {
            return {
              format: activeSet.day.format || "YYYY-MM-DD",
              folder: (activeSet.day.folder ?? "").trim(),
              template: (activeSet.day.templatePath ?? "").trim(),
            };
          }
        }
      }

      // Method 3: Legacy format (oldest Periodic Notes)
      if (periodicNotes.settings?.daily?.enabled) {
        return {
          format: periodicNotes.settings.daily.format || "YYYY-MM-DD",
          folder: (periodicNotes.settings.daily.folder ?? "").trim(),
          template: (periodicNotes.settings.daily.template ?? "").trim(),
        };
      }
    }
  } catch { /* fallthrough */ }

  // Fallback: core Daily Notes (via obsidian-daily-notes-interface or manual)
  const { internalPlugins } = app as any;
  const options = internalPlugins?.getPluginById("daily-notes")?.instance?.options ?? {};
  return {
    format: options.format || "YYYY-MM-DD",
    folder: (options.folder ?? "").trim(),
    template: (options.template ?? "").trim(),
  };
}
```

### Resolving template files

Template paths may be stored with or without `.md`, and different plugins resolve them differently. Use this 3-strategy approach:

```ts
import { App, TFile, normalizePath } from "obsidian";

function resolveTemplateFile(app: App, templatePath: string): TFile | null {
  if (!templatePath) return null;

  // 1. Direct path
  let file = app.vault.getAbstractFileByPath(templatePath);
  if (file instanceof TFile) return file;

  // 2. Append .md
  file = app.vault.getAbstractFileByPath(templatePath + ".md");
  if (file instanceof TFile) return file;

  // 3. Link resolution (how Periodic Notes resolves templates)
  try {
    const normalized = normalizePath(templatePath);
    const resolved = app.metadataCache.getFirstLinkpathDest(normalized, "");
    if (resolved instanceof TFile) return resolved;
  } catch { /* not available */ }

  return null;
}
```

`metadataCache.getFirstLinkpathDest()` handles wikilink-style resolution and is the most robust for templates configured in Periodic Notes.

### Accessing other plugins at runtime

```ts
// Community plugins (e.g., periodic-notes, calendar, dataview)
const plugin = (app as any).plugins?.getPlugin("periodic-notes");

// Core/internal plugins (e.g., daily-notes, templates)
const corePlugin = (app as any).internalPlugins?.getPluginById("daily-notes");
const isEnabled = corePlugin?.enabled; // boolean
const options = corePlugin?.instance?.options;

// Check if a community plugin exists
function hasPlugin(app: App, pluginId: string): boolean {
  return !!(app as any).plugins?.getPlugin(pluginId);
}
```

**Warning**: these APIs are not in the official `obsidian` type declarations, so you must cast to `any`. Community plugins may store settings in Svelte stores — use the subscribe/unsubscribe pattern to read them synchronously.

### esbuild configuration (reference)

```js
// esbuild.config.mjs
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtinModules,
  ],
  format: "cjs",       // Must be CommonJS, not ESM
  target: "es2018",    // Obsidian's minimum ES target
  outfile: "main.js",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

Key requirements:
- **`format: "cjs"`** — Obsidian loads plugins as CommonJS, not ESM
- **`target: "es2018"`** — minimum ES version for Obsidian compatibility
- **externals** — `obsidian`, `electron`, all `@codemirror/*`, and Node builtins must be excluded from the bundle
- Use `"type": "module"` in package.json so the config file itself can use top-level await

### Conditional debug logging pattern

Gate all console.log behind a setting so users can toggle verbose output:

```ts
// types.ts
let _debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
  _debugEnabled = enabled;
}

export function myLog(...args: unknown[]): void {
  if (_debugEnabled) {
    console.log("[MyPlugin]", ...args);
  }
}
```

Initialize in `onload()`:

```ts
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  setDebugLogging(this.settings.debugLogging);
}
```
