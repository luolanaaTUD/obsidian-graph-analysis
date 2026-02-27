import { App, Notice, Modal, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../types/types';
import { AIModelService, SEMANTIC_MODELS } from '../services/AIModelService';
import { cleanupNoteContent } from '../utils/NoteContentUtils';

export class AISummaryManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private aiService: AIModelService;
    private statusBarItem: HTMLElement | null = null;
    private readonly MAX_WORDS_PER_NOTE = 1000;
    private semanticModelCounter = 0;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
        this.aiService = new AIModelService(settings);
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
            const cleanedContent = this.truncateByWords(cleanupNoteContent(content));
            const wordCount = cleanedContent.split(/\s+/).filter(w => w.length > 0).length;
            
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



    private truncateByWords(content: string): string {
        const words = content.split(/\s+/).filter(w => w.length > 0);
        if (words.length <= this.MAX_WORDS_PER_NOTE) return content;
        return words.slice(0, this.MAX_WORDS_PER_NOTE).join(' ') + '...';
    }

    private async callAIForSummary(content: string, fileName: string): Promise<string> {
        // Check if Gemini API key is configured
        if (!this.settings.geminiApiKey || this.settings.geminiApiKey.trim() === '') {
            throw new Error('Please configure your Gemini API key in settings to use AI summaries.');
        }

        try {
            // Clean up and limit content
            const cleanedContent = this.truncateByWords(cleanupNoteContent(content));
            
            // Create structured analysis schema for single note summary
            const responseSchema = this.aiService.createNoteSummarySchema();
            
            // Build optimized prompt with clear structure
            const systemPrompt = `You are an expert knowledge analyst specializing in semantic analysis and knowledge classification. Your role is to analyze a single note and extract meaningful insights.`;

            const contextPrompt = `## Analysis Guidelines:
- Be specific and detailed in your summary
- Extract 3-6 most relevant keywords or key phrases
- Use the same language as the original note`;

            const instructionPrompt = `## Analysis Instructions
For the note, provide:
1. **Key Words**: 3-6 key terms or phrases (comma-separated)
2. **Key Points**: A two to three sentence summary of the main concept or purpose (be detailed and insightful)

## Note to Analyze:`;

            // Build the complete prompt
            const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${instructionPrompt}\n\n--- Note: "${fileName}" (${cleanedContent.split(/\s+/).length} words) ---\n${cleanedContent}`;

            const modelOverride = SEMANTIC_MODELS[this.semanticModelCounter++ % 2];
            const response = await this.aiService.generateSemanticAnalysis<{
                keyWords: string;
                keyPoints: string;
            }>(
                fullPrompt,
                responseSchema,
                1200, // Appropriate token limit for single note
                0.2, // Low temperature for consistent results
                0.72, // Default topP
                modelOverride
            );

            // Extract the result (single object, not array)
            const analysis = response.result;
            const wordCount = content.split(/\s+/).length;

            // Format the summary text for display
            const summaryText = `**Key Words:** ${analysis.keyWords}
**Key Points:** ${analysis.keyPoints}`;

            // Format for display in modal (includes word count)
            const displayFormat = `${summaryText}

*Original word count: ${wordCount} words*
*Generated using Google ${this.aiService.getSemanticModelName()}*`;

            // Format for writing to note (callout format without word count)
            const writeFormat = `> [!summary] AI Summary
> ${summaryText.replace(/\n/g, '\n> ')}`;

            return JSON.stringify({
                displayFormat,
                writeFormat
            });
        } catch (error) {
            console.error('Structured analysis failed:', error);
            
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

    private displayAISummary(summary: string, originalFileName: string): void {
        const { displayFormat, writeFormat } = JSON.parse(summary);
        const modal = new AISummaryModal(this.app, displayFormat, writeFormat, originalFileName);
        modal.open();
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
        this.aiService.updateSettings(settings);
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