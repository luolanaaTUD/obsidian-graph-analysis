import { App, Modal, setIcon } from 'obsidian';
import { KnowledgeCalendarChart } from '../components/calendar-chart/KnowledgeCalendarChart';
import { 
    KnowledgeEvolutionAnalysisManager, 
    KnowledgeEvolutionData,
    VaultAnalysisData,
    VaultAnalysisResult} from '../ai/KnowledgeEvolutionAnalysisManager';

// Import type for the manager
export interface VaultSemanticAnalysisManager {
    generateVaultAnalysis(): Promise<void>;
}

export class VaultAnalysisModal extends Modal {
    private analysisData: VaultAnalysisData | null;
    private currentView: string = 'semantic';
    private contentContainer: HTMLElement;
    private hasExistingData: boolean;
    private vaultSemanticAnalysisManager: VaultSemanticAnalysisManager;
    private knowledgeEvolutionManager: KnowledgeEvolutionAnalysisManager;
    private settings: { excludeFolders: string[]; excludeTags: string[] };
    private analysisResultsContainer: HTMLElement | null = null;
    private knowledgeEvolutionData: KnowledgeEvolutionData | null = null;

    constructor(
        app: App, 
        analysisData: VaultAnalysisData | null, 
        hasExistingData: boolean, 
        vaultSemanticAnalysisManager: VaultSemanticAnalysisManager,
        knowledgeEvolutionManager: KnowledgeEvolutionAnalysisManager,
        settings: { excludeFolders: string[]; excludeTags: string[] } = { excludeFolders: [], excludeTags: [] }
    ) {
        super(app);
        this.analysisData = analysisData;
        this.hasExistingData = hasExistingData;
        this.vaultSemanticAnalysisManager = vaultSemanticAnalysisManager;
        this.knowledgeEvolutionManager = knowledgeEvolutionManager;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Set landscape layout dimensions - remove fixed height to prevent modal scrolling
        modalEl.style.width = '90vw';
        modalEl.style.height = 'auto';
        modalEl.style.maxWidth = '900px';
        modalEl.style.maxHeight = '90vh';
        
        // Ensure modal content doesn't scroll
        contentEl.style.overflow = 'hidden';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';
        contentEl.style.height = '100%';
        
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
        
        // Main header row with icon and navigation
        const headerRow = headerContainer.createEl('div', { 
            cls: 'vault-analysis-header-row' 
        });
        
        // Title icon (same as ribbon)
        const titleIcon = headerRow.createEl('div', { 
            cls: 'vault-analysis-main-icon'
        });
        setIcon(titleIcon, 'waypoints');
        
        // Navigation tabs
        const navContainer = headerRow.createEl('div', { 
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
            
            tabButton.addEventListener('click', async () => {
                await this.switchView(tab.id);
            });
        });
    }

    private async switchView(viewId: string): Promise<void> {
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
        await this.loadView(viewId);
    }

