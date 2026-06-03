import { App, TFile } from 'obsidian';
import { ExclusionUtils } from './ExclusionUtils';

/**
 * Central vault file access for graph and analysis features.
 * All markdown enumeration goes through this helper.
 */
export class VaultScope {
    private app: App;
    private exclusionUtils: ExclusionUtils;

    constructor(app: App, exclusionUtils: ExclusionUtils) {
        this.app = app;
        this.exclusionUtils = exclusionUtils;
    }

    getAllMarkdownFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    getIncludedMarkdownFiles(): TFile[] {
        return this.getAllMarkdownFiles().filter((file) => !this.exclusionUtils.isFileExcluded(file));
    }

    getIncludedMarkdownPaths(): string[] {
        return this.getIncludedMarkdownFiles().map((file) => file.path);
    }
}
