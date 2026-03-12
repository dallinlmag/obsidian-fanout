import {App, TFile, Notice, normalizePath} from "obsidian";
import type {FanoutRule} from "./types";
import {fanoutLog} from "./types";

/**
 * Execute fanout: apply rules to parsed sections and append content to target notes.
 */
export async function executeFanout(
	app: App,
	sections: Map<string, string>,
	rules: FanoutRule[],
	date: string,
	sourceNoteName: string,
	templateSections: Map<string, string>,
): Promise<number> {
	let applied = 0;

	for (const rule of rules) {
		if (!rule.enabled) {
			fanoutLog(`Rule "${rule.sourceHeader}" → "${rule.targetPath}" is disabled, skipping`);
			continue;
		}

		const trimmedSourceHeader = rule.sourceHeader.trim();
		fanoutLog(`Processing rule: "${trimmedSourceHeader}" → "${rule.targetPath}"`);

		const body = sections.get(trimmedSourceHeader);
		if (body === undefined) {
			fanoutLog(`  ❌ No section found matching "${trimmedSourceHeader}"`);
			fanoutLog(`  Available sections: ${[...sections.keys()].map(k => `"${k}"`).join(", ")}`);
			continue;
		}
		if (body.length === 0) {
			fanoutLog(`  ⚠ Section "${trimmedSourceHeader}" is empty, skipping`);
			continue;
		}

		fanoutLog(`  ✓ Matched section, body length: ${body.length}`);

		const templateBody = templateSections.get(trimmedSourceHeader);
		if (templateBody !== undefined && body === templateBody) {
			fanoutLog(`  ⚠ Section matches template exactly, skipping`);
			continue;
		}

		const targetPath = normalizePath(rule.targetPath);
		let targetFile = app.vault.getAbstractFileByPath(targetPath);

		if (!targetFile) {
			fanoutLog(`  Target "${targetPath}" does not exist, creating…`);
			const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
			if (dir) {
				try {
					await app.vault.createFolder(dir);
					fanoutLog(`  Created folder: "${dir}"`);
				} catch {
					fanoutLog(`  Folder "${dir}" already exists`);
				}
			}
			targetFile = await app.vault.create(targetPath, "");
			fanoutLog(`  Created file: "${targetPath}"`);
		} else {
			fanoutLog(`  Target file exists: "${targetPath}"`);
		}

		if (!(targetFile instanceof TFile)) {
			new Notice(`Fanout: "${targetPath}" is not a file, skipping rule.`);
			continue;
		}

		const existing = await app.vault.read(targetFile);
		const parts: string[] = [];

		if (rule.includeDateHeader) {
			parts.push(`### [[${sourceNoteName}]]`);
		}

		parts.push(body);

		const appendText = "\n" + parts.join("\n");
		fanoutLog(`  Appending ${appendText.length} chars to "${targetPath}"`);
		await app.vault.modify(targetFile, existing + appendText);
		fanoutLog(`  ✓ Done writing to "${targetPath}"`);
		applied++;
	}

	return applied;
}
