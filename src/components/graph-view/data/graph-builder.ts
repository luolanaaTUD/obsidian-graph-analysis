import { App } from 'obsidian';
import { GraphData, Node, GraphMetadata } from '../../../types/types';
import { PluginService } from '../../../services/PluginService';

export class GraphDataBuilder {
    private pluginService: PluginService;

    constructor(app: App) {
        this.pluginService = new PluginService(app);
    }

    public async buildGraphData(): Promise<{ graphData: GraphData, degreeCentrality: Node[], metadata: GraphMetadata }> {
        // First build the graph from vault data
        const graphData = await this.pluginService.buildGraphFromVault();
        console.log('Graph data built:', graphData);
        
        // Get the graph metadata from Rust WASM
        const metadata = this.pluginService.getGraphMetadata();
        console.log('Graph metadata:', metadata);
        console.log(`Node count: ${metadata.node_count}, Edge count: ${metadata.edge_count}`);
        console.log(`Max degree: ${metadata.max_degree}, Average degree: ${metadata.avg_degree.toFixed(2)}`);
        console.log(`Is directed: ${metadata.is_directed}`);
        
        // Then calculate degree centrality (this is done automatically after graph building in Rust)
        const degreeCentrality = this.pluginService.calculateDegreeCentrality();
        console.log('Degree centrality calculated:', degreeCentrality);
        
        // Return all data
        return {
            graphData,
            degreeCentrality,
            metadata
        };
    }
}