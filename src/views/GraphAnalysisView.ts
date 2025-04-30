import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GraphView } from '../components/graph-view/GraphView';
import GraphAnalysisPlugin from '../main';

export const GRAPH_ANALYSIS_VIEW_TYPE = 'graph-analysis-view';

export class GraphAnalysisView extends ItemView {
    private graphView: GraphView;
    
    constructor(leaf: WorkspaceLeaf, private plugin: GraphAnalysisPlugin) {
        super(leaf);
        this.graphView = new GraphView(this.app);
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
        
        // Initialize the graph view
        await this.graphView.onload(container);
        
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
        return;
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