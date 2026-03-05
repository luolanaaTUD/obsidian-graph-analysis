import { App, Modal, setIcon, Notice, MarkdownRenderer, Component } from 'obsidian';
import { KnowledgeCalendarChart } from '../components/calendar-chart/KnowledgeCalendarChart';
import { ConnectivityScatterChart } from '../components/scatter-chart/ConnectivityScatterChart';
import { ConnectionSubGraph } from '../components/connection-subgraph/ConnectionSubGraph';
import { 
    VaultAnalysisData, 
    VaultAnalysisResult, 
    MasterAnalysisManager, 
    StructureAnalysisData,
    EvolutionAnalysisData,
    ActionsAnalysisData
} from '../ai/MasterAnalysisManager';
import { KnowledgeEvolutionData, TimelineAnalysis, TopicPatternsAnalysis, FocusShiftAnalysis } from '../ai/visualization/KnowledgeEvolutionManager';
import { KnowledgeStructureManager } from '../ai/visualization/KnowledgeStructureManager';
import { KnowledgeActionsManager, ReviewCandidate } from '../ai/visualization/KnowledgeActionsManager';
import { GraphAnalysisSettings } from '../types/types';
import { getUserFriendlyMessage } from '../utils/GeminiErrorUtils';

// Import type for the manager
export interface VaultSemanticAnalysisManager {
    generateVaultAnalysis(): Promise<boolean>;
    viewVaultAnalysisResults(): Promise<void>;
    hasPendingSemanticChanges(preloadedData?: VaultAnalysisData | null): Promise<boolean>;
    isAnalysisInProgress(): boolean;
    setAnalysisInProgress(type: string): void;
    clearAnalysisInProgress(): void;
}

export class VaultAnalysisModal extends Modal {
    private analysisData: VaultAnalysisData | null;
    private currentView: string = 'semantic';
    private contentContainer!: HTMLElement;
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
    
    // Pagination state
    private currentPage: number = 1;
    private readonly itemsPerPage: number = 20;
    private filteredResults: VaultAnalysisResult[] = [];
    private paginationContainer: HTMLElement | null = null;
    private resultsSection: HTMLElement | null = null;
    private resultsContainer: HTMLElement | null = null;
    private resultsWrapper: HTMLElement | null = null;

    /** Get the plugin instance (a Component) for MarkdownRenderer lifecycle management */
    private get markdownComponent(): Component {
        const plugins = (this.app as { plugins?: { plugins?: Record<string, Component> } }).plugins?.plugins;
        const plugin = plugins?.['knowledge-graph-analysis'];
        if (!plugin || !(plugin instanceof Component)) {
            throw new Error('Plugin not found or not a Component - cannot render markdown safely');
        }
        return plugin;
    }

    constructor(
        app: App, 
        analysisData: VaultAnalysisData | null, 
        hasExistingData: boolean, 
        vaultSemanticAnalysisManager: VaultSemanticAnalysisManager,
        settings: GraphAnalysisSettings,
        initialView: string = 'semantic'
    ) {
        super(app);
        this.analysisData = analysisData;
        this.hasExistingData = hasExistingData;
        this.vaultSemanticAnalysisManager = vaultSemanticAnalysisManager;
        this.settings = settings;
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings);
        this.currentView = initialView;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('vault-analysis-modal');
        contentEl.addClass('vault-analysis-modal-content');

        // Create header with navigation
        this.createHeader(contentEl);
        
