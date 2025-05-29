import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { Node } from '../types/types';
import { GRAPH_ANALYSIS_VIEW_TYPE } from './GraphAnalysisView';

export const CENTRALITY_RESULTS_VIEW_TYPE = 'centrality-results-view';

export class CentralityResultsView extends ItemView {
    private results: Node[] = [];
    private algorithm: string = '';

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return CENTRALITY_RESULTS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Centrality Analysis';
    }

    getIcon(): string {
        return 'waypoints';
    }

    async onOpen(): Promise<void> {
        // Ensure status bar is hidden when centrality results view is opened
        // This provides consistency with the graph analysis view behavior
        this.updateStatusBarForGraphViews();
    }

    async setResults(results: Node[], algorithm: string): Promise<void> {
        this.results = results;
        this.algorithm = algorithm;
        await this.updateView();
    }

    private async updateView(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('centrality-results-container');

        // Create header
        const header = container.createEl('div', { cls: 'centrality-results-header' });
        header.createEl('h2', { text: `${this.algorithm} Analysis` });

        // Create results list
        const resultsList = container.createEl('div', { cls: 'centrality-results-list' });

        this.results.forEach((result) => {
            const resultItem = resultsList.createEl('div', { cls: 'centrality-result-item' });
            
            // Note name and link
            const noteInfo = resultItem.createEl('div', { cls: 'result-note-info' });
            const noteLink = noteInfo.createEl('a', {
                cls: 'result-note-link',
                text: result.node_name
            });
            noteLink.addEventListener('click', async (e) => {
                e.preventDefault();
                const file = this.app.vault.getAbstractFileByPath(result.node_name);
                if (file instanceof TFile) {
                    await this.app.workspace.getLeaf().openFile(file);
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

    async onClose(): Promise<void> {
        this.contentEl.empty();
        
        // Update status bar visibility when closing centrality view
        // Check if any graph analysis views are still active
        setTimeout(() => {
            this.updateStatusBarForGraphViews();
        }, 10);
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