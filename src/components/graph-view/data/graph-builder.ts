import { App } from 'obsidian';
import { GraphData } from '../../../types/types';

export class GraphDataBuilder {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public async buildGraphData(): Promise<GraphData> {
        const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
        if (!plugin || typeof plugin.buildGraphData !== 'function') {
            throw new Error('Graph analysis plugin not available');
        }
        
        return await plugin.buildGraphData();
    }
}