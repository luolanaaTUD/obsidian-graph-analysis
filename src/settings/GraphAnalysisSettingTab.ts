import { App, PluginSettingTab, Setting } from 'obsidian';
import GraphAnalysisPlugin from '../main';

export class GraphAnalysisSettingTab extends PluginSettingTab {
    plugin: GraphAnalysisPlugin;

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
            .setDesc('Folders to exclude from analysis (comma-separated)')
            .addText(text => text
                .setPlaceholder('folder1,folder2')
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exclude Tags')
            .setDesc('Tags to exclude from analysis (comma-separated)')
            .addText(text => text
                .setPlaceholder('tag1,tag2')
                .setValue(this.plugin.settings.excludeTags.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Result Limit')
            .setDesc('Maximum number of results to display')
            .addSlider(slider => slider
                .setLimits(5, 50, 5)
                .setValue(this.plugin.settings.resultLimit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.resultLimit = value;
                    await this.plugin.saveSettings();
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
    }
}