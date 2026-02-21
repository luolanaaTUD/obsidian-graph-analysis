import { App, TFile } from 'obsidian';

/**
 * Centralized utility for resolving note identifiers (path, title, basename)
 * to valid vault paths, TFile instances, or display titles.
 * Single source of truth for all note ID resolution across the plugin.
 */
export class NoteResolver {
    /**
     * Resolve any raw note identifier to a valid vault file path.
     * Tries: exact path -> path + .md -> basename match.
     * Returns empty string if no match found.
     */
    static resolveToPath(app: App, rawId: string): string {
        const file = this.resolveToFile(app, rawId);
        return file ? file.path : '';
    }

    /**
     * Resolve any raw note identifier to a TFile instance.
     * Returns null if no match found.
     */
    static resolveToFile(app: App, rawId: string): TFile | null {
        if (!rawId?.trim()) return null;

        // 1. Exact path match
        const exact = app.vault.getAbstractFileByPath(rawId);
        if (exact instanceof TFile) return exact;

        // 2. Maybe missing .md extension
        const withExt = rawId.endsWith('.md') ? rawId : rawId + '.md';
        const withExtFile = app.vault.getAbstractFileByPath(withExt);
        if (withExtFile instanceof TFile) return withExtFile;

        // 3. Basename match (case-insensitive)
        const cleanedId = rawId.split('/').pop()?.replace(/\.md$/i, '') || rawId;
        const allFiles = app.vault.getMarkdownFiles();
        const match = allFiles.find(
            (f) => f.basename.toLowerCase() === cleanedId.toLowerCase()
        );
        return match ?? null;
    }

    /**
     * Resolve any raw note identifier to a display title (basename without .md).
     * Always returns a string (falls back to cleaned-up rawId).
     */
    static resolveToTitle(app: App, rawId: string): string {
        const file = this.resolveToFile(app, rawId);
        if (file) return file.basename;
        const fallback = rawId.split('/').pop()?.replace(/\.md$/i, '') || rawId;
        return fallback;
    }
}
