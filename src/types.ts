export interface FanoutRule {
	id: string;
	sourceHeader: string;
	targetPath: string;
	includeDateHeader: boolean;
	enabled: boolean;
}

export interface FanoutPluginSettings {
	rules: FanoutRule[];
	headerLevel: number;
	processedDates: string[];
	debugLogging: boolean;
}

/** Shared logger — only outputs when debug logging is enabled. */
let _debugEnabled = false;

export function setDebugLogging(enabled: boolean): void {
	_debugEnabled = enabled;
}

export function fanoutLog(...args: unknown[]): void {
	if (_debugEnabled) {
		console.log("[Fanout]", ...args);
	}
}
