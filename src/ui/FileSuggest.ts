import {AbstractInputSuggest, App, TFile} from "obsidian";

/** Autocomplete suggest that lists all markdown files in the vault. */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	private selectCallback: (file: TFile) => void;

	constructor(app: App, inputEl: HTMLInputElement, onSelectFile: (file: TFile) => void) {
		super(app, inputEl);
		this.selectCallback = onSelectFile;
	}

	getSuggestions(query: string): TFile[] {
		const lowerQuery = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter(f => f.path.toLowerCase().includes(lowerQuery))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.path);
		this.selectCallback(file);
		this.close();
	}
}
