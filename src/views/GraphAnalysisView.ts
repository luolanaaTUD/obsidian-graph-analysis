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
                
                // Only update graph if it's actually visible and ready
                setTimeout(() => {
                    this.centerGraphSafely();
                }, 100); // Small delay to ensure the view is fully rendered
            } else {
                // Another view became active - check if the new active view is a graph analysis view
                // This ensures status bar is only shown when NO graph analysis view is currently active
                const activeView = this.app.workspace.getActiveViewOfType(GraphAnalysisView);
                
                // Show status bar only if the active view is NOT a graph analysis view
                if (!activeView) {
                    this.showStatusBar();
                } else {
                    // If the active view is a graph analysis view, ensure status bar is hidden
                    this.hideStatusBar();
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
        if (this.graphView) {
            try {
                this.graphView.onunload();
            } catch (e) {
                console.warn('Error unloading graph view:', e);
            }
        }
        
        this.contentEl.empty();
        
        // After closing, check if there's still an active graph analysis view
        // Use setTimeout to ensure the view is fully closed before checking
        setTimeout(() => {
            const activeGraphView = this.app.workspace.getActiveViewOfType(GraphAnalysisView);
            
            // Show status bar only if no graph analysis view is currently active
            if (!activeGraphView) {
                this.showStatusBar();
            }
        }, 10);
        
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
                // Check if this view is currently active/visible
                const isActive = this.app.workspace.getActiveViewOfType(GraphAnalysisView) === this;
                
                // Only refresh the graph if this view is active and visible
                if (isActive) {
                    this.graphView.refreshGraphView();
                    console.log("Graph position updated after view activation/resize");
                    
                    setTimeout(() => {
                        try {
                            if (this.graphView) {
                                this.graphView.restartSimulationGently();
                            }
                        } catch (e) {
                            console.warn("Error restarting force simulation:", e);
                        }
                    }, 50);
                }
            }
        } catch (e) {
            console.warn("Error updating graph position:", e);
        }
    }
}