import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GraphView } from '../components/graph-view/GraphView';
import { CENTRALITY_RESULTS_VIEW_TYPE } from './CentralityResultsView';
import GraphAnalysisPlugin from '../main';

export const GRAPH_ANALYSIS_VIEW_TYPE = 'graph-analysis-view';

/**
 * GraphAnalysisView manages the graph visualization and implements optimized status bar behavior.
 * 
 * Status Bar Logic (Complete Rules):
 * 1. When a note page is active, status bar is visible (like Obsidian default)
 * 2. Only when the graph view is active (user opened it and is staying at this view), status bar is hidden
 * 3. When user views a note page while graph view is open but not active, status bar shows
 * 4. When centrality result view is active (after pressing centrality button), status bar is hidden 
 *    since this view belongs to graph view functionality
 * 
 * Behavior Examples:
 * - User opens graph view → Status bar hides
 * - User switches from graph to note → Status bar shows  
 * - User has graph open in right pane, note active in left → Status bar shows
 * - User presses centrality button (opens results view) → Status bar stays hidden
 * - User switches from centrality results to note → Status bar shows
 * - User closes all graph-related views → Status bar shows
 * 
 * This provides an immersive graph experience when needed while maintaining normal Obsidian
 * behavior for note editing and viewing.
 */
export class GraphAnalysisView extends ItemView {
    private graphView: GraphView;
    private activeLeafChangeHandler: (leaf: WorkspaceLeaf | null) => void;
    private hasInitialized: boolean = false;
    private wasActive: boolean = false;
    private lastKnownWidth: number = 0;
    private lastKnownHeight: number = 0;
    
    constructor(leaf: WorkspaceLeaf, private plugin: GraphAnalysisPlugin) {
        super(leaf);
        this.graphView = new GraphView(this.app, this.plugin.settings);
        
        // Create the optimized event handler
        this.activeLeafChangeHandler = (leaf: WorkspaceLeaf | null) => {
            // Update status bar visibility based on current workspace state
            // This handles all scenarios: graph view active, note active, or other views active
            this.updateStatusBarVisibility();
            
            const isNowActive = leaf === this.leaf;
            
            // Only reload if switching FROM inactive TO active (not on initial load)
            if (isNowActive && this.hasInitialized && !this.wasActive) {
                // Reload graph data when switching back to the view to ensure it's up to date
                setTimeout(() => {
                    void (async () => {
                        await this.reloadGraphData();
                        await this.centerGraphSafely();
                    })();
                }, 100); // Small delay to ensure the view is fully rendered
            } else if (isNowActive) {
                // Already active or first time - just center the graph
                setTimeout(() => {
                    void this.centerGraphSafely();
                }, 100);
            }
            
            // Update active state tracking - don't treat centrality results view as "leaving" graph workflow
            const newViewType = leaf?.view?.getViewType?.();
            if (newViewType !== CENTRALITY_RESULTS_VIEW_TYPE) {
                this.wasActive = isNowActive;
            }
        };
    }

    getViewType(): string {
        return GRAPH_ANALYSIS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Graph analysis';
    }

