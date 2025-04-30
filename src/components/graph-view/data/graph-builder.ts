import { App } from 'obsidian';
import { GraphInitializationResult } from '../../../types/types';
import { PluginService } from '../../../services/PluginService';

export class GraphDataBuilder {
    private pluginService: PluginService;

    constructor(app: App) {
        this.pluginService = new PluginService(app);
    }

    public async buildGraphData(): Promise<GraphInitializationResult> {
        // Get graph data and centrality results
        return await this.pluginService.getGraphData();
    }
}