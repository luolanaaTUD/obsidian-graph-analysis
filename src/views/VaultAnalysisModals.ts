import { App, Modal, setIcon, Notice, TFile } from 'obsidian';
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
    generateVaultAnalysis(): Promise<boolean>;
    viewVaultAnalysisResults(): Promise<void>;
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
        this.loadView(this.currentView);
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
        this.resultsSection = this.contentContainer.createEl('div', { 
            cls: 'vault-analysis-section vault-analysis-results-section' 
        });
        
        this.resultsSection.createEl('h3', {
            text: 'Analysis Results',
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
        
        // Action buttons
        this.createActionButtons();
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
        
        actionButton.addEventListener('click', async () => {
            this.close();
            try {
                const success = await this.vaultSemanticAnalysisManager.generateVaultAnalysis();
                // Reopen modal with updated data after analysis completes successfully
                if (success) {
                    await this.vaultSemanticAnalysisManager.viewVaultAnalysisResults();
                }
            } catch (error) {
                // Error already shown by generateVaultAnalysis, no need to reopen modal
                console.error('Vault analysis failed:', error);
            }
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

        // Create three main sections
        const domainDistributionSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        domainDistributionSection.createEl('h3', {
            text: 'Knowledge Domain Distribution',
            cls: 'vault-analysis-section-title'
        });
        
        const networkAnalysisSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        networkAnalysisSection.createEl('h3', {
            text: 'Knowledge Network Analysis',
            cls: 'vault-analysis-section-title'
        });
        
        const gapsSection = structureContainer.createEl('div', { 
            cls: 'vault-analysis-section' 
        });
        
        gapsSection.createEl('h3', {
            text: 'Knowledge Gaps',
            cls: 'vault-analysis-section-title'
        });
        
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
        
        // Initialize knowledge structure manager if not already done
        if (!this.knowledgeStructureManager) {
            this.knowledgeStructureManager = new KnowledgeStructureManager(this.app, this.settings, this.createEmptyState.bind(this));
        }
        
        // ALWAYS display domain distribution chart using KnowledgeStructureManager
        await this.knowledgeStructureManager.createDomainDistributionChart(domainDistributionSection);
        
        // ALWAYS display KDE distribution chart (independent of AI analysis, like domain chart)
        // This fetches data directly from vault-analysis.json and displays without AI interference
        await this.knowledgeStructureManager.renderKDEDistributionChart(networkAnalysisSection);
        
        // For the other sections, check if we have cached structure analysis data
        if (this.structureAnalysisData?.knowledgeStructure) {
            // Display network analysis and gaps from cached data
            // Note: This will append network cards below the KDE chart
            await this.displayNetworkAnalysis(networkAnalysisSection);
            await this.displayKnowledgeGaps(gapsSection);
            
            // Show Update Analysis button below the results
            await this.createUpdateAnalysisButtonSection(structureContainer, 'structure');
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
    private async displayKnowledgeGaps(container: HTMLElement): Promise<void> {
        if (!this.structureAnalysisData?.knowledgeStructure?.gaps) {
            this.showKnowledgeGapsPlaceholder(container);
            return;
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
            titleEl.createEl('span', { text: 'Identified Knowledge Gaps' });

            const gapsList = gapsContainer.createEl('ul', { 
                cls: 'gaps-list' 
            });

            gaps.slice(0, 8).forEach(gap => {
                gapsList.createEl('li', { text: gap });
            });
        } else {
            this.showKnowledgeGapsPlaceholder(container);
        }
    }
    


    /**
     * Helper to create network subsection (kept for backward compatibility)
     */
    private createNetworkSubsection(parent: HTMLElement, title: string, nodes: any[], description: string): void {
        // Create card container if it doesn't exist
        let cardsContainer = parent.querySelector('.network-cards-container');
        if (!cardsContainer) {
            cardsContainer = parent.createEl('div', { cls: 'network-cards-container' });
        }
        
        // Create a card for this network category
        const card = cardsContainer.createEl('div', { cls: 'network-card' });
        
        // Card header with icon
        const header = card.createEl('div', { cls: 'network-card-header' });
        
        // Determine icon based on title
        let icon = '🔗';
        if (title.includes('Bridge')) icon = '🌉';
        if (title.includes('Foundation')) icon = '🏗️';
        if (title.includes('Authority')) icon = '👑';
        
        // Icon with background
        header.createEl('span', { 
            cls: 'network-card-icon',
            text: icon
        });
        
        // Title container
        const titleContainer = header.createEl('div', { cls: 'network-card-title-container' });
        
        titleContainer.createEl('h4', { 
            cls: 'network-card-title',
            text: title
        });
        
        titleContainer.createEl('span', { 
            cls: 'network-card-count',
            text: `${nodes.length} ${nodes.length === 1 ? 'item' : 'items'}`
        });

        // Description
        card.createEl('p', { 
            cls: 'network-card-description',
            text: description
        });

        // Content container
        const content = card.createEl('div', { cls: 'network-card-content' });
        
        // Show nodes
        nodes.slice(0, 5).forEach(node => {
            const domainItem = content.createEl('div', { cls: 'network-domain-item' });
            
            // Domain header
            const domainHeader = domainItem.createEl('div', { cls: 'network-domain-header' });
            
            // Handle both old note-based and new domain-based data structures
            const displayText = node.domain || node.title || 'Unknown';
            const score = node.averageScore || node.score || 0;
            
            domainHeader.createEl('strong', { 
                cls: 'network-domain-name',
                text: displayText
            });
            
            // Add score and additional info
            if (node.domain) {
                // Domain-based structure
                domainHeader.createEl('span', { 
                    cls: 'network-domain-stats',
                    text: `${score.toFixed(3)} • ${node.noteCount || 0} notes`
                });
                
                // Add explanation if available
                if (node.explanation) {
                    domainItem.createEl('p', { 
                        cls: 'network-domain-explanation',
                        text: node.explanation
                    });
                }
                
                // Add top notes if available
                if (node.topNotes && node.topNotes.length > 0) {
                    const notesHeader = domainItem.createEl('div', { 
                        cls: 'network-notes-header',
                        text: 'Top Notes'
                    });
                    
                    const notesList = domainItem.createEl('ul', { cls: 'network-notes-list' });
                    
                    node.topNotes.slice(0, 3).forEach((note: { title: string; score: number; path: string }) => {
                        const noteItem = notesList.createEl('li', { cls: 'network-note-item' });
                        
                        const noteLink = noteItem.createEl('span', { 
                            cls: 'network-note-link',
                            text: note.title
                        });
                        
                        noteItem.createEl('span', { 
                            cls: 'network-note-score',
                            text: note.score.toFixed(3)
                        });
                        
                        // Make note clickable
                        noteLink.addEventListener('click', async () => {
                            const file = this.app.vault.getAbstractFileByPath(note.path);
                            if (file && file instanceof TFile) {
                                this.app.workspace.getLeaf().openFile(file);
                            }
                        });
                    });
                }
            } else {
                // Legacy note-based structure
                domainHeader.createEl('span', { 
                    cls: 'network-domain-stats',
                    text: score.toFixed(3)
                });
                
                // Make node clickable
                domainHeader.querySelector('.network-domain-name')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    const note = this.analysisData?.results.find(r => r.title === node.title);
                    if (note) {
                        const file = this.app.vault.getAbstractFileByPath(note.path);
                        if (file && file instanceof TFile) {
                            this.app.workspace.getLeaf().openFile(file);
                        }
                    }
                });
            }
        });
    }
    
    /**
     * Create a consistent empty state with icon and message for all analysis tabs
     * Public method to be used by all knowledge analysis components
     */
    public createEmptyState(container: HTMLElement, message: string): void {
        const emptyState = document.createElement('div');
        emptyState.className = 'network-empty-state';
        emptyState.style.textAlign = 'center';
        emptyState.style.padding = '40px 20px';
        emptyState.style.background = 'var(--background-secondary-alt)';
        emptyState.style.borderRadius = '12px';
        emptyState.style.border = '1px dashed var(--background-modifier-border)';
        container.appendChild(emptyState);
        
        const iconEl = document.createElement('div');
        iconEl.className = 'network-empty-state-icon';
        iconEl.style.marginBottom = '16px';
        iconEl.style.display = 'flex';
        iconEl.style.justifyContent = 'center';
        iconEl.style.alignItems = 'center';
        emptyState.appendChild(iconEl);
        
        // Add Lucide chart icon
        setIcon(iconEl, 'bar-chart-2');
        
        const textEl = document.createElement('p');
        textEl.className = 'network-empty-state-text';
        textEl.textContent = message;
        textEl.style.color = 'var(--text-muted)';
        textEl.style.fontSize = '14px';
        textEl.style.lineHeight = '1.5';
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
            separator.style.marginTop = '20px';
            separator.style.paddingTop = '20px';
            separator.style.borderTop = '1px solid var(--background-modifier-border)';
            
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
        // Use modal-button-container style to match Semantic Analysis page
        // This includes the splitter line (border-top) and right alignment
        const buttonContainer = container.createEl('div', { 
            cls: 'modal-button-container' 
        });

        const updateButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: 'Update Analysis'
        });

        updateButton.addEventListener('click', async () => {
            // Use close-reopen pattern for structure, evolution, and actions tabs
            if (tabName === 'structure' || tabName === 'evolution' || tabName === 'actions') {
                // Show notification before closing modal
                const tabDisplayName = this.getTabDisplayName(tabName);
                new Notice(`🧪 Updating ${tabDisplayName} Analysis...`);
                
                this.close();
                try {
                    // Generate the appropriate analysis based on tab
                    if (tabName === 'structure') {
                        await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
                    } else if (tabName === 'evolution') {
                        await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                    } else if (tabName === 'actions') {
                        await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
                    }
                    // Reopen modal to the same tab with fresh data
                    await this.masterAnalysisManager.reopenModalToTab(
                        this.vaultSemanticAnalysisManager,
                        this.settings,
                        tabName
                    );
                } catch (error) {
                    // Error already shown by the analysis method, no need to reopen modal
                    console.error(`${tabName} analysis failed:`, error);
                }
            } else {
                // Fallback to inline loading for other cases
                await this.triggerAIAnalysis(buttonContainer, true, tabName);
            }
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
            // Use close-reopen pattern for structure, evolution, and actions tabs
            if (tabName === 'structure' || tabName === 'evolution' || tabName === 'actions') {
                // Show notification before closing modal
                const tabDisplayName = this.getTabDisplayName(tabName);
                new Notice(`🧪 Generating ${tabDisplayName} Analysis...`);
                
                this.close();
                try {
                    // Generate the appropriate analysis based on tab
                    if (tabName === 'structure') {
                        await this.masterAnalysisManager.generateKnowledgeStructureAnalysis();
                    } else if (tabName === 'evolution') {
                        await this.masterAnalysisManager.generateKnowledgeEvolutionAnalysis();
                    } else if (tabName === 'actions') {
                        await this.masterAnalysisManager.generateRecommendedActionsAnalysis();
                    }
                    // Reopen modal to the same tab with fresh data
                    await this.masterAnalysisManager.reopenModalToTab(
                        this.vaultSemanticAnalysisManager,
                        this.settings,
                        tabName
                    );
                } catch (error) {
                    // Error already shown by the analysis method, no need to reopen modal
                    console.error(`${tabName} analysis failed:`, error);
                }
            } else {
                // Fallback to inline loading for other cases
                await this.triggerAIAnalysis(buttonSection, false, tabName);
            }
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
                
                // Parse domain names for cleaner display
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