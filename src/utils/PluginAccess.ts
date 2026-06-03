import { App, TFile } from 'obsidian';

interface GraphAnalysisPluginLike {
    getIncludedMarkdownFiles(): TFile[];
}

interface ExtendedApp extends App {
    plugins: {
        plugins: Record<string, unknown>;
    };
}

export function getIncludedMarkdownFiles(app: App): TFile[] {
    const plugin = (app as ExtendedApp).plugins?.plugins?.['knowledge-graph-analysis'] as
        | GraphAnalysisPluginLike
        | undefined;
    if (plugin?.getIncludedMarkdownFiles) {
        return plugin.getIncludedMarkdownFiles();
    }
    return app.vault.getMarkdownFiles();
}
