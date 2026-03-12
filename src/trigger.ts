import {App, TFile, Notice} from "obsidian";
import {
	getDailyNoteSettings,
	getAllDailyNotes,
	getDailyNote,
} from "obsidian-daily-notes-interface";
import type {FanoutPluginSettings} from "./types";
import {fanoutLog} from "./types";
import {parseSections, getTemplateSections} from "./parser";
import {executeFanout} from "./fanout";

declare global {
	interface Window {
		moment: typeof import("moment");
	}
}

/**
 * Clean folder path: strip leading/trailing slashes.
 */
function cleanFolder(folder: string): string {
	if (folder.startsWith("/")) folder = folder.substring(1);
	if (folder.endsWith("/")) folder = folder.substring(0, folder.length - 1);
	return folder;
}

/**
 * Get the most recent daily note before today by scanning all daily notes.
 */
function getLastDailyNote(app: App): TFile | undefined {
	const {moment} = window;
	const {folder, format} = getDailyNoteSettings();
	const cleanedFolder = cleanFolder(folder ?? "");
	const prefix = cleanedFolder.length === 0 ? "" : cleanedFolder + "/";
	const dailyNoteRegex = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(.*)\\.md$");
	const todayMoment = moment();

	const dailyNoteFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(prefix) || prefix === "")
		.filter((file) => {
			const match = file.path.match(dailyNoteRegex);
			return match && moment(match[1], format, true).isValid();
		})
		.filter((file) => {
			const match = file.path.match(dailyNoteRegex);
			return match && moment(match[1], format, true).isSameOrBefore(todayMoment, "day");
		});

	const sorted = dailyNoteFiles.sort((a, b) => {
		const matchA = a.path.match(dailyNoteRegex);
		const matchB = b.path.match(dailyNoteRegex);
		const dateA = matchA ? moment(matchA[1], format, true) : moment(0);
		const dateB = matchB ? moment(matchB[1], format, true) : moment(0);
		return dateB.valueOf() - dateA.valueOf();
	});

	// sorted[0] is today (or the most recent), sorted[1] is the previous one
	return sorted[1];
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
	const sections = parseSections(content, settings.headerLevel);

	if (sections.size === 0) {
		return 0;
	}

	const enabledRules = settings.rules.filter(r => r.enabled && r.sourceHeader && r.targetPath);
	if (enabledRules.length === 0) {
		return 0;
	}

	const templateSections = await getTemplateSections(app, settings.headerLevel);
	return executeFanout(app, sections, enabledRules, date, file.basename, templateSections);
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
	const {moment} = window;
	const {folder, format} = getDailyNoteSettings();
	const cleanedFolder = cleanFolder(folder ?? "");
	const prefix = cleanedFolder.length === 0 ? "" : cleanedFolder + "/";

	// Check if created file is in the daily notes folder
	if (prefix && !createdFile.path.startsWith(prefix)) return;

	// Check if the file matches the daily note format
	const regex = new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(.*)\\.md$");
	const match = createdFile.path.match(regex);
	if (!match || !moment(match[1], format, true).isValid()) return;

	// Find the previous daily note
	const lastNote = getLastDailyNote(app);
	if (!lastNote) return;

	// Derive the date string from the previous daily note's filename
	const lastMatch = lastNote.path.match(regex);
	if (!lastMatch) return;
	const lastDateMoment = moment(lastMatch[1], format, true);
	const dateStr = lastDateMoment.format("YYYY-MM-DD");

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

	// Use getDailyNote from the interface to reliably find today's note
	const allDailyNotes = getAllDailyNotes();
	const todayFile = getDailyNote(todayMoment, allDailyNotes) as TFile | null;

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
