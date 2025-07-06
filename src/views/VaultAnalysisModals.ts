import { App, Modal, setIcon, Notice } from 'obsidian';
import { KnowledgeCalendarChart } from '../components/calendar-chart/KnowledgeCalendarChart';
import { 
    VaultAnalysisData, 
    VaultAnalysisResult, 
    MasterAnalysisManager, 
    StructureAnalysisData,
    EvolutionAnalysisData,
    ActionsAnalysisData
} from '../ai/MasterAnalysisManager';
import { KnowledgeEvolutionData } from '../ai/visualization/KnowledgeEvolutionManager';
import { KnowledgeStructureManager } from '../ai/visualization/KnowledgeStructureManager';
import { GraphAnalysisSettings } from '../types/types';

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
    private settings: GraphAnalysisSettings;
    private analysisResultsContainer: HTMLElement | null = null;
    private knowledgeEvolutionData: KnowledgeEvolutionData | null = null;
    private masterAnalysisManager: MasterAnalysisManager;
    
    // Tab-specific analysis data
    private structureAnalysisData: StructureAnalysisData | null = null;
    private evolutionAnalysisData: EvolutionAnalysisData | null = null;
    private actionsAnalysisData: ActionsAnalysisData | null = null;
    
    private knowledgeStructureManager: KnowledgeStructureManager | null = null;

    constructor(
        app: App, 
        analysisData: VaultAnalysisData | null, 
        hasExistingData: boolean, 
        vaultSemanticAnalysisManager: VaultSemanticAnalysisManager,
        settings: GraphAnalysisSettings
    ) {
        super(app);
        this.analysisData = analysisData;
        this.hasExistingData = hasExistingData;
        this.vaultSemanticAnalysisManager = vaultSemanticAnalysisManager;
        this.settings = settings;
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings);
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
                await this.loadKnowledgeStructureView();
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
            
            const filteredResults = this.analysisData.results.filter((result: VaultAnalysisResult) => 
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

    private async loadKnowledgeStructureView(): Promise<void> {
        // Create the main container with a scrollable layout
        const structureContainer = this.contentContainer.createEl('div', { 
            cls: 'knowledge-structure-container' 
        });
        
        // Add CSS for proper scrolling
        structureContainer.style.overflow = 'auto';
        structureContainer.style.height = '100%';
        structureContainer.style.paddingRight = '10px';

        if (!this.hasExistingData || !this.analysisData) {
            this.showStructureEmptyState(structureContainer);
            return;
        }

        // Check for cached tab-specific analysis
        try {
            this.structureAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('structure') as StructureAnalysisData;
            if (this.structureAnalysisData) {
                console.log('Loaded cached structure analysis');
            } else {
                console.log('No cached structure analysis available yet');
            }
        } catch (error) {
            console.log('Error loading cached structure analysis:', error);
            this.structureAnalysisData = null;
        }
        
        if (this.structureAnalysisData?.knowledgeStructure) {
            // Show cached analysis directly using KnowledgeStructureManager
            await this.displayKnowledgeStructureWithManager(structureContainer);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(structureContainer, 'structure');
        } else {
            // Show Generate Analysis button
            await this.createAnalysisButtonSection(structureContainer, 'structure');
        }
    }

    private async displayKnowledgeStructureWithManager(container: HTMLElement): Promise<void> {
        // Use tab-specific data only
        const structureData = this.structureAnalysisData?.knowledgeStructure;
                             
        if (!structureData) return;

        console.log('Displaying Knowledge Structure with sunburst chart...');

        // Create and initialize the KnowledgeStructureManager
        this.knowledgeStructureManager = new KnowledgeStructureManager(
            this.app,
            this.settings
        );

        // Render the knowledge structure visualization with data
        await this.knowledgeStructureManager.renderWithData(
            container,
            structureData
        );
    }

    private showStructureEmptyState(container: HTMLElement): void {
        const emptyState = container.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('h3', {
            text: '🧠 Knowledge Structure Analysis',
            cls: 'vault-analysis-section-title'
        });
        
        emptyState.createEl('p', {
            text: 'Generate AI-powered analysis to unlock advanced knowledge structure insights.',
            cls: 'analysis-required'
        });
        
        const featureList = emptyState.createEl('ul', { cls: 'feature-list' });
        const features = [
            '📊 Interactive Sunburst Chart - explore hierarchical knowledge domains',
            '🔗 Knowledge Network Analysis - identify bridge notes, foundations, and authorities',
            '🎯 Knowledge Gaps Discovery - find underexplored areas in your vault',
            '📈 Domain Distribution - see how your knowledge is organized across fields'
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

    private async createUpdateAnalysisButtonSection(container: HTMLElement, tabName: string = ''): Promise<void> {
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
            await this.triggerAIAnalysis(buttonSection, true, tabName);
        });
    }

    private async createAnalysisButtonSection(container: HTMLElement, tabName: string = ''): Promise<void> {
        const buttonSection = container.createEl('div', { 
            cls: 'vault-analysis-section analysis-button-section' 
        });

        buttonSection.createEl('h3', {
            text: 'AI-Powered Knowledge Analysis',
            cls: 'vault-analysis-section-title'
        });

        // Add token usage warning
        const warningContainer = buttonSection.createEl('div', {
            cls: 'analysis-token-warning'
        });

        warningContainer.innerHTML = `
            <div style="background: var(--background-modifier-info); 
                        border: 1px solid var(--background-modifier-border); 
                        border-radius: 8px; 
                        padding: 16px; 
                        margin: 16px 0;
                        color: var(--text-normal);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 18px;">🧪</span>
                    <strong>TEST MODE - Minimal Token Usage</strong>
                </div>
                <p style="margin: 8px 0; font-size: 14px;">
                    This test analysis will process only the first 3 notes from your vault 
                    to verify API connectivity and basic functionality.
                </p>
                <p style="margin: 8px 0; font-size: 14px;">
                    <strong>Estimated cost:</strong> Very minimal (~200-500 tokens, <$0.01)
                </p>
                <p style="margin: 0; font-size: 13px; color: var(--text-muted);">
                    If successful, you can disable test mode for full analysis.
                </p>
            </div>
        `;

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
            await this.triggerAIAnalysis(buttonSection, false, tabName);
        });
    }

    private async triggerAIAnalysis(buttonSection: HTMLElement, isUpdate: boolean = false, tabName: string = ''): Promise<void> {
        buttonSection.empty();
        
        const loadingContainer = buttonSection.createEl('div', { 
            cls: 'evolution-loading' 
        });
        
        let loadingTitle = isUpdate ? 'Updating Knowledge Analysis...' : 'Generating AI Knowledge Analysis...';
        if (tabName) {
            loadingTitle = isUpdate ? 
                `Updating ${this.getTabDisplayName(tabName)} Analysis...` : 
                `Generating ${this.getTabDisplayName(tabName)} Analysis...`;
        }
        
        loadingContainer.createEl('h3', { text: loadingTitle });
        
        const loadingText = loadingContainer.createEl('p');
        loadingText.innerHTML = `
            <strong style="color: var(--color-orange);">🧪 ${tabName ? `Generating ${this.getTabDisplayName(tabName)} Analysis` : 'Generating All Analyses'}</strong><br>
            ${tabName ? `This includes ${this.getTabDescription(tabName)}.` : 'This includes knowledge structure, evolution, and recommendations.'}<br>
            <strong>Estimated time:</strong> 10-30 seconds.<br>
            <small style="color: var(--text-muted);">Results will be cached for future use.</small>
        `;

        try {
            // Ensure DDC template is loaded before proceeding
            const templateLoaded = await this.masterAnalysisManager.ensureDDCTemplateLoaded();
            if (!templateLoaded) {
                throw new Error('Failed to load DDC template. Please ensure the plugin is correctly installed.');
            }
            
            // Generate analysis based on tab name or all analyses
            if (tabName === 'structure') {
                this.structureAnalysisData = await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
            } else if (tabName === 'evolution') {
                this.evolutionAnalysisData = await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                this.knowledgeEvolutionData = this.evolutionAnalysisData.knowledgeEvolution;
            } else if (tabName === 'actions') {
                this.actionsAnalysisData = await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
            } else {
                // Generate all tab-specific analyses
                this.structureAnalysisData = await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
                this.evolutionAnalysisData = await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                this.knowledgeEvolutionData = this.evolutionAnalysisData.knowledgeEvolution;
                this.actionsAnalysisData = await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
            }
            
            // Remove loading state
            loadingContainer.remove();
            
            // Show success notice
            const successMessage = tabName ? 
                `✅ ${this.getTabDisplayName(tabName)} Analysis completed successfully!` : 
                '✅ AI Knowledge Analysis completed successfully! Results cached for future use.';
            new Notice(successMessage);
            
            // Refresh the current view to show results
            if (this.currentView === 'structure') {
                await this.displayKnowledgeStructureWithManager(buttonSection);
                await this.createUpdateAnalysisButtonSection(buttonSection, 'structure');
            } else if (this.currentView === 'evolution') {
                await this.displayCachedAnalysis(buttonSection);
                await this.createUpdateAnalysisButtonSection(buttonSection, 'evolution');
            } else if (this.currentView === 'actions') {
                await this.displayRecommendedActionsResults(buttonSection);
                await this.createUpdateAnalysisButtonSection(buttonSection, 'actions');
            } else {
                // For other views, just display generic cached analysis
                await this.displayCachedAnalysis(buttonSection);
                await this.createUpdateAnalysisButtonSection(buttonSection);
            }

        } catch (error) {
            console.error('Error generating analysis:', error);
            loadingContainer.remove();
            
            const errorContainer = buttonSection.createEl('div', { 
                cls: 'evolution-error' 
            });
            errorContainer.createEl('h4', { text: 'Error Generating AI Analysis' });
            errorContainer.createEl('p', { 
                text: `Failed to generate analysis: ${(error as Error).message}` 
            });
            
            new Notice(`❌ Failed to generate AI analysis: ${(error as Error).message}`);
        }
    }

    // Helper function to get display name for tab
    private getTabDisplayName(tabName: string): string {
        switch (tabName) {
            case 'structure': return 'Knowledge Structure';
            case 'evolution': return 'Knowledge Evolution';
            case 'actions': return 'Recommended Actions';
            default: return 'Knowledge';
        }
    }

    // Helper function to get tab description
    private getTabDescription(tabName: string): string {
        switch (tabName) {
            case 'structure': return 'domain classification, hierarchical structure, and network analysis';
            case 'evolution': return 'timeline analysis, topic patterns, and learning velocity';
            case 'actions': return 'maintenance tasks, connection opportunities, and learning paths';
            default: return 'comprehensive knowledge analysis';
        }
    }

    private async displayCachedAnalysis(container: HTMLElement): Promise<void> {
        if (!this.knowledgeEvolutionData) return;

        // Access the data properties directly (new KnowledgeEvolutionData structure)
        const data = this.knowledgeEvolutionData;
        
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
                
                // Parse DDC-compliant domain names for cleaner display
                const cleanDomains = item.newDomains.map((domain: string) => {
                    const domainParts = domain.match(/^(.+?)\s*\((.+)\)$/) || [null, domain, ''];
                    return domainParts[1] || domain;
                });
                
                itemEl.innerHTML = `<strong>${item.period}</strong>: ${cleanDomains.join(', ')}`;
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
        // Create the main container with a scrollable layout
        const recommendationsSection = this.contentContainer.createEl('div', { 
            cls: 'recommended-actions-container' 
        });
        
        // Add CSS for proper scrolling
        recommendationsSection.style.overflow = 'auto';
        recommendationsSection.style.height = '100%';
        recommendationsSection.style.paddingRight = '10px';
        
        if (!this.hasExistingData || !this.analysisData) {
            const placeholderContainer = recommendationsSection.createEl('div', { 
                cls: 'vault-analysis-placeholder' 
            });
            
            placeholderContainer.createEl('p', {
                text: 'Please generate vault analysis first to access this feature.',
                cls: 'analysis-required'
            });
            
            // Action buttons section
            const actionsSection = this.contentContainer.createEl('div', { 
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
            return;
        }
        
        // Check for cached tab-specific analysis
        this.loadActionsAnalysisData().then(hasData => {
            if (hasData) {
                this.displayRecommendedActionsResults(recommendationsSection);
                this.createUpdateAnalysisButtonSection(recommendationsSection, 'actions');
            } else {
                this.showActionsEmptyState(recommendationsSection);
            }
        });
    }

    // Helper method to load actions analysis data
    private async loadActionsAnalysisData(): Promise<boolean> {
        try {
            // Load tab-specific actions data
            this.actionsAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('actions') as ActionsAnalysisData;
            if (this.actionsAnalysisData) {
                console.log('Loaded cached actions analysis');
                return true;
            }
            
            console.log('No cached actions analysis available yet');
            return false;
        } catch (error) {
            console.log('Error loading cached actions analysis:', error);
            return false;
        }
    }

    private displayRecommendedActionsResults(container: HTMLElement): void {
        // Use tab-specific data only
        const actionsData = this.actionsAnalysisData?.recommendedActions;
                           
        if (!actionsData) return;

        // Knowledge Maintenance Section
        if (actionsData.maintenance && actionsData.maintenance.length > 0) {
            const maintenanceSection = container.createEl('div', { cls: 'actions-category' });
            maintenanceSection.createEl('h4', { text: '🔧 Knowledge Maintenance' });
            
            const maintenanceList = maintenanceSection.createEl('div', { cls: 'actions-list' });
            actionsData.maintenance.slice(0, 10).forEach((action: any) => {
                const actionItem = maintenanceList.createEl('div', { cls: 'action-item' });
                actionItem.innerHTML = `
                    <div class="action-title">${action.title || action.action || 'Maintenance Action'}</div>
                    <div class="action-description">${action.reason || action.description || ''}</div>
                    <div class="action-priority">${action.priority || 'medium'}</div>
                `;
            });
        }

        // Connection Opportunities Section
        if (actionsData.connections && actionsData.connections.length > 0) {
            const connectionsSection = container.createEl('div', { cls: 'actions-category' });
            connectionsSection.createEl('h4', { text: '🔗 Connection Opportunities' });
            
            const connectionsList = connectionsSection.createEl('div', { cls: 'actions-list' });
            actionsData.connections.slice(0, 10).forEach((connection: any) => {
                const connectionItem = connectionsList.createEl('div', { cls: 'action-item' });
                connectionItem.innerHTML = `
                    <div class="action-title">${connection.title || connection.suggestion || 'Connection Suggestion'}</div>
                    <div class="action-description">${connection.reason || connection.description || ''}</div>
                    <div class="action-notes">${connection.notes ? connection.notes.join(', ') : ''}</div>
                `;
            });
        }

        // Learning Paths Section
        if (actionsData.learningPaths && actionsData.learningPaths.length > 0) {
            const pathsSection = container.createEl('div', { cls: 'actions-category' });
            pathsSection.createEl('h4', { text: '📚 Learning Paths' });
            
            const pathsList = pathsSection.createEl('div', { cls: 'learning-paths-list' });
            actionsData.learningPaths.slice(0, 5).forEach((path: any) => {
                const pathItem = pathsList.createEl('div', { cls: 'learning-path-item' });
                pathItem.innerHTML = `
                    <div class="path-title">${path.title || path.name || 'Learning Path'}</div>
                    <div class="path-description">${path.description || ''}</div>
                    <div class="path-steps">${path.steps ? path.steps.join(' → ') : ''}</div>
                `;
            });
        }

        // Organization Suggestions Section
        if (actionsData.organization && actionsData.organization.length > 0) {
            const organizationSection = container.createEl('div', { cls: 'actions-category' });
            organizationSection.createEl('h4', { text: '📁 Organization Suggestions' });
            
            const organizationList = organizationSection.createEl('div', { cls: 'actions-list' });
            actionsData.organization.slice(0, 10).forEach((suggestion: any) => {
                const suggestionItem = organizationList.createEl('div', { cls: 'action-item' });
                suggestionItem.innerHTML = `
                    <div class="action-title">${suggestion.title || suggestion.suggestion || 'Organization Suggestion'}</div>
                    <div class="action-description">${suggestion.reason || suggestion.description || ''}</div>
                    <div class="action-impact">${suggestion.impact || ''}</div>
                `;
            });
        }
    }

    private showActionsEmptyState(container: HTMLElement): void {
        const emptyState = container.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('p', {
            text: 'Recommended Actions require AI-powered analysis to be completed first.',
            cls: 'analysis-required'
        });
        
        const featureList = emptyState.createEl('ul');
        const features = [
            'Knowledge Maintenance - notes that need review, updates, or improvements',
            'Connection Opportunities - suggestions for linking related concepts',
            'Learning Paths - recommended sequences for exploring new topics',
            'Organization Suggestions - ways to improve your vault structure'
        ];
        
        features.forEach(feature => {
            featureList.createEl('li', { text: feature });
        });

        // Generate Analysis Button
        const buttonContainer = emptyState.createEl('div', { 
            cls: 'analysis-button-container',
            attr: { style: 'margin-top: 24px;' }
        });

        const generateButton = buttonContainer.createEl('button', {
            cls: 'analysis-trigger-button',
            text: '🧠 Generate AI Analysis'
        });

        generateButton.addEventListener('click', async () => {
            await this.triggerAIAnalysis(container, false, 'actions');
        });
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
        
        // 2. Check for cached tab-specific analysis
        try {
            this.evolutionAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('evolution') as EvolutionAnalysisData;
            if (this.evolutionAnalysisData) {
                console.log('Loaded cached evolution analysis');
                this.knowledgeEvolutionData = this.evolutionAnalysisData.knowledgeEvolution;
            } else {
                console.log('No cached evolution analysis available yet');
                this.knowledgeEvolutionData = null;
            }
        } catch (error) {
            console.log('Error loading cached evolution analysis:', error);
            this.evolutionAnalysisData = null;
            this.knowledgeEvolutionData = null;
        }
        
        if (this.knowledgeEvolutionData) {
            // Show cached analysis directly
            await this.displayCachedAnalysis(evolutionContainer);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(evolutionContainer, 'evolution');
        } else {
            // Show Generate Analysis button
            await this.createAnalysisButtonSection(evolutionContainer, 'evolution');
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