    getIcon(): string {
        return 'waypoints';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.classList.add('graph-analysis-view-container');

        // Wait for workspace to be ready before managing status bar
        if (this.app.workspace.layoutReady) {
            this.updateStatusBarVisibility();
        } else {
            // If workspace isn't ready yet, wait for it and then update
            this.app.workspace.onLayoutReady(() => {
                this.updateStatusBarVisibility();
            });
        }

        // Initialize the graph view
        await this.graphView.onload(container);

        const rect = this.containerEl.getBoundingClientRect();
        this.lastKnownWidth = rect.width;
        this.lastKnownHeight = rect.height;

        // Mark as initialized and active after first load
        this.hasInitialized = true;
        this.wasActive = true; // View is active after onOpen completes

        // Register event listener for view activation/deactivation
        // Use a small delay to avoid immediate trigger on registration
        setTimeout(() => {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler)
            );
        }, 200);
    }

    onResize(): void {
        if (this.graphView) {
            const rect = this.containerEl.getBoundingClientRect();
            if (Math.abs(rect.width - this.lastKnownWidth) < 1 &&
                Math.abs(rect.height - this.lastKnownHeight) < 1) {
                return;
            }
            this.lastKnownWidth = rect.width;
            this.lastKnownHeight = rect.height;
            setTimeout(() => {
                void this.centerGraphSafely();
            }, 50);
        }
    }
    
    setEphemeralState(state: unknown): void {
        super.setEphemeralState(state);
        void this.centerGraphSafely();
    }
    
    getState(): Record<string, unknown> {
        const state = super.getState();
        return {
            ...(state),
            lastActive: Date.now()
        };
    }
    
    onClose(): Promise<void> {
        if (this.graphView) {
            try {
                this.graphView.onunload();
            } catch {
                // Error unloading graph view - ignore
            }
        }
        
        this.contentEl.empty();
        
        // Update status bar visibility after a brief delay to allow workspace state to stabilize
        setTimeout(() => {
            this.updateStatusBarVisibility();
        }, 10);
        
        return Promise.resolve();
    }
    
    private hideStatusBar(): void {
        // Add class to body to hide status bar
        document.body.addClass('graph-analysis-hide-status-bar');
    }
    
    private showStatusBar(): void {
        // Remove class from body to show status bar
        document.body.removeClass('graph-analysis-hide-status-bar');
    }
    
    /**
     * Determines whether the status bar should be visible based on the current workspace state
     * Returns true if status bar should be visible, false if it should be hidden
     */
    private shouldShowStatusBar(): boolean {
        const activeView = this.app.workspace.getActiveViewOfType(ItemView);
        
        // If no active view, default to showing status bar
        if (!activeView) {
            return true;
        }
        
        const activeViewType = activeView.getViewType();
        
        // Hide status bar if graph analysis view or centrality results view is currently active
        // Both belong to the graph analysis functionality and should provide immersive experience
        return activeViewType !== GRAPH_ANALYSIS_VIEW_TYPE && 
               activeViewType !== CENTRALITY_RESULTS_VIEW_TYPE;
    }
    
    /**
     * Updates status bar visibility based on current workspace state
     * This method can be called to ensure consistent status bar behavior
     */
    private updateStatusBarVisibility(): void {
        const shouldShow = this.shouldShowStatusBar();
        const currentlyHidden = document.body.hasClass('graph-analysis-hide-status-bar');
        
        // Only make changes if the state needs to change (avoids unnecessary DOM manipulation)
        if (shouldShow && currentlyHidden) {
            this.showStatusBar();
            // Uncomment for debugging: console.log('GraphAnalysisView: Status bar shown');
        } else if (!shouldShow && !currentlyHidden) {
            this.hideStatusBar();
            // Uncomment for debugging: console.log('GraphAnalysisView: Status bar hidden');
        }
    }
    
    /**
     * Reload graph data when switching back to the view
     */
    private async reloadGraphData(): Promise<void> {
        try {
            const graphView = this.graphView;
            if (!graphView) return;
            // Check if this view is currently active/visible
            const isActive = this.app.workspace.getActiveViewOfType(GraphAnalysisView) === this;
            if (!isActive) return;
            await graphView.reloadVaultData();
        } catch {
            // Error reloading graph data - ignore
        }
    }

    private centerGraphSafely(): Promise<void> {
        try {
            const graphView = this.graphView;
            if (!graphView) return Promise.resolve();
            // Check if this view is currently active/visible
            const isActive = this.app.workspace.getActiveViewOfType(GraphAnalysisView) === this;
            if (!isActive) return Promise.resolve();
            graphView.refreshGraphView();
            setTimeout(() => {
                try {
                    graphView.restartSimulationGently();
                } catch {
                    // Error restarting force simulation - ignore
                }
            }, 50);
        } catch {
            // Error updating graph position - ignore
        }
        return Promise.resolve();
    }
    
    public updateSettings(): void {
        if (this.graphView) {
            this.graphView.updateSettings(this.plugin.settings);
        }
    }
    
    public getGraphView(): GraphView {
        return this.graphView;
    }
}