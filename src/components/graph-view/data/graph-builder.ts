import { App } from 'obsidian';
import { GraphData, Node } from '../../../types/types';
import { PluginService } from '../../../services/PluginService';

export class GraphDataBuilder {
    private pluginService: PluginService;

    constructor(app: App) {
        this.pluginService = new PluginService(app);
    }

    public async buildGraphData(): Promise<{ graphData: GraphData, degreeCentrality: Node[] }> {
        // First build the graph from vault data
        const graphData = await this.pluginService.buildGraphFromVault();
        console.log('Graph data built:', graphData);
        
        // Then calculate degree centrality (this is done automatically after graph building in Rust)
        const degreeCentrality = this.pluginService.calculateDegreeCentrality();
        console.log('Degree centrality calculated:', degreeCentrality);
        
        // Return both pieces of data
        return {
            graphData,
            degreeCentrality
        };
    }
}