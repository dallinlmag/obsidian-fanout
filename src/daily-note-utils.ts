import {App, normalizePath, TFile} from "obsidian";
import {getDailyNoteSettings, getAllDailyNotes, getDailyNote} from "obsidian-daily-notes-interface";
import {fanoutLog} from "./types";

declare global {
	interface Window {
		moment: typeof import("moment");
	}
}

export interface DailyNoteConfig {
	format: string;
	folder: string;
	template: string;
}

/**
 * Get daily note settings, checking multiple sources in order:
 * 1. Periodic Notes plugin — calendarSetManager API (most reliable)
 * 2. Periodic Notes plugin — Svelte store reading (fallback)
 * 3. Periodic Notes plugin — legacy settings.daily format
 * 4. Core Daily Notes plugin (via obsidian-daily-notes-interface)
 */
export function getEffectiveDailyNoteSettings(app: App): DailyNoteConfig {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const periodicNotes = (app as any).plugins?.getPlugin("periodic-notes");
		if (periodicNotes) {
			fanoutLog("Periodic Notes plugin found, reading settings...");

			// Method 1: Use the calendarSetManager public API (most reliable for newer versions)
			if (periodicNotes.calendarSetManager) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const dayConfig = periodicNotes.calendarSetManager.getActiveConfig("day") as any;
					if (dayConfig?.enabled) {
						const config: DailyNoteConfig = {
							format: dayConfig.format || "YYYY-MM-DD",
							folder: (dayConfig.folder ?? "").trim(),
							template: (dayConfig.templatePath ?? "").trim(),
						};
						fanoutLog(`Using Periodic Notes (calendarSetManager): format="${config.format}", folder="${config.folder}", template="${config.template}"`);
						return config;
					}
					fanoutLog("Periodic Notes calendarSetManager: daily notes not enabled in active set");
				} catch (e) {
					fanoutLog(`calendarSetManager.getActiveConfig failed: ${e}`);
				}
			}

			// Method 2: Read from Svelte writable store directly
			if (typeof periodicNotes.settings?.subscribe === "function") {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let storeValue: any = null;
				const unsub = periodicNotes.settings.subscribe(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(val: any) => { storeValue = val; }
				);
				if (typeof unsub === "function") unsub();

				if (storeValue?.calendarSets?.length > 0) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const activeSet = storeValue.calendarSets.find(
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(s: any) => s.id === storeValue.activeCalendarSet
					) ?? storeValue.calendarSets[0];

					const dayConfig = activeSet?.day;
					if (dayConfig?.enabled) {
						const config: DailyNoteConfig = {
							format: dayConfig.format || "YYYY-MM-DD",
							folder: (dayConfig.folder ?? "").trim(),
							template: (dayConfig.templatePath ?? "").trim(),
						};
						fanoutLog(`Using Periodic Notes (Svelte store, set "${activeSet.id}"): format="${config.format}", folder="${config.folder}", template="${config.template}"`);
						return config;
					}
				}
			}

			// Method 3: Legacy periodic notes format (settings.daily is a plain object)
			const legacyDaily = periodicNotes.settings?.daily;
			if (legacyDaily?.enabled) {
				const config: DailyNoteConfig = {
					format: legacyDaily.format || "YYYY-MM-DD",
					folder: (legacyDaily.folder ?? "").trim(),
					template: (legacyDaily.template ?? "").trim(),
				};
				fanoutLog(`Using Periodic Notes (legacy): format="${config.format}", folder="${config.folder}", template="${config.template}"`);
				return config;
			}

			fanoutLog("Periodic Notes plugin found but no enabled daily config detected");
		}
	} catch (err) {
		fanoutLog(`Error reading Periodic Notes settings: ${err}`);
	}

	// Fallback: core Daily Notes plugin via obsidian-daily-notes-interface
	const dnSettings = getDailyNoteSettings();
	const config: DailyNoteConfig = {
		format: dnSettings.format || "YYYY-MM-DD",
		folder: (dnSettings.folder ?? "").trim(),
		template: (dnSettings.template ?? "").trim(),
	};
	fanoutLog(`Using core Daily Notes: format="${config.format}", folder="${config.folder}", template="${config.template}"`);
	return config;
}

/**
 * Resolve a template path to a TFile, trying multiple strategies:
 * 1. Direct path lookup (getAbstractFileByPath)
 * 2. With .md extension appended
 * 3. Via metadataCache.getFirstLinkpathDest (how Periodic Notes resolves templates)
 */