    private async loadView(viewId: string): Promise<void> {
        this.contentContainer.empty();
        
        switch (viewId) {
            case 'semantic':
                this.loadSemanticAnalysisView();
                break;
            case 'structure':
                this.loadKnowledgeStructureView();
                break;
            case 'evolution':
                await this.loadKnowledgeEvolutionView();
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
        const summarySection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        summarySection.createEl('h3', {
            text: 'Analysis Summary',
            cls: 'vault-analysis-section-title'
        });
        
        const summaryContainer = summarySection.createEl('div', { 
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

        // Search section
        const searchSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        searchSection.createEl('h3', {
            text: 'Search & Filter',
            cls: 'vault-analysis-section-title'
        });
        
        const searchContainer = searchSection.createEl('div', { 
            cls: 'vault-analysis-search' 
        });
        
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search notes by title, keywords, or domain...',
            cls: 'vault-analysis-search-input'
        });
        
        // Results section
        const resultsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        resultsSection.createEl('h3', {
            text: 'Analysis Results',
            cls: 'vault-analysis-section-title'
        });
        
        const resultsContainer = resultsSection.createEl('div', { 
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
                
                // Display graph metrics if available
                if (result.graphMetrics) {
                    const metrics = [
                        { key: 'degreeCentrality', label: 'Degree' },
                        { key: 'betweennessCentrality', label: 'Betweenness' },
                        { key: 'closenessCentrality', label: 'Closeness' },
                        { key: 'eigenvectorCentrality', label: 'Eigenvector' }
                    ];
                    
                    const metricValues = metrics
                        .map(metric => {
                            const value = result.graphMetrics![metric.key as keyof typeof result.graphMetrics];
                            return value !== undefined && value !== null ? `${metric.label}-${value.toFixed(3)}` : null;
                        })
                        .filter(Boolean);
                    
                    if (metricValues.length > 0) {
                        resultItem.createEl('p', {
                            text: `Graph Centrality Metrics: ${metricValues.join(', ')}`,
                            cls: 'result-domain'
                        });
                    }
                }
                
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
            await this.vaultSemanticAnalysisManager.generateVaultAnalysis();
        });
    }

    private loadKnowledgeStructureView(): void {
        const structureSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        structureSection.createEl('h3', {
            text: 'Knowledge Structure Analysis',
            cls: 'vault-analysis-section-title'
        });
        
        const placeholderContainer = structureSection.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
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

        // Action buttons section
        const actionsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        actionsSection.createEl('h3', {
            text: 'Actions',
            cls: 'vault-analysis-section-title'
        });
        
        // Move the button creation context to this section
        const originalContentContainer = this.contentContainer;
        this.contentContainer = actionsSection;
        this.createActionButtons();
        this.contentContainer = originalContentContainer;
    }

    private async loadKnowledgeEvolutionView(): Promise<void> {
        // Create the main container with a scrollable layout
        const evolutionContainer = this.contentContainer.createEl('div', { 
            cls: 'knowledge-evolution-container' 
        });
        
        // Add CSS for proper scrolling
        evolutionContainer.style.overflow = 'auto';
        evolutionContainer.style.height = '100%';
        evolutionContainer.style.paddingRight = '10px';

        if (!this.hasExistingData || !this.analysisData) {
            this.showEvolutionEmptyState(evolutionContainer);
            return;
        }

        // 1. Calendar Section (shown by default)
        await this.createCalendarSection(evolutionContainer);
        
        // 2. Check for cached analysis and display directly if available
        this.knowledgeEvolutionData = await this.knowledgeEvolutionManager.loadCachedKnowledgeEvolution();
        
        if (this.knowledgeEvolutionData) {
            // Show cached analysis directly
            await this.displayCachedAnalysis(evolutionContainer);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(evolutionContainer);
        } else {
            // Show Generate Analysis button
            await this.createAnalysisButtonSection(evolutionContainer);
        }
    }

    private showEvolutionEmptyState(container: HTMLElement): void {
        const emptyState = container.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('h3', {
            text: 'Knowledge Evolution Analysis',
            cls: 'vault-analysis-section-title'
        });
        
        emptyState.createEl('p', {
            text: 'Knowledge Evolution Analysis requires AI-powered vault analysis to be completed first.',
            cls: 'analysis-required'
        });
        
        const featureList = emptyState.createEl('ul');
        const features = [
            'Knowledge Development Timeline - track how your understanding evolved',
            'Topic Introduction Patterns - see when different subjects entered your system',
            'Focus Shift Analysis - compare current interests vs historical patterns',
            'Learning Velocity - analyze the pace of knowledge acquisition over time'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });

        // Action buttons section
        const actionsSection = container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        actionsSection.createEl('h3', {
            text: 'Actions',
            cls: 'vault-analysis-section-title'
        });

        const originalContentContainer = this.contentContainer;
        this.contentContainer = actionsSection;
        this.createActionButtons();
        this.contentContainer = originalContentContainer;
    }

