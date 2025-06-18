import { App, Modal, setIcon } from 'obsidian';

// Import types from the main manager file
export interface TokenUsage {
    promptTokens: number;
    candidatesTokens: number;
    totalTokens: number;
}

export interface VaultAnalysisResult {
    id: string;
    title: string;
    summary: string;
    keywords: string;
    knowledgeDomain: string;
    created: string;
    modified: string;
    path: string;
    wordCount: number;
}

export interface VaultAnalysisData {
    generatedAt: string;
    totalFiles: number;
    apiProvider: string;
    tokenUsage: TokenUsage;
    results: VaultAnalysisResult[];
}

// Import type for the manager
export interface VaultAnalysisManager {
    generateVaultAnalysis(): Promise<void>;
}

export class VaultAnalysisModal extends Modal {
    private analysisData: VaultAnalysisData | null;
    private currentView: string = 'semantic';
    private contentContainer: HTMLElement;
    private hasExistingData: boolean;
    private vaultAnalysisManager: VaultAnalysisManager;

    constructor(app: App, analysisData: VaultAnalysisData | null, hasExistingData: boolean, vaultAnalysisManager: VaultAnalysisManager) {
        super(app);
        this.analysisData = analysisData;
        this.hasExistingData = hasExistingData;
        this.vaultAnalysisManager = vaultAnalysisManager;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Set landscape layout dimensions
        modalEl.style.width = '90vw';
        modalEl.style.height = '80vh';
        modalEl.style.maxWidth = '900px';
        modalEl.style.maxHeight = '800px';
        
        // Create header with navigation
        this.createHeader(contentEl);
        
        // Create main content container
        this.contentContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-content-container' 
        });
        
        // Load initial view
        this.loadView('semantic');
    }

    private createHeader(container: HTMLElement): void {
        const headerContainer = container.createEl('div', { 
            cls: 'vault-analysis-header' 
        });
        
        // Title
        headerContainer.createEl('h2', { 
            text: 'Vault Analysis',
            cls: 'vault-analysis-main-title'
        });
        
        // Navigation tabs
        const navContainer = headerContainer.createEl('div', { 
            cls: 'vault-analysis-nav' 
        });
        
        const tabs = [
            { id: 'semantic', label: 'Semantic Analysis', icon: 'search' },
            { id: 'structure', label: 'Knowledge Structure', icon: 'layout-panel-top' },
            { id: 'evolution', label: 'Knowledge Evolution', icon: 'trending-up' },
            { id: 'actions', label: 'Recommended Actions', icon: 'lightbulb' }
        ];
        
        tabs.forEach(tab => {
            const tabButton = navContainer.createEl('button', {
                cls: `vault-analysis-tab${this.currentView === tab.id ? ' active' : ''}`,
                text: tab.label
            });
            
            // Add icon
            const icon = tabButton.createEl('span', { cls: 'tab-icon' });
            setIcon(icon, tab.icon);
            tabButton.prepend(icon);
            
            tabButton.addEventListener('click', () => {
                this.switchView(tab.id);
            });
        });
    }

    private switchView(viewId: string): void {
        this.currentView = viewId;
        
        // Update active tab
        const tabs = this.contentEl.querySelectorAll('.vault-analysis-tab');
        tabs.forEach(tab => {
            tab.removeClass('active');
        });
        const activeTab = this.contentEl.querySelector(`.vault-analysis-tab:nth-child(${['semantic', 'structure', 'evolution', 'actions'].indexOf(viewId) + 1})`);
        if (activeTab) {
            activeTab.addClass('active');
        }
        
        // Load new view content
        this.loadView(viewId);
    }

    private loadView(viewId: string): void {
        this.contentContainer.empty();
        
        switch (viewId) {
            case 'semantic':
                this.loadSemanticAnalysisView();
                break;
            case 'structure':
                this.loadKnowledgeStructureView();
                break;
            case 'evolution':
                this.loadKnowledgeEvolutionView();
                break;
            case 'actions':
                this.loadRecommendedActionsView();
                break;
            default:
                this.loadSemanticAnalysisView();
        }
    }

    private loadSemanticAnalysisView(): void {
        if (!this.hasExistingData || !this.analysisData) {
            // Show empty state
            this.showEmptyState();
            return;
        }

        // Summary section
        const summaryContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-summary' 
        });
        
        summaryContainer.createEl('p', {
            text: `Total files analyzed: ${this.analysisData.totalFiles}`
        });
        
        summaryContainer.createEl('p', {
            text: `Generated: ${new Date(this.analysisData.generatedAt).toLocaleString()}`
        });
        
        summaryContainer.createEl('p', {
            text: `API Provider: ${this.analysisData.apiProvider}`
        });
        
        // Token usage information
        if (this.analysisData.tokenUsage && this.analysisData.tokenUsage.totalTokens > 0) {
            summaryContainer.createEl('p', {
                text: `Tokens used: ${this.analysisData.tokenUsage.totalTokens.toLocaleString()} (${this.analysisData.tokenUsage.promptTokens.toLocaleString()} input + ${this.analysisData.tokenUsage.candidatesTokens.toLocaleString()} output)`
            });
        }

        // Search functionality
        const searchContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-search' 
        });
        
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search notes by title, keywords, or domain...',
            cls: 'vault-analysis-search-input'
        });
        
        // Results container
        const resultsContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-results' 
        });
        
        // Display results function
        const displayResults = (filteredResults: VaultAnalysisResult[]) => {
            resultsContainer.empty();
            
            if (filteredResults.length === 0) {
                resultsContainer.createEl('p', {
                    text: 'No results found matching your search.',
                    cls: 'no-results'
                });
                return;
            }
            
            filteredResults.forEach(result => {
                const resultItem = resultsContainer.createEl('div', { 
                    cls: 'vault-analysis-result-item' 
                });
                
                const titleEl = resultItem.createEl('h3', {
                    text: result.title,
                    cls: 'result-title'
                });
                
                // Make title clickable to open the note
                titleEl.style.cursor = 'pointer';
                titleEl.style.color = 'var(--text-accent)';
                titleEl.addEventListener('click', async () => {
                    const file = this.app.vault.getAbstractFileByPath(result.path);
                    if (file) {
                        await this.app.workspace.openLinkText(file.path, '');
                        this.close();
                    }
                });
                
                resultItem.createEl('p', {
                    text: result.summary,
                    cls: 'result-summary'
                });
                
                resultItem.createEl('p', {
                    text: `Keywords: ${result.keywords}`,
                    cls: 'result-keywords'
                });
                
                resultItem.createEl('p', {
                    text: `Knowledge Domain: ${result.knowledgeDomain}`,
                    cls: 'result-domain'
                });
                
                const metaContainer = resultItem.createEl('div', {
                    cls: 'result-meta'
                });
                
                metaContainer.createEl('span', {
                    text: `${result.wordCount} words`,
                    cls: 'result-word-count'
                });
                
                // Display dates (created and modified) on the same line
                const dateInfo = [];
                if (result.created) {
                    dateInfo.push(`Created: ${new Date(result.created).toLocaleDateString()}`);
                }
                if (result.modified) {
                    dateInfo.push(`Modified: ${new Date(result.modified).toLocaleDateString()}`);
                }
                if (dateInfo.length > 0) {
                    metaContainer.createEl('span', {
                        text: ` • ${dateInfo.join(' • ')}`,
                        cls: 'result-date'
                    });
                }
            });
        };
        
        // Initial display
        displayResults(this.analysisData.results);
        
        // Search functionality
        searchInput.addEventListener('input', (e: Event) => {
            const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
            
            if (!searchTerm || !this.analysisData?.results) {
                displayResults(this.analysisData?.results || []);
                return;
            }
            
            const filteredResults = this.analysisData.results.filter(result => 
                result.title.toLowerCase().includes(searchTerm) ||
                result.summary.toLowerCase().includes(searchTerm) ||
                result.keywords.toLowerCase().includes(searchTerm) ||
                result.knowledgeDomain.toLowerCase().includes(searchTerm)
            );
            
            displayResults(filteredResults);
        });
        
        // Action buttons
        this.createActionButtons();
    }

    private showEmptyState(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'No vault analysis has been generated yet'
        });
        
        placeholderContainer.createEl('p', {
            text: 'Click the button below to analyze your entire vault and extract summaries, keywords, and knowledge domains from all notes.'
        });
        
        // Action buttons
        this.createActionButtons();
    }

    private createActionButtons(): void {
        const buttonContainer = this.contentContainer.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        // Generate/Update button
        const actionButton = buttonContainer.createEl('button', { 
            text: this.hasExistingData ? 'Update Analysis' : 'Generate Analysis',
            cls: 'mod-cta'
        });
        
        actionButton.addEventListener('click', async () => {
            this.close();
            await this.vaultAnalysisManager.generateVaultAnalysis();
        });
    }

    private loadKnowledgeStructureView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Knowledge Structure Analysis'
        });
        
        if (!this.hasExistingData) {
            placeholderContainer.createEl('p', {
                text: 'Please generate vault analysis first to access this feature.',
                cls: 'analysis-required'
            });
        } else {
            placeholderContainer.createEl('p', {
                text: 'This view will show the structural relationships between your notes, including:'
            });
            
            const featureList = placeholderContainer.createEl('ul');
            const features = [
                'Note clustering by knowledge domains',
                'Connection strength analysis',
                'Knowledge gaps identification',
                'Topic hierarchies and relationships'
            ];
            
            features.forEach(feature => {
                featureList.createEl('li', { text: feature });
            });
        }
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });

        // Action buttons
        this.createActionButtons();
    }

    private loadKnowledgeEvolutionView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Knowledge Evolution Analysis'
        });
        
        if (!this.hasExistingData) {
            placeholderContainer.createEl('p', {
                text: 'Please generate vault analysis first to access this feature.',
                cls: 'analysis-required'
            });
        } else {
            placeholderContainer.createEl('p', {
                text: 'This view will track how your knowledge has evolved over time, including:'
            });
            
            const featureList = placeholderContainer.createEl('ul');
            const features = [
                'Timeline of knowledge development',
                'Topic emergence and decline patterns',
                'Note creation and modification trends',
                'Learning trajectory visualization'
            ];
            
            features.forEach(feature => {
                featureList.createEl('li', { text: feature });
            });
        }
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });

        // Action buttons
        this.createActionButtons();
    }

    private loadRecommendedActionsView(): void {
        const placeholderContainer = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        placeholderContainer.createEl('h3', {
            text: 'Recommended Actions'
        });
        
        if (!this.hasExistingData) {
            placeholderContainer.createEl('p', {
                text: 'Please generate vault analysis first to access this feature.',
                cls: 'analysis-required'
            });
        } else {
            placeholderContainer.createEl('p', {
                text: 'This view will provide AI-powered recommendations for improving your vault, including:'
            });
            
            const featureList = placeholderContainer.createEl('ul');
            const features = [
                'Notes that could benefit from more connections',
                'Orphaned notes that need integration',
                'Similar notes that could be merged or linked',
                'Knowledge areas that need more development',
                'Suggested tags and organization improvements'
            ];
            
            features.forEach(feature => {
                featureList.createEl('li', { text: feature });
            });
        }
        
        placeholderContainer.createEl('p', {
            text: 'This feature is coming soon!',
            cls: 'coming-soon'
        });

        // Action buttons
        this.createActionButtons();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class VaultAnalysisInfoModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { 
            text: 'About Vault Analysis',
            cls: 'modal-title'
        });
        
        const infoContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-info' 
        });
        
        infoContainer.createEl('p', {
            text: 'Vault Analysis uses AI to analyze your entire Obsidian vault and provides:'
        });
        
        const featureList = infoContainer.createEl('ul');
        
        const features = [
            'One-sentence summaries for each note',
            'Key terms and phrases extraction',
            'Knowledge domain classification',
            'Metadata including word count and dates',
            'Search and filtering capabilities'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });
        
        infoContainer.createEl('h3', { text: 'Requirements' });
        infoContainer.createEl('p', {
            text: '• Google Gemini API key (configured in plugin settings)'
        });
        infoContainer.createEl('p', {
            text: '• Internet connection for AI processing'
        });
        
        infoContainer.createEl('h3', { text: 'Exclusions' });
        infoContainer.createEl('p', {
            text: 'The analysis respects your exclusion settings for folders and tags, ensuring only relevant notes are processed.'
        });
        
        infoContainer.createEl('h3', { text: 'Rate Limiting' });
        infoContainer.createEl('p', {
            text: 'Processing is done in batches with delays to respect API rate limits. Large vaults may take several minutes to complete.'
        });
        
        const buttonContainer = contentEl.createEl('div', { 
            cls: 'modal-button-container' 
        });
        
        const closeButton = buttonContainer.createEl('button', { 
            text: 'Close',
            cls: 'mod-cta'
        });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 