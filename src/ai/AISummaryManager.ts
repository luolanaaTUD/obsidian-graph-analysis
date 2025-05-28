import { App, Notice, Modal, requestUrl, setIcon } from 'obsidian';
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
            // Get file content first to check if it's worth summarizing
            const content = await this.app.vault.read(activeFile);
            const cleanedContent = this.cleanupContent(content);
            const wordCount = cleanedContent.split(/\s+/).length;
            
            // Show loading notice with word count info
            const loadingNotice = new Notice(`Generating AI summary for ${wordCount} words...`, 0);
            
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
        // Check if Gemini API key is configured
        if (!this.settings.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Please configure your Gemini API key in settings to use AI summaries.');
        }

        try {
            // Clean up and limit content
            const cleanedContent = this.cleanupContent(content);
            
            // Call Gemini API
            const summary = await this.callGeminiAPI(cleanedContent, fileName);
            return summary;
        } catch (error) {
            console.error('Gemini API call failed:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Unknown error occurred';
            if (error instanceof Error) {
                if (error.message.includes('401') || error.message.includes('403')) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key in settings.';
                } else if (error.message.includes('429')) {
                    errorMessage = 'API rate limit exceeded. Please try again later.';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMessage = 'Network error. Please check your internet connection.';
                } else {
                    errorMessage = error.message;
                }
            }
            
            throw new Error(errorMessage);
        }
    }

    private cleanupContent(content: string): string {
        // Remove markdown syntax and clean up content
        let cleaned = content
            // Remove frontmatter
            .replace(/^---[\s\S]*?---\n?/m, '')
            // Remove empty lines
            .replace(/^\s*$/gm, '')
            // Remove multiple consecutive newlines
            .replace(/\n{3,}/g, '\n\n')
            // Remove markdown headers
            .replace(/^#{1,6}\s+/gm, '')
            // Remove markdown links but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove markdown bold/italic
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            // Remove markdown code blocks
            .replace(/```[\s\S]*?```/g, '')
            // Remove inline code
            .replace(/`([^`]+)`/g, '$1')
            // Remove bullet points
            .replace(/^[\s]*[-*+]\s+/gm, '')
            // Remove numbered lists
            .replace(/^[\s]*\d+\.\s+/gm, '')
            // Clean up extra whitespace
            .replace(/\s+/g, ' ')
            .trim();

        // Limit to approximately 1000 words
        const words = cleaned.split(/\s+/);
        if (words.length > 1000) {
            cleaned = words.slice(0, 1000).join(' ') + '...';
        }

        return cleaned;
    }

    private cleanupSummaryText(text: string): string {
        return text
            // Remove any empty lines that only contain whitespace
            .split('\n')
            .filter(line => line.trim() !== '')
            .join('\n');
    }

    private async callGeminiAPI(content: string, fileName: string): Promise<string> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `Extract key words, identify the knowledge domain, and provide a one-sentence concise summary for the following note titled "${fileName}".
        Please use same language as "${fileName}".
        Please format the response exactly as follows:

        **Key Words:** [List 3-6 most relevant keywords or key phrases, separated by commas]
        **Key Points:** [One concise sentence that captures the main idea and key points of the note]
        **Knowledge Domain:** [List 2-4 relevant fields or domains this content belongs to, separated by commas]

Content:
${content}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 300,
            }
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API returned status ${response.status}: ${response.text}`);
            }

            const data = response.json;
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const summaryText = this.cleanupSummaryText(data.candidates[0].content.parts[0].text);
            const wordCount = content.split(/\s+/).length;

            // Format for display in modal (includes word count)
            const displayFormat = `${summaryText}

*Original word count: ${wordCount} words*
*Generated using Google Gemini 1.5 Flash*`;

            // Format for writing to note (callout format without word count)
            const writeFormat = `> [!summary] AI Summary
> ${summaryText.replace(/\n/g, '\n> ')}`;

            return JSON.stringify({
                displayFormat,
                writeFormat
            });
        } catch (error) {
            console.error('Gemini API error:', error);
            throw error;
        }
    }

    private displayAISummary(summary: string, originalFileName: string): void {
        const { displayFormat, writeFormat } = JSON.parse(summary);
        const modal = new AISummaryModal(this.app, displayFormat, writeFormat, originalFileName);
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
    private displaySummary: string;
    private writeSummary: string;
    private fileName: string;

    constructor(app: App, displaySummary: string, writeSummary: string, fileName: string) {
        super(app);
        this.displaySummary = displaySummary;
        this.writeSummary = writeSummary;
        this.fileName = fileName;
    }

    private async writeToNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file found');
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            let newContent: string;

            // Check if the file has frontmatter
            if (content.startsWith('---')) {
                const frontmatterEnd = content.indexOf('---', 3);
                if (frontmatterEnd !== -1) {
                    // Insert after frontmatter
                    newContent = content.slice(0, frontmatterEnd + 3) + '\n\n' + 
                               this.writeSummary + '\n\n' +
                               content.slice(frontmatterEnd + 3);
                } else {
                    // Invalid frontmatter, insert at beginning
                    newContent = this.writeSummary + '\n\n' + content;
                }
            } else {
                // No frontmatter, insert at beginning
                newContent = this.writeSummary + '\n\n' + content;
            }

            await this.app.vault.modify(activeFile, newContent);
            new Notice('Summary added to note');
            this.close();
        } catch (error) {
            console.error('Failed to write summary to note:', error);
            new Notice('Failed to write summary to note');
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { 
            text: `AI Summary: ${this.fileName}`,
            cls: 'modal-title'
        });
        
        const summaryContainer = contentEl.createEl('div', { 
            cls: 'modal-content ai-summary-content' 
        });
        
        const lines = this.displaySummary.split('\n');
        lines.forEach(line => {
            if (line.trim() === '') {
                summaryContainer.createEl('br');
            } else if (line.startsWith('**') && line.endsWith('**')) {
                summaryContainer.createEl('h3', {
                    text: line.replace(/\*\*/g, ''),
                    cls: 'ai-summary-header'
                });
            } else if (line.startsWith('*') && line.endsWith('*')) {
                summaryContainer.createEl('p', {
                    text: line.replace(/\*/g, ''),
                    cls: 'ai-summary-metadata'
                });
            } else {
                const p = summaryContainer.createEl('p', { cls: 'ai-summary-text' });
                p.innerHTML = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                 .replace(/\*(.*?)\*/g, '<em>$1</em>');
            }
        });
        
        const buttonContainer = contentEl.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const writeButton = buttonContainer.createEl('button', { 
            text: 'Add to Note',
            cls: 'mod-cta'
        });
        writeButton.addEventListener('click', () => this.writeToNote());
        
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