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

        containerEl.createEl('h2', { text: 'Graph Analysis Settings' });

        new Setting(containerEl)
            .setName('Exclude Folders')
            .setDesc('Folders to exclude from analysis (comma-separated). Use folder paths like "Archive", "Templates", "Private/Personal"')
            .addText(text => text
                .setPlaceholder('Archive,Templates,Private/Personal')
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        new Setting(containerEl)
            .setName('Exclude Tags')
            .setDesc('Tags to exclude from analysis (comma-separated). Use tag names without # like "private", "draft", "archive"')
            .addText(text => text
                .setPlaceholder('private,draft,archive')
                .setValue(this.plugin.settings.excludeTags.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        // AI Summary Settings
        containerEl.createEl('h3', { text: 'AI Summary Settings' });

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Your Google Gemini API key for AI-powered summaries')
            .addText(text => {
                text.setPlaceholder('Enter your Gemini API key')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value;
                        await this.plugin.saveSettings();
                    });
                // Make it a password field for security
                text.inputEl.type = 'password';
                return text;
            });

        // Add exclusion statistics section
        this.createExclusionStatsSection(containerEl);
    }

    private createExclusionStatsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Exclusion Statistics' });
        
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
            
            statsContainer.createDiv({ 
                text: `Total files in vault: ${stats.totalFiles}`,
                cls: 'stat-item'
            });
            
            statsContainer.createDiv({ 
                text: `Files excluded by folder rules: ${stats.excludedByFolder}`,
                cls: 'stat-item'
            });
            
            statsContainer.createDiv({ 
                text: `Files excluded by tag rules: ${stats.excludedByTag}`,
                cls: 'stat-item'
            });
            
            statsContainer.createDiv({ 
                text: `Total excluded files: ${stats.totalExcluded}`,
                cls: 'stat-item excluded-total'
            });
            
            statsContainer.createDiv({ 
                text: `Files included in analysis: ${stats.includedFiles}`,
                cls: 'stat-item included-total'
            });

            // Add a button to show excluded files list
            if (stats.totalExcluded > 0) {
                const showExcludedBtn = statsContainer.createEl('button', {
                    text: 'Show excluded files',
                    cls: 'mod-cta'
                });
                
                showExcludedBtn.addEventListener('click', () => {
                    this.showExcludedFilesList();
                });
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