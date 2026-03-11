import {App, PluginSettingTab, Setting} from "obsidian";
import FanoutPlugin from "./main";

export interface FanoutPluginSettings {
	fanoutSetting: string;
}

export const DEFAULT_SETTINGS: FanoutPluginSettings = {
	fanoutSetting: 'default'
}

export class FanoutSettingTab extends PluginSettingTab {
	plugin: FanoutPlugin;

	constructor(app: App, plugin: FanoutPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.fanoutSetting)
				.onChange(async (value) => {
					this.plugin.settings.fanoutSetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
