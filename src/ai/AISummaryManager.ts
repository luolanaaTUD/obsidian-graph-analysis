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
            const loadingNotice = new Notice(
                this.settings.geminiApiKey ? 
                `🤖 Generating AI summary for ${wordCount} words...` : 
                '📝 Generating simple summary...', 
                0
            );
            
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
            return this.generateSimpleSummary(content, fileName);
        }

        try {
            // Clean up and limit content
            const cleanedContent = this.cleanupContent(content);
            
            // Call Gemini API
            const summary = await this.callGeminiAPI(cleanedContent, fileName);
            return summary;
        } catch (error) {
            console.error('Gemini API call failed, falling back to simple summary:', error);
            
            // Provide more specific error messages but still fall back to simple summary
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
            
            // Show error notice but continue with simple summary
            new Notice(`AI summary failed: ${errorMessage}. Using simple summary instead.`);
            return this.generateSimpleSummary(content, fileName);
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

    private async callGeminiAPI(content: string, fileName: string): Promise<string> {
        const apiKey = this.settings.geminiApiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

        const prompt = `Please provide a concise summary of the following note titled "${fileName}". 
Focus on the main ideas, key points, and important concepts. Keep the summary informative but brief.

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
                maxOutputTokens: 500,
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

            const summaryText = data.candidates[0].content.parts[0].text;
            const wordCount = content.split(/\s+/).length;

            return `**AI Summary of "${fileName}"**

${summaryText}

*Original word count: ${wordCount} words*
*Generated using Google Gemini AI*`;

        } catch (error) {
            console.error('Gemini API error:', error);
            throw error; // Re-throw to be handled by the calling method
        }
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
*This is a simple extractive summary. Configure your Gemini API key in settings for AI-powered summaries.*`;
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
        
        // Better markdown rendering
        const lines = this.summary.split('\n');
        lines.forEach(line => {
            if (line.trim() === '') {
                summaryContainer.createEl('br');
            } else if (line.startsWith('**') && line.endsWith('**')) {
                // Handle bold headers
                summaryContainer.createEl('h3', {
                    text: line.replace(/\*\*/g, ''),
                    cls: 'ai-summary-header'
                });
            } else if (line.startsWith('*') && line.endsWith('*')) {
                // Handle italic metadata
                summaryContainer.createEl('p', {
                    text: line.replace(/\*/g, ''),
                    cls: 'ai-summary-metadata'
                });
            } else {
                // Regular content
                const p = summaryContainer.createEl('p', { cls: 'ai-summary-text' });
                p.innerHTML = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                 .replace(/\*(.*?)\*/g, '<em>$1</em>');
            }
        });
        
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