import {App, TFile, Notice} from "obsidian";
import type {FanoutPluginSettings} from "./types";
import {fanoutLog} from "./types";
import {parseSections, getTemplateSections} from "./parser";
import {executeFanout} from "./fanout";
import {
	findTodaysDailyNote,
	getLastDailyNote,
	isDailyNote,
	getDailyNoteDateStr,
} from "./daily-note-utils";

/**
 * Check if a file has the FanoutComplete frontmatter property.
 */
function hasFanoutComplete(content: string): boolean {
	const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fmMatch) return false;
	return /^FanoutComplete\s*:/m.test(fmMatch[1] ?? "");
}

/**
 * Add or update the FanoutComplete frontmatter property with today's date.
 */
async function stampFanoutComplete(app: App, file: TFile): Promise<void> {
	const content = await app.vault.read(file);
	const now = new Date();
	const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);

	if (fmMatch) {
		const fmBody = fmMatch[2] ?? "";
		let newFmBody: string;
		if (/^FanoutComplete\s*:/m.test(fmBody)) {
			newFmBody = fmBody.replace(/^FanoutComplete\s*:.*$/m, `FanoutComplete: ${today}`);
		} else {
			newFmBody = fmBody + `\nFanoutComplete: ${today}`;
		}
		const newContent = fmMatch[1] + newFmBody + fmMatch[3] + content.slice((fmMatch[0] ?? "").length);
		await app.vault.modify(file, newContent);
	} else {
		const newContent = `---\nFanoutComplete: ${today}\n---\n` + content;
		await app.vault.modify(file, newContent);
	}
	fanoutLog(`Stamped FanoutComplete: ${today} on "${file.path}"`);
}

/**
 * Run fanout on a specific daily note file.
 */
export async function runFanoutOnFile(
	app: App,
	file: TFile,
	settings: FanoutPluginSettings,
	date: string,
): Promise<number> {
	const content = await app.vault.read(file);

	// Check for FanoutComplete property
	if (settings.skipIfAlreadyProcessed && hasFanoutComplete(content)) {
		fanoutLog(`Skipping "${file.path}" — already has FanoutComplete property`);
		return 0;
	}

	const sections = parseSections(content, settings.headerLevel);

	if (sections.size === 0) {
		return 0;
	}

	const enabledRules = settings.rules.filter(r => r.enabled && r.sourceHeader && r.targetPath);
	if (enabledRules.length === 0) {
		return 0;
	}

	const templateSections = await getTemplateSections(app, settings.headerLevel);
	const count = await executeFanout(app, sections, enabledRules, date, file.basename, templateSections);

	if (count > 0) {
		await stampFanoutComplete(app, file);
	}

	return count;
}

/**
 * Auto-trigger: when a new daily note is created, process the previous daily note.
 */
export async function autoTriggerOnCreate(
	app: App,
	createdFile: TFile,
	settings: FanoutPluginSettings,
	markProcessed: (date: string) => Promise<void>,
): Promise<void> {
	// Check if created file is a daily note
	if (!isDailyNote(app, createdFile)) return;

	// Find the previous daily note
	const lastNote = getLastDailyNote(app);
	if (!lastNote) return;

	// Derive the date string from the previous daily note
	const dateStr = getDailyNoteDateStr(app, lastNote);
	if (!dateStr) return;

	// Skip if already processed
	if (settings.processedDates.includes(dateStr)) return;

	const count = await runFanoutOnFile(app, lastNote, settings, dateStr);
	if (count > 0) {
		await markProcessed(dateStr);
		new Notice(`Fanout: distributed ${count} section(s) from the previous daily note.`);
	}
}

/**
 * Manually run fanout on today's daily note.
 */
export async function manualFanout(
	app: App,
	settings: FanoutPluginSettings,
	markProcessed: (date: string) => Promise<void>,
): Promise<void> {
	const {moment} = window;
	const todayMoment = moment();

	const todayFile = findTodaysDailyNote(app);

	if (!todayFile) {
		new Notice("Fanout: could not find today's daily note.");
		return;
	}

	const dateStr = todayMoment.format("YYYY-MM-DD");
	const count = await runFanoutOnFile(app, todayFile, settings, dateStr);
	if (count > 0) {
		await markProcessed(dateStr);
		new Notice(`Fanout: distributed ${count} section(s) from today's note.`);
	} else {
		new Notice("Fanout: no matching sections found or no rules configured.");
	}
}

/**
 * Run fanout on every markdown file in a given folder.
 * Skips files where no matching headers are found.
 */
export async function batchFanoutFolder(
	app: App,
	folderPath: string,
	settings: FanoutPluginSettings,
): Promise<void> {
	const normalizedFolder = folderPath.replace(/\/+$/, "");
	const files = app.vault.getMarkdownFiles()
		.filter(f => {
			if (normalizedFolder === "") return !f.path.includes("/");
			return f.path.startsWith(normalizedFolder + "/");
		})
		.sort((a, b) => a.path.localeCompare(b.path));

	if (files.length === 0) {
		new Notice(`Fanout: no markdown files found in "${folderPath}".`);
		return;
	}

	fanoutLog(`Batch: processing ${files.length} file(s) in "${folderPath}"`);
	let totalApplied = 0;
	let filesProcessed = 0;

	for (const file of files) {
		const dateStr = file.basename;
		fanoutLog(`Batch: processing "${file.path}"`);
		const count = await runFanoutOnFile(app, file, settings, dateStr);
		if (count > 0) {
			totalApplied += count;
			filesProcessed++;
		}
	}

	new Notice(`Fanout: distributed ${totalApplied} section(s) from ${filesProcessed} file(s).`);
}