    private async createCalendarSection(container: HTMLElement): Promise<void> {
        const calendarSection = container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        calendarSection.createEl('h3', {
            text: 'Knowledge Evolution Calendar',
            cls: 'vault-analysis-section-title'
        });

        const chartContainer = calendarSection.createEl('div', { 
            cls: 'knowledge-calendar-wrapper' 
        });

        // Create calendar chart with settings
        const calendarChart = new KnowledgeCalendarChart(
            this.app,
            chartContainer,
            { cellSize: 11 },
            this.settings.excludeFolders,
            this.settings.excludeTags
        );

        // Render the calendar chart
        await calendarChart.render();
    }

    private async createUpdateAnalysisButtonSection(container: HTMLElement): Promise<void> {
        const buttonSection = container.createEl('div', { 
            cls: 'vault-analysis-section analysis-button-section' 
        });

        buttonSection.createEl('h3', {
            text: 'Update Analysis',
            cls: 'vault-analysis-section-title'
        });

        const buttonContainer = buttonSection.createEl('div', { 
            cls: 'analysis-button-container' 
        });

        const updateButton = buttonContainer.createEl('button', {
            cls: 'analysis-trigger-button',
            text: '🔄 Update Analysis'
        });
        
        updateButton.style.background = 'var(--interactive-accent-hover)';


        updateButton.addEventListener('click', async () => {
            await this.triggerAIAnalysis(buttonSection, true);
        });
    }

    private async createAnalysisButtonSection(container: HTMLElement): Promise<void> {
        const buttonSection = container.createEl('div', { 
            cls: 'vault-analysis-section analysis-button-section' 
        });

        buttonSection.createEl('h3', {
            text: 'AI-Powered Knowledge Analysis',
            cls: 'vault-analysis-section-title'
        });

        const buttonContainer = buttonSection.createEl('div', { 
            cls: 'analysis-button-container' 
        });

        // Show "Generate Analysis" button
        const analysisButton = buttonContainer.createEl('button', {
            cls: 'analysis-trigger-button',
            text: '🧠 Generate AI Analysis'
        });


        // Store reference to the container for later use
        this.analysisResultsContainer = container;

        analysisButton.addEventListener('click', async () => {
            await this.triggerAIAnalysis(buttonSection, false);
        });
    }

    private async triggerAIAnalysis(buttonSection: HTMLElement, isUpdate: boolean = false): Promise<void> {
        // Show loading state
        const loadingContainer = buttonSection.createEl('div', { 
            cls: 'evolution-loading' 
        });
        loadingContainer.createEl('h3', { 
            text: isUpdate ? 'Updating Knowledge Evolution Analysis...' : 'Analyzing Knowledge Evolution...' 
        });
        loadingContainer.createEl('p', { text: 'Processing AI analysis data to generate insights...' });

        try {
            // Generate AI-powered evolution analysis and cache it
            const evolutionData = await this.knowledgeEvolutionManager.generateAndCacheEvolutionAnalysis();
            this.knowledgeEvolutionData = evolutionData;
            
            // Remove loading state
            loadingContainer.remove();
            
            // Display the cached analysis
            await this.displayCachedAnalysis(buttonSection);

        } catch (error) {
            console.error('Error generating evolution analysis:', error);
            loadingContainer.remove();
            
            const errorContainer = buttonSection.createEl('div', { 
                cls: 'evolution-error' 
            });
            errorContainer.createEl('h4', { text: 'Error Loading Evolution Analysis' });
            errorContainer.createEl('p', { 
                text: 'There was an issue analyzing your knowledge evolution. Please check the console for details.' 
            });
        }
    }

    private async displayCachedAnalysis(container: HTMLElement): Promise<void> {
        if (!this.knowledgeEvolutionData) return;

        const data = this.knowledgeEvolutionData.analysis;
        
        // Create analysis sections with structured data
        this.createStructuredAnalysisSection(container, 'Knowledge Development Timeline', data.timeline);
        this.createStructuredAnalysisSection(container, 'Topic Introduction Patterns', data.topicPatterns);
        this.createStructuredAnalysisSection(container, 'Focus Shift Analysis', data.focusShift);
        this.createStructuredAnalysisSection(container, 'Learning Velocity Analysis', data.learningVelocity);
    }

