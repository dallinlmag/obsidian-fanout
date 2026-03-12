import {App, TFile} from "obsidian";
import {getDailyNoteSettings} from "obsidian-daily-notes-interface";
import {fanoutLog} from "./types";

/**
 * Parse markdown content into sections split by ANY header level.
 * Returns a map of the full header line (e.g., "## Movies") to body content.
 * Empty/whitespace-only lines are removed from section bodies.
 */

function filterEmptyLines(lines: string[]): string {
	return lines.filter(line => line.trim().length > 0).join("\n").trim();
}

export function parseSections(content: string, _headerLevel: number): Map<string, string> {
	const sections = new Map<string, string>();
	const lines = content.split("\n");

	fanoutLog(`Parsing sections (all header levels)`);
	fanoutLog(`Total lines in source note: ${lines.length}`);

	let currentHeader: string | null = null;
	let currentBody: string[] = [];

	for (const line of lines) {
		const headerMatch = line.match(/^(#{1,6})\s+\S/);
		if (headerMatch) {
			if (currentHeader !== null) {
				sections.set(currentHeader, filterEmptyLines(currentBody));
			}
			currentHeader = line.trim();
			fanoutLog(`Found header: "${currentHeader}"`);
			currentBody = [];
		} else if (currentHeader !== null) {
			currentBody.push(line);
		}
	}

	if (currentHeader !== null) {
		sections.set(currentHeader, filterEmptyLines(currentBody));
	}

	fanoutLog(`Parsed ${sections.size} section(s):`);
	for (const [header, body] of sections) {
		fanoutLog(`  "${header}" → ${body.length} chars, body: "${body.substring(0, 80)}${body.length > 80 ? "…" : ""}"`);
	}

	return sections;
}

/**
 * Load and parse the daily note template to get its default section bodies.
 */
export async function getTemplateSections(app: App, headerLevel: number): Promise<Map<string, string>> {
	const {template} = getDailyNoteSettings();
	if (!template) return new Map();

	let file = app.vault.getAbstractFileByPath(template);
	if (!file) {
		file = app.vault.getAbstractFileByPath(template + ".md");
	}
	if (!file || !(file instanceof TFile)) return new Map();

	const content = await app.vault.read(file);
	fanoutLog(`Loaded template: "${(file as TFile).path}"`);
	return parseSections(content, headerLevel);
}
