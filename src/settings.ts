import {App, Notice, PluginSettingTab, Setting, TFile} from "obsidian";
import {getDailyNoteSettings} from "obsidian-daily-notes-interface";
import type FanoutPlugin from "./main";
import type {FanoutPluginSettings, FanoutRule} from "./types";
import {setDebugLogging} from "./types";
import {FileSuggest} from "./ui/FileSuggest";
import {FolderSuggest} from "./ui/FolderSuggest";
import {manualFanout, batchFanoutFolder} from "./trigger";

export const DEFAULT_SETTINGS: FanoutPluginSettings = {
	rules: [],
	headerLevel: 2,
	processedDates: [],
	debugLogging: false,
};

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class FanoutSettingTab extends PluginSettingTab {
	plugin: FanoutPlugin;
	private templateHeadings: string[] = [];

	constructor(app: App, plugin: FanoutPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Read headings from the daily note template file (same approach as obsidian-rollover-daily-todos).
	 */
	private async getTemplateHeadings(): Promise<string[]> {
		const {template} = getDailyNoteSettings();
		if (!template) return [];

		let file = this.app.vault.getAbstractFileByPath(template);
		if (!file) {
			file = this.app.vault.getAbstractFileByPath(template + ".md");
		}
		if (!file || !(file instanceof TFile)) return [];

		const templateContents = await this.app.vault.read(file);
		const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
			([heading]) => heading,
		);
		return allHeadings;
	}

	async display(): Promise<void> {
		this.templateHeadings = await this.getTemplateHeadings();

		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl("h2", {text: "Fanout settings"});

		containerEl.createEl("h3", {text: "Rules"});
		containerEl.createEl("p", {
			text: "Each rule maps a header in your daily note to a target note.",
			cls: "setting-item-description",
		});

		for (const rule of this.plugin.settings.rules) {
			this.renderRule(containerEl, rule);
		}

		new Setting(containerEl)
			.addButton(btn =>
				btn.setButtonText("Add rule").setCta().onClick(async () => {
					const newRule: FanoutRule = {
						id: generateId(),
						sourceHeader: "",
						targetPath: "",
						includeDateHeader: false,
						enabled: true,
					};
					this.plugin.settings.rules.push(newRule);
					await this.plugin.saveSettings();
					this.display();
				})
			);

		// --- Actions ---
		containerEl.createEl("h3", {text: "Actions"});

		new Setting(containerEl)
			.setName("Run fanout now")
			.setDesc("Distribute today's daily note using the rules above")
			.addButton(btn =>
				btn.setButtonText("Run fanout").setCta().onClick(() => {
					manualFanout(this.app, this.plugin.settings, (date) => this.plugin.markProcessed(date));
				})
			);

		let batchFolder = "";
		new Setting(containerEl)
			.setName("Batch fanout from folder")
			.setDesc("Run fanout on every file in a folder")
			.addText(text => {
				text.setPlaceholder("Search for a folder…");
				new FolderSuggest(this.app, text.inputEl, (folder) => {
					batchFolder = folder.path;
				});
				text.onChange((value) => {
					batchFolder = value.trim();
				});
			})
			.addButton(btn =>
				btn.setButtonText("Run batch").setWarning().onClick(() => {
					if (!batchFolder) {
						new Notice("Fanout: please select a folder first.");
						return;
					}
					batchFanoutFolder(this.app, batchFolder, this.plugin.settings);
				})
			);

		let singleFile = "";
		new Setting(containerEl)
			.setName("Run fanout on a specific file")
			.setDesc("Select a file and run fanout on it")
			.addText(text => {
				text.setPlaceholder("Search for a note…");
				new FileSuggest(this.app, text.inputEl, (file) => {
					singleFile = file.path;
				});
				text.onChange((value) => {
					singleFile = value.trim();
				});
			})
			.addButton(btn =>
				btn.setButtonText("Run").setCta().onClick(async () => {
					if (!singleFile) {
						new Notice("Fanout: please select a file first.");
						return;
					}
					const file = this.app.vault.getAbstractFileByPath(singleFile);
					if (!file || !(file instanceof TFile)) {
						new Notice(`Fanout: "${singleFile}" not found.`);
						return;
					}
					const {runFanoutOnFile} = await import("./trigger");
					const count = await runFanoutOnFile(this.app, file, this.plugin.settings, file.basename);
					if (count > 0) {
						new Notice(`Fanout: distributed ${count} section(s) from "${file.basename}".`);
					} else {
						new Notice("Fanout: no matching sections found.");
					}
				})
			);

		// --- Debug ---
		containerEl.createEl("h3", {text: "Advanced"});

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Log detailed fanout processing info to the developer console")
			.addToggle(toggle =>
				toggle.setValue(this.plugin.settings.debugLogging).onChange(async (value) => {
					this.plugin.settings.debugLogging = value;
					setDebugLogging(value);
					await this.plugin.saveSettings();
				})
			);
	}

	private renderRule(containerEl: HTMLElement, rule: FanoutRule): void {
		const ruleContainer = containerEl.createDiv({cls: "fanout-rule-container"});
		ruleContainer.style.border = "1px solid var(--background-modifier-border)";
		ruleContainer.style.borderRadius = "8px";
		ruleContainer.style.padding = "12px";
		ruleContainer.style.marginBottom = "12px";

		new Setting(ruleContainer)
			.setName("Source header")
			.setDesc("The header to match in the daily note")
			.addDropdown(drop => {
				if (this.templateHeadings.length > 0) {
					for (const heading of this.templateHeadings) {
						drop.addOption(heading, heading);
					}
				}

				if (rule.sourceHeader && this.templateHeadings.includes(rule.sourceHeader)) {
					drop.setValue(rule.sourceHeader);
				} else if (this.templateHeadings.length > 0) {
					drop.setValue(this.templateHeadings[0] ?? "");
				}

				drop.onChange(async (value) => {
					rule.sourceHeader = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(ruleContainer)
			.setName("Target note")
			.setDesc("The note to append content to")
			.addText(text => {
				text
					.setPlaceholder("Search for a note…")
					.setValue(rule.targetPath);
				new FileSuggest(this.app, text.inputEl, (file) => {
					rule.targetPath = file.path;
					void this.plugin.saveSettings();
				});
				text.onChange(async (value) => {
					rule.targetPath = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(ruleContainer)
			.setName("Include date header")
			.setDesc("Add a date sub-header before the appended content")
			.addToggle(toggle =>
				toggle.setValue(rule.includeDateHeader).onChange(async (value) => {
					rule.includeDateHeader = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(ruleContainer)
			.setName("Enabled")
			.addToggle(toggle =>
				toggle.setValue(rule.enabled).onChange(async (value) => {
					rule.enabled = value;
					await this.plugin.saveSettings();
				})
			)
			.addButton(btn =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.rules =
							this.plugin.settings.rules.filter(r => r.id !== rule.id);
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