        // Create main content container
        this.contentContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-content-container' 
        });
        
        // Load initial view
        void this.loadView(this.currentView);
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
            const isDisabled = tab.id !== 'semantic' && !this.hasExistingData;
            const tabButton = navContainer.createEl('button', {
                cls: `vault-analysis-tab${this.currentView === tab.id ? ' active' : ''}${isDisabled ? ' is-disabled' : ''}`,
                text: tab.label
            });
            
            // Add icon
            const icon = tabButton.createEl('span', { cls: 'tab-icon' });
            setIcon(icon, tab.icon);
            tabButton.prepend(icon);
            
            if (isDisabled) {
                tabButton.setAttribute('aria-disabled', 'true');
                tabButton.setAttribute('title', 'Run semantic analysis first');
            } else {
                tabButton.addEventListener('click', () => {
                    void this.switchView(tab.id);
                });
            }
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
                await this.loadSemanticAnalysisView();
                break;
            case 'structure':
                await this.loadKnowledgeStructureView();
                break;
            case 'evolution':
                await this.loadKnowledgeEvolutionView();
                break;
            case 'actions':
                await this.loadRecommendedActionsView();
                break;
            default:
                await this.loadSemanticAnalysisView();
        }
    }

    private async loadSemanticAnalysisView(): Promise<void> {
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
            text: 'Analysis summary',
            cls: 'vault-analysis-section-title'
        });
        
        const summaryContainer = summarySection.createEl('div', { 
            cls: 'vault-analysis-summary' 
        });
        
        summaryContainer.createEl('p', {
            text: `Total files analyzed: ${this.analysisData.totalFiles}`
        });
        
        // Generated information
        const generatedFiles = this.analysisData.generatedFiles ?? this.analysisData.totalFiles;
        summaryContainer.createEl('p', {
            text: `Generated: ${generatedFiles} files on ${new Date(this.analysisData.generatedAt).toLocaleString()}`
        });
        
        // Updated information (if exists)
        if (this.analysisData.updatedAt) {
            const updatedFiles = this.analysisData.updatedFiles ?? 0;
            summaryContainer.createEl('p', {
                text: `Updated: ${updatedFiles} files on ${new Date(this.analysisData.updatedAt).toLocaleString()}`
            });
        }
        
        summaryContainer.createEl('p', {
            text: `API Provider: ${this.analysisData.apiProvider}`
        });

        // Token usage (if available)
        if (this.analysisData.tokenUsage) {
            const { promptTokens, candidatesTokens, totalTokens } = this.analysisData.tokenUsage;
            const formatted = (n: number) => n.toLocaleString();
            summaryContainer.createEl('p', {
                text: `Token usage: ${formatted(totalTokens)} (prompt: ${formatted(promptTokens)} + output: ${formatted(candidatesTokens)})`
            });
        }

        // Search section
        const searchSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        searchSection.createEl('h3', {
            text: 'Search & filter',
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
        this.resultsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section vault-analysis-results-section' 
        });
        
        this.resultsSection.createEl('h3', {
            text: 'Analysis results',
            cls: 'vault-analysis-section-title'
        });
        
        // Create scrollable results container wrapper
        this.resultsWrapper = this.resultsSection.createEl('div', {
            cls: 'vault-analysis-results-wrapper'
        });
        
        this.resultsContainer = this.resultsWrapper.createEl('div', { 
            cls: 'vault-analysis-results' 
        });
        
        // Display results function
        const displayResults = (filteredResults: VaultAnalysisResult[]) => {
            // Store filtered results for pagination
            this.filteredResults = filteredResults;
            
            // Reset to page 1 when results change
            this.currentPage = 1;
            
            if (filteredResults.length === 0) {
                if (this.resultsContainer) {
                    this.resultsContainer.empty();
                    this.resultsContainer.createEl('p', {
                        text: 'No results found matching your search.',
                        cls: 'no-results'
                    });
                }
                // Remove pagination if it exists
                if (this.paginationContainer) {
                    this.paginationContainer.remove();
                    this.paginationContainer = null;
                }
                return;
            }
            
            // Render current page (will use currentPage which is now 1)
            this.renderCurrentPage();
            
            // Create or update pagination controls
            const totalPages = Math.ceil(filteredResults.length / this.itemsPerPage);
            const totalResults = filteredResults.length;
            if (this.resultsSection) {
                if (this.paginationContainer) {
                    this.paginationContainer.remove();
                    this.paginationContainer = null;
                }
                this.createPaginationControls(this.resultsSection, totalPages, totalResults);
            }
        };
        
        // Initial display
        this.currentPage = 1; // Reset to first page on initial load
        displayResults(this.analysisData.results);

        // Show Update button immediately with checking state, then update async (avoids blocking UI)
        const buttonWrapper = this.contentContainer.createEl('div', { cls: 'semantic-update-button-wrapper' });
        await this.createUpdateAnalysisButtonSection(buttonWrapper, 'semantic', false, true);

        void this.vaultSemanticAnalysisManager.hasPendingSemanticChanges(this.analysisData).then(isOutdated => {
            buttonWrapper.empty();
            void this.createUpdateAnalysisButtonSection(buttonWrapper, 'semantic', isOutdated);
        });

        // Search functionality
        searchInput.addEventListener('input', (e: Event) => {
            const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
            
            // Reset to first page when search changes
            this.currentPage = 1;
            
            if (!searchTerm || !this.analysisData?.results) {
                displayResults(this.analysisData?.results || []);
                return;
            }
            
            const filteredResults = this.analysisData.results.filter((result: VaultAnalysisResult) => 
                result.title.toLowerCase().includes(searchTerm) ||
                result.summary.toLowerCase().includes(searchTerm) ||
                result.keywords.toLowerCase().includes(searchTerm) ||
                (result.knowledgeDomains && result.knowledgeDomains.some(domain => 
                    domain.toLowerCase().includes(searchTerm)
                ))
            );
            
            displayResults(filteredResults);
        });
    }

    private renderCurrentPage(): void {
        if (!this.resultsContainer) return;

        // Calculate paginated results
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedResults = this.filteredResults.slice(startIndex, endIndex);

        // Clear and re-render results
        this.resultsContainer.empty();
        paginatedResults.forEach(result => {
            const resultItem = this.resultsContainer!.createEl('div', { 
                cls: 'vault-analysis-result-item' 
            });
            
            const titleEl = resultItem.createEl('h3', {
                text: result.title,
                cls: 'result-title'
            });
            titleEl.addEventListener('click', () => {
                const file = this.app.vault.getAbstractFileByPath(result.path);
                if (file) {
                    void this.app.workspace.openLinkText(file.path, '').then(() => this.close());
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
                text: `Knowledge Domain: ${
                    (result.knowledgeDomains && result.knowledgeDomains.length > 0
                        ? result.knowledgeDomains.join(', ')
                        : 'Unknown'
                    ).replace(/\s*\([^)]*\)/g, '')
                }`,
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
                text: `${result.charCount ?? (result as { wordCount?: number }).wordCount ?? 0} chars`,
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
    }

    private createPaginationControls(parentContainer: HTMLElement, totalPages: number, totalResults: number): void {
        // Remove existing pagination if it exists
        if (this.paginationContainer) {
            this.paginationContainer.remove();
            this.paginationContainer = null;
        }

        // Don't show pagination if there's only one page or no results
        if (totalPages <= 1 || totalResults === 0) {
            return;
        }

        // Create pagination container
        this.paginationContainer = parentContainer.createEl('div', {
            cls: 'vault-analysis-pagination'
        });

        // Create pagination controls wrapper
        const controlsWrapper = this.paginationContainer.createEl('div', {
            cls: 'pagination-controls'
        });

        // Previous button
        const prevButton = controlsWrapper.createEl('button', {
            text: 'Previous',
            cls: 'pagination-button pagination-prev'
        });
        prevButton.disabled = this.currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.updatePage(this.currentPage - 1);
            }
        });

        // Page number buttons
        const pageNumbersContainer = controlsWrapper.createEl('div', {
            cls: 'pagination-page-numbers'
        });

        // Calculate which page numbers to show
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(totalPages, this.currentPage + 2);

        // Adjust range if we're near the start or end
        if (endPage - startPage < 4) {
            if (startPage === 1) {
                endPage = Math.min(totalPages, startPage + 4);
            } else if (endPage === totalPages) {
                startPage = Math.max(1, endPage - 4);
            }
        }

        // Show first page if not in range
        if (startPage > 1) {
            const firstButton = pageNumbersContainer.createEl('button', {
                text: '1',
                cls: 'pagination-page-number'
            });
            firstButton.addEventListener('click', () => {
                this.updatePage(1);
            });
            if (startPage > 2) {
                pageNumbersContainer.createEl('span', {
                    text: '...',
                    cls: 'pagination-ellipsis'
                });
            }
        }

        // Show page numbers in range
        for (let i = startPage; i <= endPage; i++) {
            const pageButton = pageNumbersContainer.createEl('button', {
                text: i.toString(),
                cls: `pagination-page-number ${i === this.currentPage ? 'active' : ''}`
            });
            if (i === this.currentPage) {
                pageButton.classList.add('active');
            }
            pageButton.addEventListener('click', () => {
                this.updatePage(i);
            });
        }

        // Show last page if not in range
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pageNumbersContainer.createEl('span', {
                    text: '...',
                    cls: 'pagination-ellipsis'
                });
            }
            const lastButton = pageNumbersContainer.createEl('button', {
                text: totalPages.toString(),
                cls: 'pagination-page-number'
            });
            lastButton.addEventListener('click', () => {
                this.updatePage(totalPages);
            });
        }

        // Next button
        const nextButton = controlsWrapper.createEl('button', {
            text: 'Next',
            cls: 'pagination-button pagination-next'
        });
        nextButton.disabled = this.currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.updatePage(this.currentPage + 1);
            }
        });

        // Page info
        const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIndex = Math.min(this.currentPage * this.itemsPerPage, totalResults);
        this.paginationContainer.createEl('div', {
            text: `Page ${this.currentPage} of ${totalPages} (showing ${startIndex}-${endIndex} of ${totalResults} items)`,
            cls: 'pagination-info'
        });
    }

    private updatePage(newPage: number): void {
        if (!this.resultsSection || !this.resultsContainer) return;

        // Update current page
        this.currentPage = newPage;

        // Render new page content
        this.renderCurrentPage();

        // Update pagination controls
        const totalPages = Math.ceil(this.filteredResults.length / this.itemsPerPage);
        const totalResults = this.filteredResults.length;
        if (this.resultsSection) {
            // Always recreate pagination controls (simpler and more reliable)
            if (this.paginationContainer) {
                this.paginationContainer.remove();
                this.paginationContainer = null;
            }
            this.createPaginationControls(this.resultsSection, totalPages, totalResults);
        }
        // No scrolling on page change - users can scroll manually if needed
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
        
        actionButton.addEventListener('click', () => {
            this.close();
            void (async () => {
                try {
                    const success = await this.vaultSemanticAnalysisManager.generateVaultAnalysis();
                    if (success) {
                        await this.vaultSemanticAnalysisManager.viewVaultAnalysisResults();
                    }
                } catch {
                    // Error already shown by generateVaultAnalysis
                }
            })();
        });
    }

    private async loadKnowledgeStructureView(): Promise<void> {
        // Create the main container with a scrollable layout
        const structureContainer = this.contentContainer.createEl('div', { 
            cls: 'knowledge-structure-container vault-analysis-scroll-container' 
        });

        if (!this.hasExistingData || !this.analysisData) {
            this.showStructureEmptyState(structureContainer);
            return;
        }

        // Create three main sections
        const domainDistributionSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        domainDistributionSection.createEl('h3', {
            text: 'Knowledge domain distribution',
            cls: 'vault-analysis-section-title'
        });
        
        const networkAnalysisSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        networkAnalysisSection.createEl('h3', {
            text: 'Knowledge network analysis',
            cls: 'vault-analysis-section-title'
        });
        
        const gapsSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        gapsSection.createEl('h3', {
            text: 'Knowledge gaps',
            cls: 'vault-analysis-section-title'
        });
        
        // Check for cached tab-specific analysis
        try {
            this.structureAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('structure', this.analysisData) as StructureAnalysisData;
            if (this.structureAnalysisData) {
                // console.log('Loaded cached structure analysis');
            } else {
                // console.log('No cached structure analysis available yet');
            }
        } catch {
            this.structureAnalysisData = null;
        }
        
        // Initialize knowledge structure manager if not already done
        if (!this.knowledgeStructureManager) {
            this.knowledgeStructureManager = new KnowledgeStructureManager(this.app, this.settings, this.createEmptyState.bind(this));
        }
        
        // ALWAYS display domain distribution and KDE charts in parallel
        await Promise.all([
            this.knowledgeStructureManager.createDomainDistributionChart(domainDistributionSection, this.analysisData ?? undefined),
            this.knowledgeStructureManager.renderKDEDistributionChart(networkAnalysisSection, this.analysisData ?? undefined)
        ]);
        
        // For the other sections, check if we have cached structure analysis data
        if (this.structureAnalysisData?.knowledgeStructure) {
            // Display network analysis and gaps from cached data in parallel
            // Note: This will append network cards below the KDE chart
            await Promise.all([
                this.displayNetworkAnalysis(networkAnalysisSection),
                this.displayKnowledgeGaps(gapsSection)
            ]);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(
                structureContainer, 
                'structure',
                this.structureAnalysisData?.isOutdated ?? false
            );
        } else {
            // Show placeholder for network analysis and gaps (KDE chart already displayed above)
            this.showNetworkAnalysisPlaceholder(networkAnalysisSection);
            this.showKnowledgeGapsPlaceholder(gapsSection);
            
            // Show Generate Analysis button for the AI-powered parts
            await this.createAnalysisButtonSection(structureContainer, 'structure');
        }
    }
    
    /**
     * Display network analysis from cached structure analysis data
     */
    private async displayNetworkAnalysis(container: HTMLElement): Promise<void> {
        if (!this.structureAnalysisData?.knowledgeStructure?.knowledgeNetwork) {
            this.showNetworkAnalysisPlaceholder(container);
            return;
        }
        
        // Use the KnowledgeStructureManager to render the network analysis
        if (!this.knowledgeStructureManager) {
            this.knowledgeStructureManager = new KnowledgeStructureManager(this.app, this.settings, this.createEmptyState.bind(this));
        }
        
        // Render the network analysis using the visualization manager
        await this.knowledgeStructureManager.renderNetworkAnalysis(container, this.structureAnalysisData.knowledgeStructure);
    }
    
    /**
     * Display knowledge gaps from cached structure analysis data
     */
    private displayKnowledgeGaps(container: HTMLElement): Promise<void> {
        if (!this.structureAnalysisData?.knowledgeStructure?.gaps) {
            this.showKnowledgeGapsPlaceholder(container);
            return Promise.resolve();
        }
        
        const gaps = this.structureAnalysisData.knowledgeStructure.gaps;
        
        if (gaps && gaps.length > 0) {
            const gapsContainer = container.createEl('div', { 
                cls: 'ai-insights-container'
            });

            const titleEl = gapsContainer.createEl('h4', {
                cls: 'ai-insights-title'
            });
            const iconEl = titleEl.createEl('span', { cls: 'ai-insights-icon' });
            setIcon(iconEl, 'target');
            titleEl.createEl('span', { text: 'Identified knowledge gaps' });

            const gapsList = gapsContainer.createEl('ul', { 
                cls: 'gaps-list' 
            });

            gaps.slice(0, 8).forEach(gap => {
                gapsList.createEl('li', { text: gap });
            });
        } else {
            this.showKnowledgeGapsPlaceholder(container);
        }
        return Promise.resolve();
    }
    
    /**
     * Create a consistent empty state with icon and message for all analysis tabs
     * Public method to be used by all knowledge analysis components
     */
    public createEmptyState(container: HTMLElement, message: string): void {
        const emptyState = document.createElement('div');
        emptyState.className = 'network-empty-state';
        container.appendChild(emptyState);

        const iconEl = document.createElement('div');
        iconEl.className = 'network-empty-state-icon';
        emptyState.appendChild(iconEl);
        setIcon(iconEl, 'bar-chart-2');

        const textEl = document.createElement('p');
        textEl.className = 'network-empty-state-text';
        textEl.textContent = message;
        emptyState.appendChild(textEl);
    }

    /**
     * Show placeholder for network analysis section
     * Uses the centralized empty state method
     * Note: KDE chart is already displayed above, so this placeholder is for AI-generated network cards
     */
    private showNetworkAnalysisPlaceholder(container: HTMLElement): void {
        // Only show placeholder if container doesn't already have content (KDE chart)
        // Check if there's already a KDE chart or other content
        const hasContent = container.querySelector('.kde-chart-container') !== null;
        if (hasContent) {
            // KDE chart is already there, just add a separator and placeholder message
            const separator = container.createEl('div', { cls: 'network-placeholder-separator' });
            
            this.createEmptyState(
                separator, 
                'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.'
            );
        } else {
            // No content yet, show normal placeholder
            this.createEmptyState(
                container, 
                'Generate AI analysis to identify knowledge bridges, foundations, and authorities in your vault\'s network structure.'
            );
        }
    }
    
    /**
     * Show placeholder for knowledge gaps section
     * Uses the centralized empty state method
     */
    private showKnowledgeGapsPlaceholder(container: HTMLElement): void {
        this.createEmptyState(
            container, 
            'Generate AI analysis to identify potential knowledge gaps and areas for expansion in your vault.'
        );
    }

    private showStructureEmptyState(container: HTMLElement): void {
        const emptyState = container.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('h3', {
            text: '🧠 knowledge structure analysis',
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

    private createUpdateAnalysisButtonSection(container: HTMLElement, tabName: string = '', isOutdated: boolean = false, isChecking: boolean = false): Promise<void> {
        // Use modal-button-container style to match Semantic Analysis page
        // This includes the splitter line (border-top) and right alignment
        const buttonContainer = container.createEl('div', {
            cls: 'modal-button-container'
        });

        // Add status indicator
        const statusIndicator = buttonContainer.createEl('div', {
            cls: 'analysis-status-indicator'
        });

        if (this.vaultSemanticAnalysisManager.isAnalysisInProgress()) {
            statusIndicator.addClass('status-outdated');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Analysis in progress');
            const disabledButton = buttonContainer.createEl('button', {
                cls: 'mod-cta is-disabled',
                text: 'Analysis is processing...'
            });
            disabledButton.disabled = true;
            return Promise.resolve();
        }

        if (isChecking) {
            statusIndicator.addClass('status-outdated');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Checking for updates...');
            const disabledButton = buttonContainer.createEl('button', {
                cls: 'mod-cta is-disabled',
                text: 'Update analysis'
            });
            disabledButton.disabled = true;
            return Promise.resolve();
        }

        if (!isOutdated) {
            statusIndicator.addClass('status-current');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Analysis is current');
        } else {
            statusIndicator.addClass('status-outdated');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Analysis needs update');
        }

        const updateButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Update analysis'
        });

        // Disable button if analysis is current
        if (!isOutdated) {
            updateButton.disabled = true;
            updateButton.addClass('is-disabled');
            updateButton.setAttribute('title', 'Analysis is up to date with current vault');
        } else {
            updateButton.setAttribute('title', 'Click to update analysis with recent vault changes');
        }

        updateButton.addEventListener('click', () => {
            if (updateButton.disabled) return;
            if (tabName === 'semantic') {
                this.close();
                void (async () => {
                    try {
                        const success = await this.vaultSemanticAnalysisManager.generateVaultAnalysis();
                        if (success) {
                            await this.vaultSemanticAnalysisManager.viewVaultAnalysisResults();
                        }
                    } catch {
                        // Error shown by generateVaultAnalysis
                    }
                })();
                return;
            }
            if (tabName === 'structure' || tabName === 'evolution' || tabName === 'actions') {
                const tabDisplayName = this.getTabDisplayName(tabName);
                new Notice(`🧪 Updating ${tabDisplayName} Analysis... (est. 1–2 min)`);
                this.vaultSemanticAnalysisManager.setAnalysisInProgress(tabName);
                this.close();
                void (async () => {
                    try {
                        if (tabName === 'structure') {
                            await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
                        } else if (tabName === 'evolution') {
                            await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                        } else if (tabName === 'actions') {
                            await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
                        }
                        await this.masterAnalysisManager.reopenModalToTab(
                            this.vaultSemanticAnalysisManager,
                            this.settings,
                            tabName
                        );
                    } catch (error) {
                        new Notice(getUserFriendlyMessage(error instanceof Error ? error : new Error(String(error))));
                    } finally {
                        this.vaultSemanticAnalysisManager.clearAnalysisInProgress();
                    }
                })();
            } else {
                void this.triggerAIAnalysis(buttonContainer, true, tabName);
            }
        });
        return Promise.resolve();
    }

    private createAnalysisButtonSection(container: HTMLElement, tabName: string = ''): Promise<void> {
        // Add informational message about AI analysis
        const infoSection = container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });

        const infoContainer = infoSection.createEl('div', {
            cls: 'vault-analysis-summary'
        });

        infoContainer.createEl('p', {
            text: 'This analysis uses google gemini AI to extract insights from your vault. We only send note summaries and metadata (keywords, domains, graph metrics) to the AI—never full note content. This protects your privacy and significantly reduces token usage.',
            cls: 'analysis-info-text'
        });

        infoContainer.createEl('p', {
            text: 'Before AI analysis, we use deterministic methods (graph theory, statistical analysis, kde distributions) to preprocess your vault data, ensuring accurate and efficient insights.',
            cls: 'analysis-info-text'
        });

        // Use same button style as Update Analysis (modal-button-container with mod-cta)
        const buttonContainer = container.createEl('div', { 
            cls: 'modal-button-container' 
        });

        // Add status indicator for empty state
        const statusIndicator = buttonContainer.createEl('div', {
            cls: 'analysis-status-indicator'
        });

        if (this.vaultSemanticAnalysisManager.isAnalysisInProgress()) {
            statusIndicator.addClass('status-outdated');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Analysis in progress');
            const disabledButton = buttonContainer.createEl('button', {
                cls: 'mod-cta is-disabled',
                text: 'Analysis is processing...'
            });
            disabledButton.disabled = true;
            return Promise.resolve();
        }

        statusIndicator.addClass('status-empty');
        statusIndicator.createSpan({ cls: 'status-dot' });
        statusIndicator.appendText(' Analysis not generated yet');

        const analysisButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Generate analysis'
        });
        analysisButton.setAttribute('title', 'Click to generate analysis for this tab');

        analysisButton.addEventListener('click', () => {
            if (tabName === 'structure' || tabName === 'evolution' || tabName === 'actions') {
                const tabDisplayName = this.getTabDisplayName(tabName);
                new Notice(`🧪 Generating ${tabDisplayName} Analysis... (est. 1–2 min)`);
                this.vaultSemanticAnalysisManager.setAnalysisInProgress(tabName);
                this.close();
                void (async () => {
                    try {
                        if (tabName === 'structure') {
                            await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
                        } else if (tabName === 'evolution') {
                            await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                        } else if (tabName === 'actions') {
                            await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
                        }
                        await this.masterAnalysisManager.reopenModalToTab(
                            this.vaultSemanticAnalysisManager,
                            this.settings,
                            tabName
                        );
                    } catch (error) {
                        new Notice(getUserFriendlyMessage(error instanceof Error ? error : new Error(String(error))));
                    } finally {
                        this.vaultSemanticAnalysisManager.clearAnalysisInProgress();
                    }
                })();
            } else {
                void this.triggerAIAnalysis(container, false, tabName);
            }
        });
        return Promise.resolve();
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
        const estTime = tabName ? '1–2 minutes' : '3–6 minutes';
        const strongTitle = loadingText.createEl('strong', { cls: 'ai-loading-title' });
        strongTitle.setText(`🧪 ${tabName ? `Generating ${this.getTabDisplayName(tabName)} Analysis` : 'Generating All Analyses'}`);
        loadingText.createEl('br');
        loadingText.appendText(tabName ? `This includes ${this.getTabDescription(tabName)}.` : 'This includes knowledge structure, evolution, and recommendations.');
        loadingText.createEl('br');
        const timeStrong = loadingText.createEl('strong');
        timeStrong.setText('Estimated time: ');
        loadingText.appendText(`${estTime}.`);
        loadingText.createEl('br');
        const smallNote = loadingText.createEl('small', { cls: 'ai-loading-note' });
        smallNote.setText('Results will be cached for future use.');

        try {
            // Knowledge domain template loading is handled automatically by KnowledgeDomainHelper
            
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
                // Reload the entire structure view to show updated data
                this.contentContainer.empty();
                await this.loadKnowledgeStructureView();
            } else if (this.currentView === 'evolution') {
                await this.displayCachedAnalysis(buttonSection);
                await this.createUpdateAnalysisButtonSection(
                    buttonSection, 
                    'evolution',
                    this.evolutionAnalysisData?.isOutdated ?? false
                );
            } else if (this.currentView === 'actions') {
                // For actions, we need to refresh only the AI results container, preserving scatter charts
                // Find the AI results container and refresh it
                const aiResultsContainer = this.contentContainer.querySelector('.actions-ai-results-container');
                if (aiResultsContainer) {
                    aiResultsContainer.empty();
                    this.displayRecommendedActionsResults(aiResultsContainer as HTMLElement);
                    await this.createUpdateAnalysisButtonSection(
                        aiResultsContainer as HTMLElement, 
                        'actions',
                        this.actionsAnalysisData?.isOutdated ?? false
                    );
                } else {
                    // Fallback: reload entire view if container not found
                    this.contentContainer.empty();
                    await this.loadRecommendedActionsView();
                }
            } else {
                // For other views, just display generic cached analysis
                await this.displayCachedAnalysis(buttonSection);
                // Determine isOutdated based on current view
                let isOutdated = false;
                if (this.currentView === 'structure') {
                    isOutdated = this.structureAnalysisData?.isOutdated ?? false;
                } else if (this.currentView === 'evolution') {
                    isOutdated = this.evolutionAnalysisData?.isOutdated ?? false;
                } else if (this.currentView === 'actions') {
                    isOutdated = this.actionsAnalysisData?.isOutdated ?? false;
                }
                await this.createUpdateAnalysisButtonSection(buttonSection, '', isOutdated);
            }

        } catch (error) {
            // console.error('Error generating analysis:', error);
            loadingContainer.remove();

            const err = error instanceof Error ? error : new Error(String(error));
            const message = getUserFriendlyMessage(err);

            const errorContainer = buttonSection.createEl('div', {
                cls: 'evolution-error'
            });
            errorContainer.createEl('h4', { text: 'Error generating AI analysis' });
            errorContainer.createEl('p', {
                text: `Failed to generate analysis: ${message}`
            });

            new Notice(`❌ Failed to generate AI analysis: ${message}`);
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
            case 'evolution': return 'timeline analysis, topic patterns, and focus shifts';
            case 'actions': return 'maintenance tasks, connection opportunities, and learning paths';
            default: return 'comprehensive knowledge analysis';
        }
    }

    private async displayCachedAnalysis(container: HTMLElement): Promise<void> {
        if (!this.knowledgeEvolutionData) return;

        const data = this.knowledgeEvolutionData;

        // Calendar section must go first (renders into first position)
        await this.createStructuredAnalysisSection(container, 'Knowledge Development Timeline', data.timeline, true);

        // Topic and Focus sections are independent - render in parallel
        await Promise.all([
            this.createStructuredAnalysisSection(container, 'Topic Introduction Patterns', data.topicPatterns, false),
            this.createStructuredAnalysisSection(container, 'Focus Shift Analysis', data.focusShift, false)
        ]);
    }

    /** Evolution insight data: timeline phases, topic intro, or focus shifts */
    private async createStructuredAnalysisSection(
        container: HTMLElement,
        title: string,
        analysisData: TimelineAnalysis | TopicPatternsAnalysis | FocusShiftAnalysis,
        includeCalendar: boolean = false
    ): Promise<void> {
        const section = container.createEl('div', { cls: 'vault-analysis-section' });
        
        section.createEl('h3', {
            text: title,
            cls: 'vault-analysis-section-title'
        });
        
        // Outer container wrapping calendar (if Timeline) + details + conclusion
        const insightsContainer = section.createEl('div', { cls: 'ai-insights-container-rounded' });
        
        // Add calendar if this is the Timeline section (inside the outer container)
        if (includeCalendar) {
            const chartContainer = insightsContainer.createEl('div', { 
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
        
        // Add details first (phases, timeline, shifts) - each item in its own rounded container
        if (title.includes('Timeline') && 'phases' in analysisData && analysisData.phases) {
            this.addTimelineVisualization(insightsContainer, analysisData.phases);
        } else if (title.includes('Topic') && 'introductionTimeline' in analysisData && analysisData.introductionTimeline) {
            this.addTopicVisualization(insightsContainer, analysisData.introductionTimeline);
        } else if (title.includes('Focus') && 'shifts' in analysisData && analysisData.shifts) {
            this.addFocusShiftVisualization(insightsContainer, analysisData.shifts);
        }
        
        // Then add conclusion section (only if there's content)
        const narrative = ('narrative' in analysisData ? analysisData.narrative : null) || ('exploration' in analysisData ? analysisData.exploration : null);
        if (narrative && narrative.content) {
            const conclusionSection = insightsContainer.createEl('div', { cls: 'ai-conclusion-section' });
            
            // Create title with Lucide icon
            const conclusionTitle = conclusionSection.createEl('div', { cls: 'ai-conclusion-title' });
            const iconContainer = conclusionTitle.createEl('span', { cls: 'ai-conclusion-icon' });
            setIcon(iconContainer, 'sparkle');
            conclusionTitle.createEl('span', { 
                text: 'Conclusion',
                cls: 'ai-conclusion-text'
            });
            
            // Display the narrative/conclusion content
            const conclusionText = conclusionSection.createEl('div', { 
                cls: 'ai-conclusion-content'
            });
            void MarkdownRenderer.render(this.app, narrative.content, conclusionText, '', this.markdownComponent);
        }
    }

    // Visualization helper methods - each item in its own rounded container
    private addTimelineVisualization(section: HTMLElement, phases: Array<{ period: string; description: string }>): void {
        phases.forEach(phase => {
            const phaseEl = section.createEl('div', { cls: 'ai-bullet-item-container' });
            void MarkdownRenderer.render(this.app, `- **${phase.period}**: ${phase.description}`, phaseEl, '', this.markdownComponent);
        });
    }

    private addTopicVisualization(section: HTMLElement, timeline: Array<{ period: string; newDomains: string[] }>): void {
        timeline.forEach(item => {
            if (item.newDomains.length > 0) {
                const itemEl = section.createEl('div', { cls: 'ai-bullet-item-container' });
                
                // Parse domain names for cleaner display
                const cleanDomains = item.newDomains.map((domain: string) => {
                    const domainParts = domain.match(/^(.+?)\s*\((.+)\)$/) || [null, domain, ''];
                    return domainParts[1] || domain;
                });
                
                void MarkdownRenderer.render(this.app, `- **${item.period}**: ${cleanDomains.join(', ')}`, itemEl, '', this.markdownComponent);
            }
        });
    }

    private addFocusShiftVisualization(section: HTMLElement, shifts: Array<{ period: string; newAreas: string[]; decreasedFocus: string[] }>): void {
        shifts.forEach(shift => {
            const shiftEl = section.createEl('div', { cls: 'ai-bullet-item-container' });
            void MarkdownRenderer.render(this.app, `- **${shift.period}**: ${shift.newAreas.length} new areas, ${shift.decreasedFocus.length} reduced`, shiftEl, '', this.markdownComponent);
        });
    }


    private async loadRecommendedActionsView(): Promise<void> {
        // Create the main container with a scrollable layout
        const recommendationsSection = this.contentContainer.createEl('div', { 
            cls: 'recommended-actions-container' 
        });
        
        // Add CSS for proper scrolling
        recommendationsSection.addClass('vault-analysis-scroll-container');
        
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
        
        // Add connectivity scatter chart section (always displayed, like domain chart)
        const chartSection = recommendationsSection.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        chartSection.createEl('h3', {
            text: 'Network metrics analysis',
            cls: 'vault-analysis-section-title'
        });

        // Create tabs container adjacent to chart
        const chartWrapper = chartSection.createEl('div', { 
            cls: 'scatter-chart-wrapper' 
        });

        const tabsContainer = chartWrapper.createEl('div', { cls: 'knowledge-network-tab-bar' });

        const linksTab = tabsContainer.createEl('button', { cls: 'knowledge-network-tab active' });
        setIcon(linksTab.createEl('span'), 'link');
        linksTab.createEl('span', { text: 'Inbound vs outbound links' });

        const centralityTab = tabsContainer.createEl('button', { cls: 'knowledge-network-tab' });
        setIcon(centralityTab.createEl('span'), 'activity');
        centralityTab.createEl('span', { text: 'Betweenness vs eigenvector' });

        const chartContainer = chartWrapper.createEl('div', { 
            cls: 'connectivity-chart-section' 
        });

        // Create and render scatter chart
        const scatterChart = new ConnectivityScatterChart(
            this.app,
            chartContainer,
            { 
                width: 700, 
                height: 500,
                mode: 'links',
                analysisData: this.analysisData,  // For centrality mode
                modal: this  // Pass modal reference to close on note click
            }
        );
        await scatterChart.render();

        const updateTabStyles = (activeTab: HTMLElement, inactiveTab: HTMLElement) => {
            activeTab.classList.add('active');
            inactiveTab.classList.remove('active');
        };

        linksTab.addEventListener('click', () => {
            updateTabStyles(linksTab, centralityTab);
            void scatterChart.setMode('links');
        });

        centralityTab.addEventListener('click', () => {
            updateTabStyles(centralityTab, linksTab);
            void scatterChart.setMode('centrality');
        });

        // Create a dedicated container for AI results (placeholder sections)
        // This will be replaced when AI analysis completes, but scatter charts will remain
        const aiResultsContainer = recommendationsSection.createEl('div', {
            cls: 'actions-ai-results-container'
        });

        // Check for cached tab-specific analysis
        void this.loadActionsAnalysisData().then(hasData => {
            if (hasData) {
                this.displayRecommendedActionsResults(aiResultsContainer);
                void this.createUpdateAnalysisButtonSection(
                    aiResultsContainer, 
                    'actions',
                    this.actionsAnalysisData?.isOutdated ?? false
                );
            } else {
                this.showActionsEmptyState(aiResultsContainer);
            }
        });
    }

    // Helper method to load actions analysis data
    private async loadActionsAnalysisData(): Promise<boolean> {
        try {
            // Load tab-specific actions data
            this.actionsAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('actions', this.analysisData) as ActionsAnalysisData;
            if (this.actionsAnalysisData) {
                // console.log('Loaded cached actions analysis');
                return true;
            }
            
            // console.log('No cached actions analysis available yet');
            return false;
        } catch {
            return false;
        }
    }

    private displayRecommendedActionsResults(container: HTMLElement): void {
        // Use tab-specific data only
        const actionsData = this.actionsAnalysisData?.recommendedActions;
                           
        if (!actionsData) return;

        // ── Knowledge Maintenance: Review Cards Grid ──
        if (actionsData.maintenance && actionsData.maintenance.length > 0) {
            const maintenanceSection = container.createEl('div', { cls: 'vault-analysis-section' });
            maintenanceSection.createEl('h3', {
                text: 'Notes needing review',
                cls: 'vault-analysis-section-title'
            });

            // Compute hybrid-scored review candidates
            const analysisResults = this.analysisData?.results || [];
            const candidates = KnowledgeActionsManager.computeReviewCandidates(
                actionsData.maintenance,
                analysisResults,
                9 // 3 rows x 3 columns
            );

            this.renderReviewCardsGrid(maintenanceSection, candidates);
        }

        // ── Connection Recommendations: Interactive Sub-graph ──
        if (actionsData.connections && actionsData.connections.length > 0) {
            const connectionsSection = container.createEl('div', { cls: 'vault-analysis-section' });
            connectionsSection.createEl('h3', {
                text: 'Suggested connections',
                cls: 'vault-analysis-section-title'
            });

            const subgraphContainer = connectionsSection.createEl('div', {
                cls: 'connection-subgraph-container'
            });

            // Create and render the connection sub-graph
            const subGraph = new ConnectionSubGraph(
                this.app,
                subgraphContainer,
                actionsData.connections,
                {
                    modal: this,
                    connectionsAddedAt: this.actionsAnalysisData?.connectionsAddedAt,
                    actionsAnalysisData: this.actionsAnalysisData ?? undefined,
                    saveCacheFn: async (data) => {
                        await this.masterAnalysisManager.cacheTabAnalysis('actions', data);
                    }
                }
            );
            subGraph.render();
        }
    }

    /**
     * Render the 3-column review cards grid for maintenance candidates.
     * Each card is clickable and opens the note in a new Obsidian tab.
     */
    private renderReviewCardsGrid(container: HTMLElement, candidates: ReviewCandidate[]): void {
        const grid = container.createEl('div', { cls: 'review-cards-grid' });

        for (const candidate of candidates) {
            const card = grid.createEl('div', { cls: `review-card priority-${candidate.priority}` });
            card.setAttribute('data-path', candidate.path);
            // Tooltip: full rationale on hover; native title shows complete reason (card truncates to 3 lines)
            const tooltipText = candidate.reason
                ? `${candidate.reason}\n\nClick to open "${candidate.title}" in a new tab`
                : `Click to open "${candidate.title}" in a new tab`;
            card.setAttribute('title', tooltipText);

            // Card header: title + priority badge
            const header = card.createEl('div', { cls: 'review-card-header' });
            header.createEl('span', {
                text: candidate.title,
                cls: 'review-card-title'
            });
            header.createEl('span', {
                text: candidate.priority.toUpperCase(),
                cls: `review-card-badge badge-${candidate.priority}`
            });

            // Reason
            card.createEl('div', {
                text: candidate.reason,
                cls: 'review-card-reason'
            });

            // Footer: last modified + centrality role
            const footer = card.createEl('div', { cls: 'review-card-footer' });
            
            // Last modified relative time
            if (candidate.lastModified) {
                const modifiedEl = footer.createEl('span', { cls: 'review-card-modified' });
                const iconSpan = modifiedEl.createEl('span', { cls: 'review-card-icon' });
                setIcon(iconSpan, 'clock');
                modifiedEl.createEl('span', {
                    text: this.getRelativeTime(candidate.lastModified)
                });
            }

            // Centrality role indicator
            if (candidate.centralityRole !== 'normal') {
                const roleEl = footer.createEl('span', { cls: `review-card-role role-${candidate.centralityRole}` });
                const roleIcon = candidate.centralityRole === 'bridge' ? 'git-branch' 
                    : candidate.centralityRole === 'authority' ? 'star'
                    : 'share-2'; // hub
                const roleIconSpan = roleEl.createEl('span', { cls: 'review-card-icon' });
                setIcon(roleIconSpan, roleIcon);
                roleEl.createEl('span', {
                    text: candidate.centralityRole.charAt(0).toUpperCase() + candidate.centralityRole.slice(1)
                });
            }

            // Click handler: open note in new tab
            card.addEventListener('click', () => {
                this.close();
                void this.app.workspace.openLinkText(candidate.path, '', 'tab');
            });
        }
    }

    /**
     * Convert an ISO date string to a human-readable relative time (e.g., "3 months ago")
     */
    private getRelativeTime(isoDate: string): string {
        const date = new Date(isoDate);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 1) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    private showActionsEmptyState(container: HTMLElement): void {
        // Placeholders for each actions category (titles + purpose)
        const categories: Array<{ title: string; message: string }> = [
            {
                title: 'Notes Needing Review',
                message: 'Generate analysis to identify important notes (hubs, bridges, authorities) that need review. Results are shown as interactive cards you can click to open.'
            },
            {
                title: 'Suggested Connections',
                message: 'Generate analysis to discover missing links between related notes. Results are shown as an interactive graph you can edit before adding connections to your vault.'
            }
        ];

        categories.forEach(({ title, message }) => {
            const section = container.createEl('div', { cls: 'vault-analysis-section' });
            section.createEl('h3', {
                text: title,
                cls: 'vault-analysis-section-title'
            });
            this.createEmptyState(section, message);
        });

        // Add informational message about AI analysis
        const infoSection = container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        const infoContainer = infoSection.createEl('div', {
            cls: 'vault-analysis-summary'
        });

        infoContainer.createEl('p', {
            text: 'This analysis uses google gemini AI to extract insights from your vault. We only send note summaries and metadata (keywords, domains, graph metrics) to the AI—never full note content. This protects your privacy and significantly reduces token usage.',
            cls: 'analysis-info-text'
        });

        infoContainer.createEl('p', {
            text: 'Before AI analysis, we use deterministic methods (graph theory, statistical analysis, kde distributions) to preprocess your vault data, ensuring accurate and efficient insights.',
            cls: 'analysis-info-text'
        });

        // Use same button style as Update Analysis (modal-button-container with mod-cta)
        const buttonSection = container.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        const buttonContainer = buttonSection.createEl('div', { 
            cls: 'modal-button-container'
        });

        // Add status indicator for empty state
        const statusIndicator = buttonContainer.createEl('div', {
            cls: 'analysis-status-indicator'
        });

        if (this.vaultSemanticAnalysisManager.isAnalysisInProgress()) {
            statusIndicator.addClass('status-outdated');
            statusIndicator.createSpan({ cls: 'status-dot' });
            statusIndicator.appendText(' Analysis in progress');
            const disabledButton = buttonContainer.createEl('button', {
                cls: 'mod-cta is-disabled',
                text: 'Analysis is processing...'
            });
            disabledButton.disabled = true;
            return;
        }

        statusIndicator.addClass('status-empty');
        statusIndicator.createSpan({ cls: 'status-dot' });
        statusIndicator.appendText(' Analysis not generated yet');

        const generateButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Generate analysis'
        });
        generateButton.setAttribute('title', 'Click to generate analysis for this tab');

        generateButton.addEventListener('click', () => {
            const tabDisplayName = this.getTabDisplayName('actions');
            new Notice(`🧪 Generating ${tabDisplayName} Analysis... (est. 1–2 min)`);
            this.vaultSemanticAnalysisManager.setAnalysisInProgress('actions');
            this.close();
            void (async () => {
                try {
                    await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
                    await this.masterAnalysisManager.reopenModalToTab(
                        this.vaultSemanticAnalysisManager,
                        this.settings,
                        'actions'
                    );
                } catch (error) {
                    new Notice(getUserFriendlyMessage(error instanceof Error ? error : new Error(String(error))));
                } finally {
                    this.vaultSemanticAnalysisManager.clearAnalysisInProgress();
                }
            })();
        });
    }

    private async loadKnowledgeEvolutionView(): Promise<void> {
        // Create the main container with a scrollable layout
        const evolutionContainer = this.contentContainer.createEl('div', { 
            cls: 'knowledge-evolution-container' 
        });
        
        // Add CSS for proper scrolling
        evolutionContainer.addClass('vault-analysis-scroll-container');

        if (!this.hasExistingData || !this.analysisData) {
            this.showEvolutionEmptyState(evolutionContainer);
            return;
        }

        // Check for cached tab-specific analysis
        try {
            this.evolutionAnalysisData = await this.masterAnalysisManager.loadCachedTabAnalysis('evolution', this.analysisData) as EvolutionAnalysisData;
            if (this.evolutionAnalysisData) {
                // console.log('Loaded cached evolution analysis');
                this.knowledgeEvolutionData = this.evolutionAnalysisData.knowledgeEvolution;
            } else {
                // console.log('No cached evolution analysis available yet');
                this.knowledgeEvolutionData = null;
            }
        } catch {
            this.evolutionAnalysisData = null;
            this.knowledgeEvolutionData = null;
        }
        
        if (this.knowledgeEvolutionData) {
            // Show cached analysis directly (calendar is included in the Timeline section)
            await this.displayCachedAnalysis(evolutionContainer);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(
                evolutionContainer, 
                'evolution',
                this.evolutionAnalysisData?.isOutdated ?? false
            );
        } else {
            // Show calendar section first, then placeholders for each analysis type
            await this.createCalendarSection(evolutionContainer);
            this.showEvolutionAnalysisPlaceholders(evolutionContainer);

            // Show Generate Analysis button
            await this.createAnalysisButtonSection(evolutionContainer, 'evolution');
        }
    }

    private showEvolutionAnalysisPlaceholders(container: HTMLElement): void {
        // Skip the first section (Knowledge Development Timeline) as it's already handled by createCalendarSection
        const sections: Array<{ title: string; message: string }> = [
            {
                title: 'Topic Introduction Patterns',
                message: 'Generate analysis to highlight when new topics and knowledge domains first appeared in your vault.'
            },
            {
                title: 'Focus Shift Analysis',
                message: 'Generate analysis to compare recent focus areas with earlier periods and identify notable shifts.'
            }
        ];

        sections.forEach(({ title, message }) => {
            const section = container.createEl('div', { cls: 'vault-analysis-section' });

            section.createEl('h3', {
                text: title,
                cls: 'vault-analysis-section-title'
            });

            this.createEmptyState(section, message);
        });
    }

    private showEvolutionEmptyState(container: HTMLElement): void {
        const emptyState = container.createEl('div', { 
            cls: 'vault-analysis-placeholder' 
        });
        
        emptyState.createEl('h3', {
            text: 'Knowledge evolution analysis',
            cls: 'vault-analysis-section-title'
        });
        
        emptyState.createEl('p', {
            text: 'Knowledge evolution analysis requires AI-powered vault analysis to be completed first.',
            cls: 'analysis-required'
        });
        
        const featureList = emptyState.createEl('ul');
        const features = [
            'Knowledge Development Timeline - track how your understanding evolved',
            'Topic Introduction Patterns - see when different subjects entered your system',
            'Focus Shift Analysis - compare current interests vs historical patterns'
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
            text: 'Knowledge development timeline',
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
        
        // Add placeholder for Timeline analysis below the calendar
        this.createEmptyState(calendarSection, 'Generate analysis to summarize key phases and milestones in how your vault developed over time.');
    }

    onClose() {
        const { contentEl, modalEl } = this;
        modalEl.removeClass('vault-analysis-modal');
        contentEl.removeClass('vault-analysis-modal-content');
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
            text: 'About vault analysis',
            cls: 'modal-title'
        });
        
        const infoContainer = contentEl.createEl('div', { 
            cls: 'vault-analysis-info' 
        });
        
        infoContainer.createEl('p', {
            text: 'Vault analysis uses AI to analyze your entire Obsidian vault and provides:'
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
            text: '• google gemini API key (configured in plugin settings)'
        });
        infoContainer.createEl('p', {
            text: '• internet connection for AI processing'
        });
        
        infoContainer.createEl('h3', { text: 'Exclusions' });
        infoContainer.createEl('p', {
            text: 'The analysis respects your exclusion settings for folders and tags, ensuring only relevant notes are processed.'
        });
        
        infoContainer.createEl('h3', { text: 'Rate limiting' });
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