export function resolveTemplateFile(app: App, templatePath: string): TFile | null {
	if (!templatePath) return null;

	// Strategy 1: direct path lookup
	let file = app.vault.getAbstractFileByPath(templatePath);
	if (file instanceof TFile) {
		fanoutLog(`Template resolved (direct): "${file.path}"`);
		return file;
	}

	// Strategy 2: append .md
	file = app.vault.getAbstractFileByPath(templatePath + ".md");
	if (file instanceof TFile) {
		fanoutLog(`Template resolved (with .md): "${file.path}"`);
		return file;
	}

	// Strategy 3: use metadataCache link resolution (how Periodic Notes does it)
	try {
		const normalized = normalizePath(templatePath);
		const resolved = app.metadataCache.getFirstLinkpathDest(normalized, "");
		if (resolved instanceof TFile) {
			fanoutLog(`Template resolved (metadataCache): "${resolved.path}"`);
			return resolved;
		}
	} catch {
		// metadataCache approach not available
	}

	fanoutLog(`Template NOT found for path: "${templatePath}"`);
	return null;
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
 * Build a regex that matches daily note file paths and extracts the date part.
 */
function buildDailyNoteRegex(folder: string): RegExp {
	const cleanedFolder = cleanFolder(folder);
	const prefix = cleanedFolder.length === 0 ? "" : cleanedFolder + "/";
	return new RegExp(
		"^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(.*)\\.md$"
	);
}

/**
 * Find today's daily note by scanning the vault.
 */
export function findTodaysDailyNote(app: App): TFile | null {
	const {moment} = window;

	// First try the obsidian-daily-notes-interface (works with legacy periodic notes + core daily notes)
	try {
		const allDailyNotes = getAllDailyNotes();
		const todayFile = getDailyNote(moment(), allDailyNotes) as TFile | null;
		if (todayFile) return todayFile;
	} catch {
		// Fall through to manual scanning
	}

	// Manual scan using our effective settings (handles new periodic notes format)
	const config = getEffectiveDailyNoteSettings(app);
	const regex = buildDailyNoteRegex(config.folder);
	const todayMoment = moment();
	const cleanedFolder = cleanFolder(config.folder);
	const prefix = cleanedFolder.length === 0 ? "" : cleanedFolder + "/";

	const match = app.vault
		.getMarkdownFiles()
		.filter(f => prefix === "" || f.path.startsWith(prefix))
		.find(f => {
			const m = f.path.match(regex);
			if (!m) return false;
			const parsed = moment(m[1], config.format, true);
			return parsed.isValid() && parsed.isSame(todayMoment, "day");
		});

	return match ?? null;
}

/**
 * Get the most recent daily note before today by scanning all daily notes.
 */
export function getLastDailyNote(app: App): TFile | undefined {
	const {moment} = window;
	const config = getEffectiveDailyNoteSettings(app);
	const cleanedFolder = cleanFolder(config.folder);
	const prefix = cleanedFolder.length === 0 ? "" : cleanedFolder + "/";
	const dailyNoteRegex = buildDailyNoteRegex(config.folder);
	const todayMoment = moment();

	const dailyNoteFiles = app.vault
		.getMarkdownFiles()
		.filter((file) => file.path.startsWith(prefix) || prefix === "")
		.filter((file) => {
			const match = file.path.match(dailyNoteRegex);
			return match && moment(match[1], config.format, true).isValid();
		})
		.filter((file) => {
			const match = file.path.match(dailyNoteRegex);
			return match && moment(match[1], config.format, true).isSameOrBefore(todayMoment, "day");
		});

	const sorted = dailyNoteFiles.sort((a, b) => {
		const matchA = a.path.match(dailyNoteRegex);
		const matchB = b.path.match(dailyNoteRegex);
		const dateA = matchA ? moment(matchA[1], config.format, true) : moment(0);
		const dateB = matchB ? moment(matchB[1], config.format, true) : moment(0);
		return dateB.valueOf() - dateA.valueOf();
	});

	return sorted[1];
}

/**
 * Check if a file matches the daily note format and folder.
 */
export function isDailyNote(app: App, file: TFile): boolean {
	const {moment} = window;
	const config = getEffectiveDailyNoteSettings(app);
	const regex = buildDailyNoteRegex(config.folder);
	const match = file.path.match(regex);
	return !!match && moment(match[1], config.format, true).isValid();
}

/**
 * Extract the date string from a daily note file path.
 */
export function getDailyNoteDateStr(app: App, file: TFile): string | null {
	const {moment} = window;
	const config = getEffectiveDailyNoteSettings(app);
	const regex = buildDailyNoteRegex(config.folder);
	const match = file.path.match(regex);
	if (!match) return null;
	const parsed = moment(match[1], config.format, true);
	if (!parsed.isValid()) return null;
	return parsed.format("YYYY-MM-DD");
}
