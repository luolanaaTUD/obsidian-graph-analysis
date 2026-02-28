import { App, PluginSettingTab, Setting, Modal } from 'obsidian';
import GraphAnalysisPlugin from '../main';

export class GraphAnalysisSettingTab extends PluginSettingTab {
    plugin: GraphAnalysisPlugin;
    private exclusionStatsEl: HTMLElement | null = null;

    constructor(app: App, plugin: GraphAnalysisPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Exclude Notes from Analysis: title + one rounded container (Exclude Folders | Exclude Tags | Statistics)
        containerEl.createEl('h3', { text: 'Exclude Notes from Analysis', cls: 'graph-settings-section-title' });
        const exclusionContainer = containerEl.createDiv({ cls: 'graph-settings-section-container' });

        new Setting(exclusionContainer)
            .setClass('graph-settings-item')
            .setName('Exclude Folders')
            .setDesc('Use folder paths like "Archive", "Templates", "Private/Personal"')
            .addText(text => text
                .setPlaceholder('Archive,Templates,Private/Personal')
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        new Setting(exclusionContainer)
            .setClass('graph-settings-item')
            .setName('Exclude Tags')
            .setDesc('Use tag names without # like "private", "draft", "archive"')
            .addText(text => text
                .setPlaceholder('private,draft,archive')
                .setValue(this.plugin.settings.excludeTags.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        // Exclusion statistics (inline under Exclude Notes from Analysis)
        this.createExclusionStatsSection(exclusionContainer);

        // LLM Model Configuration: title + one rounded container
        containerEl.createEl('h3', { text: 'LLM Model Configuration', cls: 'graph-settings-section-title' });
        const apiContainer = containerEl.createDiv({ cls: 'graph-settings-section-container' });

        let apiKeyTextComponent: { inputEl: HTMLInputElement };
        new Setting(apiContainer)
            .setClass('graph-settings-item')
            .setName('Gemini API Key')
            .setDesc(createFragment((frag: DocumentFragment) => {
                frag.appendText('Your Google Gemini API key. ');
                const link = frag.createEl('a', {
                    text: 'Get an API key',
                    href: 'https://aistudio.google.com/apikey',
                });
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener');
            }))
            .addText(text => {
                text.setPlaceholder('Enter your Gemini API key')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
                apiKeyTextComponent = text;
                return text;
            })
            .addExtraButton(btn => {
                btn.setIcon('eye')
                    .setTooltip('Show API key')
                    .onClick(() => {
                        const input = apiKeyTextComponent.inputEl;
                        const isVisible = input.type === 'text';
                        input.type = isVisible ? 'password' : 'text';
                        btn.setIcon(isVisible ? 'eye' : 'eye-off');
                        btn.setTooltip(isVisible ? 'Show API key' : 'Hide API key');
                    });
                return btn;
            });
    }

    private createExclusionStatsSection(containerEl: HTMLElement): void {
        this.exclusionStatsEl = containerEl.createDiv({ cls: 'exclusion-stats' });
        this.updateExclusionStats();
    }

    private updateExclusionStats(): void {
        if (!this.exclusionStatsEl || !this.plugin.exclusionUtils) {
            return;
        }

        this.exclusionStatsEl.empty();

        try {
            const stats = this.plugin.exclusionUtils.getExclusionStats();
            const statsContainer = this.exclusionStatsEl.createDiv({ cls: 'stats-container' });

            const statsText = statsContainer.createDiv({ cls: 'stats-text' });
            const excludedParts: string[] = [];
            if (stats.excludedByFolder > 0) excludedParts.push(`${stats.excludedByFolder} by folder`);
            if (stats.excludedByTag > 0) excludedParts.push(`${stats.excludedByTag} by tag`);
            const excludedBreakdown = excludedParts.length > 0 ? ` (${excludedParts.join(', ')})` : '';
            statsText.createDiv({
                text: `Excluded notes: ${stats.totalExcluded}${excludedBreakdown}`,
                cls: 'stat-item excluded-total'
            });
            statsText.createDiv({
                text: `Notes included in analysis: ${stats.includedFiles}/${stats.totalFiles}`,
                cls: 'stat-item included-total'
            });

            if (stats.totalExcluded > 0) {
                const btn = statsContainer.createEl('button', { text: 'Show excluded files', cls: 'mod-cta' });
                btn.addEventListener('click', () => this.showExcludedFilesList());
            }
        } catch (error) {
            this.exclusionStatsEl.createDiv({ 
                text: 'Error calculating exclusion statistics',
                cls: 'stat-error'
            });
            console.error('Error calculating exclusion statistics:', error);
        }
    }

    private showExcludedFilesList(): void {
        if (!this.plugin.exclusionUtils) return;

        const excludedFiles = this.plugin.exclusionUtils.getExcludedFiles();
        
        const modal = new ExcludedFilesModal(this.app, excludedFiles);
        modal.open();
    }
}

class ExcludedFilesModal extends Modal {
    private excludedFiles: string[];

    constructor(app: App, excludedFiles: string[]) {
        super(app);
        this.excludedFiles = excludedFiles;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Excluded Files' });
        
        if (this.excludedFiles.length === 0) {
            contentEl.createDiv({ text: 'No files are currently excluded.' });
            return;
        }

        const fileList = contentEl.createDiv({ cls: 'excluded-files-list' });
        
        this.excludedFiles.forEach(filePath => {
            const fileItem = fileList.createDiv({ cls: 'excluded-file-item' });
            fileItem.createSpan({ text: filePath });
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}