import { App, Notice, TFile, MarkdownView, Modal, requestUrl, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';

export class AISummaryManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private statusBarItem: HTMLElement | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public createStatusBarButton(statusBarContainer: HTMLElement): HTMLElement {
        // Use Obsidian's built-in status-bar-item class
        this.statusBarItem = statusBarContainer.createEl('div', {
            cls: 'status-bar-item plugin-graph-analysis-ai-summary'
        });

        // Create icon container
        const iconContainer = this.statusBarItem.createEl('span', {
            cls: 'status-bar-item-icon'
        });

        // Use Obsidian's built-in setIcon method for the Lucide sun icon
        setIcon(iconContainer, 'sun');

        // Add text label
        this.statusBarItem.createEl('span', {
            text: 'AI Summary',
            cls: 'status-bar-item-text'
        });

        // Add click handler
        this.statusBarItem.addEventListener('click', () => {
            this.generateAISummaryForCurrentNote();
        });

        return this.statusBarItem;
    }

    public async generateAISummaryForCurrentNote(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            new Notice('No active markdown file to summarize');
            return;
        }

        try {
            // Show loading notice
            const loadingNotice = new Notice('🤖 Generating AI summary...', 0);
            
            // Get file content
            const content = await this.app.vault.read(activeFile);
            
            // Generate summary using AI
            const summary = await this.callAIForSummary(content, activeFile.basename);
            
            // Hide loading notice
            loadingNotice.hide();
            
            // Display summary in a modal
            this.displayAISummary(summary, activeFile.basename);
            
        } catch (error) {
            console.error('Failed to generate AI summary:', error);
            new Notice(`Failed to generate AI summary: ${(error as Error).message}`);
        }
    }

    private async callAIForSummary(content: string, fileName: string): Promise<string> {
        // For now, we'll use a simple text processing approach
        // In the future, this can be extended to use OpenAI API or other AI services
        return this.generateSimpleSummary(content, fileName);
    }

    private generateSimpleSummary(content: string, fileName: string): string {
        // Simple extractive summary as fallback
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const wordCount = content.split(/\s+/).length;
        
        // Take first few sentences and some key sentences
        const summary = sentences.slice(0, 3).join('. ') + '.';
        
        return `**Summary of "${fileName}"**

${summary}

*Word count: ${wordCount} words*
*This is a simple extractive summary. For AI-powered summaries, configure your OpenAI API key in settings.*`;
    }

    private displayAISummary(summary: string, originalFileName: string): void {
        const modal = new AISummaryModal(this.app, summary, originalFileName);
        modal.open();
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    public destroy(): void {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }
}

class AISummaryModal extends Modal {
    private summary: string;
    private fileName: string;

    constructor(app: App, summary: string, fileName: string) {
        super(app);
        this.summary = summary;
        this.fileName = fileName;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Use Obsidian's built-in modal title class
        contentEl.createEl('h2', { 
            text: `AI Summary: ${this.fileName}`,
            cls: 'modal-title'
        });
        
        // Use Obsidian's built-in modal content styling
        const summaryContainer = contentEl.createEl('div', { 
            cls: 'modal-content ai-summary-content' 
        });
        
        // Render markdown content
        summaryContainer.innerHTML = this.summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                                                  .replace(/\n/g, '<br>');
        
        // Add buttons using Obsidian's button styling
        const buttonContainer = contentEl.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const copyButton = buttonContainer.createEl('button', { 
            text: 'Copy to Clipboard',
            cls: 'mod-cta'
        });
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.summary);
            copyButton.textContent = 'Copied!';
            setTimeout(() => copyButton.textContent = 'Copy to Clipboard', 2000);
        });
        
        const closeButton = buttonContainer.createEl('button', { 
            text: 'Close'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 