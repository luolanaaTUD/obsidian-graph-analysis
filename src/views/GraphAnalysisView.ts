import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GraphView } from '../components/graph-view/GraphView';
import GraphAnalysisPlugin from '../main';

export const GRAPH_ANALYSIS_VIEW_TYPE = 'graph-analysis-view';

export class GraphAnalysisView extends ItemView {
    private graphView: GraphView;
    private activeLeafChangeHandler: (leaf: WorkspaceLeaf | null) => void;
    
    constructor(leaf: WorkspaceLeaf, private plugin: GraphAnalysisPlugin) {
        super(leaf);
        this.graphView = new GraphView(this.app);
        
        // Create the event handler
        this.activeLeafChangeHandler = (leaf: WorkspaceLeaf | null) => {
            if (leaf === this.leaf) {
                // This view became active - ensure status bar is hidden
                this.hideStatusBar();
            } else {
                // Another view became active - check if we should show the status bar
                // We only show the status bar if NO graph analysis views are open anywhere
                // This prevents the status bar from appearing when centrality results open in sidebar
                const graphAnalysisViews = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
                const hasOpenGraphView = graphAnalysisViews.length > 0;
                
                // Only show status bar if no graph analysis views are open
                if (!hasOpenGraphView) {
                    this.showStatusBar();
                }
            }
        };
    }

    getViewType(): string {
        return GRAPH_ANALYSIS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Graph Analysis';
    }

    getIcon(): string {
        return 'waypoints';
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.classList.add('graph-analysis-view-container');
        
        // Hide status bar when graph view is opened
        this.hideStatusBar();
        
        // Initialize the graph view
        await this.graphView.onload(container);
        
        // Register event listener for view activation/deactivation
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler)
        );
        
        return;
    }
    
    async onResize(): Promise<void> {
        if (this.graphView) {
            setTimeout(() => {
                this.centerGraphSafely();
            }, 50);
        }
        return;
    }
    
    setEphemeralState(state: any): void {
        super.setEphemeralState(state);
        this.centerGraphSafely();
    }
    
    getState(): any {
        const state = super.getState();
        return {
            ...state,
            lastActive: Date.now()
        };
    }
    
    async onClose(): Promise<void> {
        // Check if this is the last graph analysis view being closed
        const graphAnalysisViews = this.app.workspace.getLeavesOfType(GRAPH_ANALYSIS_VIEW_TYPE);
        const isLastGraphView = graphAnalysisViews.length <= 1; // <= 1 because this view is still counted
        
        // Only restore status bar if this is the last graph view being closed
        if (isLastGraphView) {
            this.showStatusBar();
        }
        
        if (this.graphView) {
            try {
                this.graphView.onunload();
            } catch (e) {
                console.warn('Error unloading graph view:', e);
            }
        }
        
        this.contentEl.empty();
        return;
    }
    
    private hideStatusBar(): void {
        // Add class to body to hide status bar
        document.body.addClass('graph-analysis-hide-status-bar');
    }
    
    private showStatusBar(): void {
        // Remove class from body to show status bar
        document.body.removeClass('graph-analysis-hide-status-bar');
    }
    
    private async centerGraphSafely(): Promise<void> {
        try {
            if (this.graphView) {
                this.graphView.refreshGraphView();
                console.log("Graph position updated after view activation/resize");
                
                setTimeout(() => {
                    try {
                        this.graphView.restartSimulationGently();
                    } catch (e) {
                        console.warn("Error restarting force simulation:", e);
                    }
                }, 50);
            }
        } catch (e) {
            console.warn("Error updating graph position:", e);
        }
    }
}