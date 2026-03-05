import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import { Node } from '../types/types';
import { GRAPH_ANALYSIS_VIEW_TYPE } from './GraphAnalysisView';

export const CENTRALITY_RESULTS_VIEW_TYPE = 'centrality-results-view';

export class CentralityResultsView extends ItemView {
    private results: Node[] = [];
    private algorithm: string = '';
    private currentPage: number = 1;
    private itemsPerPage: number = 30; // Will be calculated dynamically
    private paginationContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return CENTRALITY_RESULTS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Centrality analysis';
    }

    getIcon(): string {
        return 'waypoints';
    }

    onOpen(): Promise<void> {
        // Ensure status bar is hidden when centrality results view is opened
        // This provides consistency with the graph analysis view behavior
        this.updateStatusBarForGraphViews();
        return Promise.resolve();
    }

    async setResults(results: Node[], algorithm: string): Promise<void> {
        this.results = results;
        this.algorithm = algorithm;
        this.currentPage = 1; // Reset to first page when new results are set
        await this.updateView();
    }

    private updateView(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('centrality-results-container');

        // Calculate items per page dynamically if container has height
        // Otherwise use default and recalculate on next render
        if (container.clientHeight > 0) {
            this.itemsPerPage = this.calculateItemsPerPage(container);
        }

        // Create header
        const header = container.createEl('div', { cls: 'centrality-results-header' });
        header.createEl('h2', { text: `${this.algorithm} Analysis` });

        // Create results list container
        const resultsSection = container.createEl('div', { cls: 'centrality-results-section' });
        const resultsList = resultsSection.createEl('div', { cls: 'centrality-results-list' });

        // Render current page
        this.renderCurrentPage(resultsList);

        // Create pagination controls
        const totalPages = Math.ceil(this.results.length / this.itemsPerPage);
        if (totalPages > 1) {
            this.createPaginationControls(resultsSection, totalPages, this.results.length);
        }
        return Promise.resolve();
    }

    private calculateItemsPerPage(container: HTMLElement): number {
        const containerHeight = container.clientHeight;
        const headerHeight = 45;  // header with algorithm name (reduced estimate)
        const paginationHeight = 42;  // pagination controls (8px margin-top + 6px padding-top + 24px button + 6px padding-bottom + 1px border)
        const itemHeight = 26;  // each result item height (reduced estimate)
        
        const availableHeight = containerHeight - headerHeight - paginationHeight;
        const calculatedItems = Math.floor(availableHeight / itemHeight);
        
        // Clamp between reasonable min/max
        return Math.max(10, Math.min(calculatedItems, 50));
    }

    private renderCurrentPage(resultsList: HTMLElement): void {
        // Calculate paginated results
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedResults = this.results.slice(startIndex, endIndex);

        // Clear and render current page items
        resultsList.empty();
        paginatedResults.forEach((result, index) => {
            const resultItem = resultsList.createEl('div', { cls: 'centrality-result-item' });
            
            // Item number (global position)
            const itemNumber = startIndex + index + 1;
            resultItem.createEl('span', {
                cls: 'result-item-number',
                text: `${itemNumber}.`
            });
            
            // Note name and link
            const noteInfo = resultItem.createEl('div', { cls: 'result-note-info' });
            const noteLink = noteInfo.createEl('a', {
                cls: 'result-note-link',
                text: result.node_name
            });
            noteLink.addEventListener('click', (e) => {
                e.preventDefault();
                const file = this.app.vault.getAbstractFileByPath(result.node_name);
                if (file instanceof TFile) {
                    void this.app.workspace.getLeaf().openFile(file);
                }
            });

            // Score
            const score = this.getScoreForAlgorithm(result);
            resultItem.createEl('div', { 
                cls: 'result-score',
                text: score.toFixed(3)
            });
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

        // Create pagination container with compact sidebar-specific class
        this.paginationContainer = parentContainer.createEl('div', {
            cls: 'centrality-pagination'
        });

        // Previous button with icon
        const prevButton = this.paginationContainer.createEl('button', {
            cls: 'centrality-pagination-button'
        });
        const prevIcon = prevButton.createEl('span');
        setIcon(prevIcon, 'chevron-left');
        prevButton.disabled = this.currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.updatePage(this.currentPage - 1);
            }
        });

        // Page info (centered)
        const startIndex = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIndex = Math.min(this.currentPage * this.itemsPerPage, totalResults);
        this.paginationContainer.createEl('div', {
            text: `Showing ${startIndex}-${endIndex} of ${totalResults}`,
            cls: 'centrality-pagination-info'
        });

        // Next button with icon
        const nextButton = this.paginationContainer.createEl('button', {
            cls: 'centrality-pagination-button'
        });
        const nextIcon = nextButton.createEl('span');
        setIcon(nextIcon, 'chevron-right');
        nextButton.disabled = this.currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.updatePage(this.currentPage + 1);
            }
        });
    }

    private updatePage(newPage: number): void {
        const container = this.containerEl.children[1] as HTMLElement;
        if (!container) return;

        // Update current page
        this.currentPage = newPage;

        // Find results list and pagination container
        const resultsSection = container.querySelector('.centrality-results-section') as HTMLElement;
        const resultsList = container.querySelector('.centrality-results-list') as HTMLElement;
        
        if (!resultsSection || !resultsList) return;

        // Render new page content
        this.renderCurrentPage(resultsList);

        // Update pagination controls
        const totalPages = Math.ceil(this.results.length / this.itemsPerPage);
        const totalResults = this.results.length;
        if (this.paginationContainer) {
            this.paginationContainer.remove();
            this.paginationContainer = null;
        }
        this.createPaginationControls(resultsSection, totalPages, totalResults);
    }

    private getScoreForAlgorithm(node: Node): number {
        if (!node?.centrality) {
            return 0;
        }
        
        const algorithmLower = this.algorithm.toLowerCase();
        
        if (algorithmLower.includes('degree')) {
            return typeof node.centrality.degree === 'number' ? node.centrality.degree : 0;
        } else if (algorithmLower.includes('eigenvector')) {
            return typeof node.centrality.eigenvector === 'number' ? node.centrality.eigenvector : 0;
        } else if (algorithmLower.includes('betweenness')) {
            return typeof node.centrality.betweenness === 'number' ? node.centrality.betweenness : 0;
        } else if (algorithmLower.includes('closeness')) {
            return typeof node.centrality.closeness === 'number' ? node.centrality.closeness : 0;
        }
        
        return 0;
    }

    onClose(): Promise<void> {
        this.contentEl.empty();
        
        // Update status bar visibility when closing centrality view
        // Check if any graph analysis views are still active
        setTimeout(() => {
            this.updateStatusBarForGraphViews();
        }, 10);
        return Promise.resolve();
    }

    /**
     * Helper method to manage status bar visibility for graph-related views
     * Hides status bar if any graph analysis or centrality view is active
     */
    private updateStatusBarForGraphViews(): void {
        const activeView = this.app.workspace.getActiveViewOfType(ItemView);
        const activeViewType = activeView?.getViewType();
        
        // Hide status bar if this centrality view or any graph analysis view is active
        const shouldHideStatusBar = activeViewType === CENTRALITY_RESULTS_VIEW_TYPE || 
                                   activeViewType === GRAPH_ANALYSIS_VIEW_TYPE;
        
        if (shouldHideStatusBar) {
            document.body.addClass('graph-analysis-hide-status-bar');
        } else {
            document.body.removeClass('graph-analysis-hide-status-bar');
        }
    }
} 