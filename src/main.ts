import {Notice, Plugin, TFile} from "obsidian";
import type {FanoutPluginSettings} from "./types";
import {setDebugLogging} from "./types";
import {DEFAULT_SETTINGS, FanoutSettingTab} from "./settings";
import {autoTriggerOnCreate, manualFanout} from "./trigger";

export default class FanoutPlugin extends Plugin {
	settings: FanoutPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "fanout-distribute",
			name: "Distribute daily note",
			callback: () => {
				manualFanout(this.app, this.settings, (date) => this.markProcessed(date));
			},
		});

		// Auto-trigger: listen for new file creation (new daily note)
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!(file instanceof TFile)) return;
				autoTriggerOnCreate(
					this.app,
					file,
					this.settings,
					(date) => this.markProcessed(date),
				);
			}),
		);

		this.addSettingTab(new FanoutSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<FanoutPluginSettings>);
		if (!Array.isArray(this.settings.rules)) {
			this.settings.rules = [];
		}
		setDebugLogging(this.settings.debugLogging);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async markProcessed(date: string) {
		if (!this.settings.processedDates.includes(date)) {
			this.settings.processedDates.push(date);
			// Keep only the last 90 days to avoid unbounded growth
			if (this.settings.processedDates.length > 90) {
				this.settings.processedDates = this.settings.processedDates.slice(-90);
			}
			await this.saveSettings();
		}
	}
}
