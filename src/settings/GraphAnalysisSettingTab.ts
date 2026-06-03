import { App, PluginSettingTab, Setting, Modal } from 'obsidian';
import GraphAnalysisPlugin from '../main';
import { t } from '../i18n';
import type { AiResponseLanguage, UiLanguage } from '../types/types';
import { configureI18n } from '../i18n';

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
        containerEl.addClass('graph-analysis-settings');

        new Setting(containerEl).setName(t('settings.excludeHeading')).setHeading();
        const exclusionContainer = containerEl.createDiv({ cls: 'graph-settings-section-container' });

        new Setting(exclusionContainer)
            .setClass('graph-settings-item')
            .setName(t('settings.excludeFolders.name'))
            .setDesc(t('settings.excludeFolders.desc'))
            .addText(text => text
                .setPlaceholder(t('settings.excludeFolders.placeholder'))
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        new Setting(exclusionContainer)
            .setClass('graph-settings-item')
            .setName(t('settings.excludeTags.name'))
            .setDesc(t('settings.excludeTags.desc'))
            .addText(text => text
                .setPlaceholder(t('settings.excludeTags.placeholder'))
                .setValue(this.plugin.settings.excludeTags.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeTags = value.split(',').map(s => s.trim()).filter(s => s);
                    await this.plugin.saveSettings();
                    this.updateExclusionStats();
                }));

        this.createExclusionStatsSection(exclusionContainer);

        new Setting(containerEl).setName(t('settings.llmHeading')).setHeading();
        const apiContainer = containerEl.createDiv({ cls: 'graph-settings-section-container' });

        let apiKeyTextComponent: { inputEl: HTMLInputElement };
        new Setting(apiContainer)
            .setClass('graph-settings-item')
            .setName(t('settings.geminiApiKey.name'))
            .setDesc((() => {
                const doc = this.containerEl.ownerDocument;
                const frag = doc.createDocumentFragment();
                frag.append(doc.createTextNode(t('settings.geminiApiKey.descPrefix')));
                const link = doc.createElement('a');
                link.textContent = t('settings.geminiApiKey.getKeyLink');
                link.href = 'https://aistudio.google.com/apikey';
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener');
                frag.append(link);
                return frag;
            })())
            .addText(text => {
                text.setPlaceholder(t('settings.geminiApiKey.placeholder'))
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
                    .setTooltip(t('settings.geminiApiKey.showTooltip'))
                    .onClick(() => {
                        const input = apiKeyTextComponent.inputEl;
                        const isVisible = input.type === 'text';
                        input.type = isVisible ? 'password' : 'text';
                        btn.setIcon(isVisible ? 'eye' : 'eye-off');
                        btn.setTooltip(isVisible ? t('settings.geminiApiKey.showTooltip') : t('settings.geminiApiKey.hideTooltip'));
                    });
                return btn;
            });

        new Setting(containerEl).setName(t('settings.languageHeading')).setHeading();
        const languageContainer = containerEl.createDiv({ cls: 'graph-settings-section-container' });

        new Setting(languageContainer)
            .setClass('graph-settings-item')
            .setName(t('settings.uiLanguage.name'))
            .setDesc(t('settings.uiLanguage.desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('auto', t('settings.uiLanguage.obsidian'))
                    .addOption('en', t('settings.uiLanguage.en'))
                    .addOption('zh-Hans', t('settings.uiLanguage.zhHans'))
                    .setValue(this.plugin.settings.uiLanguage)
                    .onChange(async (value) => {
                        this.plugin.settings.uiLanguage = value as UiLanguage;
                        configureI18n(this.plugin.settings.uiLanguage);
                        await this.plugin.saveSettings();
                        this.display();
                    });
                return dropdown;
            });

        new Setting(languageContainer)
            .setClass('graph-settings-item')
            .setName(t('settings.aiResponseLanguage.name'))
            .setDesc(t('settings.aiResponseLanguage.desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('auto', t('settings.aiResponseLanguage.auto'))
                    .addOption('en', t('settings.aiResponseLanguage.en'))
                    .addOption('zh-Hans', t('settings.aiResponseLanguage.zhHans'))
                    .setValue(this.plugin.settings.aiResponseLanguage)
                    .onChange(async (value) => {
                        this.plugin.settings.aiResponseLanguage = value as AiResponseLanguage;
                        await this.plugin.saveSettings();
                    });
                return dropdown;
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
            if (stats.excludedByFolder > 0) {
                excludedParts.push(t('settings.stats.excludedByFolder', { count: stats.excludedByFolder }));
            }
            if (stats.excludedByTag > 0) {
                excludedParts.push(t('settings.stats.excludedByTag', { count: stats.excludedByTag }));
            }
            const excludedBreakdown = excludedParts.length > 0 ? ` (${excludedParts.join(', ')})` : '';
            statsText.createDiv({
                text: t('settings.stats.excludedTotal', {
                    total: stats.totalExcluded,
                    breakdown: excludedBreakdown
                }),
                cls: 'stat-item excluded-total'
            });
            statsText.createDiv({
                text: t('settings.stats.includedTotal', {
                    included: stats.includedFiles,
                    total: stats.totalFiles
                }),
                cls: 'stat-item included-total'
            });

            if (stats.totalExcluded > 0) {
                const btn = statsContainer.createEl('button', {
                    text: t('settings.stats.showExcluded'),
                    cls: 'mod-cta'
                });
                btn.addEventListener('click', () => this.showExcludedFilesList());
            }
        } catch {
            this.exclusionStatsEl.createDiv({
                text: t('settings.stats.error'),
                cls: 'stat-error'
            });
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

        contentEl.createEl('h2', { text: t('settings.excludedModal.title') });

        if (this.excludedFiles.length === 0) {
            contentEl.createDiv({ text: t('settings.excludedModal.empty') });
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