    private createStructuredAnalysisSection(container: HTMLElement, title: string, analysisData: any): void {
        const section = container.createEl('div', { cls: 'vault-analysis-section' });
        
        section.createEl('h3', {
            text: title,
            cls: 'vault-analysis-section-title'
        });
        
        // AI Insights Section
        const insightsContainer = section.createEl('div', { cls: 'ai-insights-container' });
        insightsContainer.createEl('h4', { 
            text: '🧠 AI Analysis',
            cls: 'ai-insights-title'
        });
        
        const insightsText = insightsContainer.createEl('div', { 
            cls: 'ai-insights-text'
        });
        
        // Display the narrative content
        if (analysisData.narrative || analysisData.exploration || analysisData.trends) {
            const narrative = analysisData.narrative || analysisData.exploration || analysisData.trends;
            insightsText.innerHTML = narrative.content.replace(/\n/g, '<br>');
        }
        
        // Add structured data visualizations based on analysis type
        if (title.includes('Timeline') && analysisData.phases) {
            this.addTimelineVisualization(section, analysisData.phases);
        } else if (title.includes('Topic') && analysisData.introductionTimeline) {
            this.addTopicVisualization(section, analysisData.introductionTimeline);
        } else if (title.includes('Focus') && analysisData.shifts) {
            this.addFocusShiftVisualization(section, analysisData.shifts);
        } else if (title.includes('Velocity') && analysisData.metrics) {
            this.addVelocityVisualization(section, analysisData.metrics);
        }
    }

    // Visualization helper methods (simplified for now)
    private addTimelineVisualization(section: HTMLElement, phases: any[]): void {
        const viz = section.createEl('div', { cls: 'timeline-visualization' });
        phases.forEach(phase => {
            const phaseEl = viz.createEl('div', { cls: 'timeline-phase' });
            phaseEl.innerHTML = `<strong>${phase.period}</strong>: ${phase.description}`;
        });
    }

    private addTopicVisualization(section: HTMLElement, timeline: any[]): void {
        const viz = section.createEl('div', { cls: 'topic-visualization' });
        timeline.forEach(item => {
            if (item.newDomains.length > 0) {
                const itemEl = viz.createEl('div', { cls: 'topic-period' });
                itemEl.innerHTML = `<strong>${item.period}</strong>: ${item.newDomains.join(', ')}`;
            }
        });
    }

    private addFocusShiftVisualization(section: HTMLElement, shifts: any[]): void {
        const viz = section.createEl('div', { cls: 'focus-visualization' });
        shifts.forEach(shift => {
            const shiftEl = viz.createEl('div', { cls: 'focus-shift' });
            shiftEl.innerHTML = `<strong>${shift.period}</strong>: ${shift.newAreas.length} new areas, ${shift.decreasedFocus.length} reduced`;
        });
    }

    private addVelocityVisualization(section: HTMLElement, metrics: any[]): void {
        const viz = section.createEl('div', { cls: 'velocity-visualization' });
        metrics.forEach(metric => {
            const metricEl = viz.createEl('div', { cls: 'velocity-metric' });
            const trend = metric.trendIndicator === 'up' ? '📈' : metric.trendIndicator === 'down' ? '📉' : '➡️';
            metricEl.innerHTML = `<strong>${metric.period}</strong>: ${metric.notesCreated} notes, ${metric.wordsWritten} words ${trend}`;
        });
    }

    private loadRecommendedActionsView(): void {
        const recommendationsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        recommendationsSection.createEl('h3', {
            text: 'Recommended Actions',
            cls: 'vault-analysis-section-title'
        });
        
        const placeholderContainer = recommendationsSection.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
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

        // Action buttons section
        const actionsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        actionsSection.createEl('h3', {
            text: 'Actions',
            cls: 'vault-analysis-section-title'
        });
        
        // Move the button creation context to this section
        const originalContentContainer = this.contentContainer;
        this.contentContainer = actionsSection;
        this.createActionButtons();
        this.contentContainer = originalContentContainer;
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