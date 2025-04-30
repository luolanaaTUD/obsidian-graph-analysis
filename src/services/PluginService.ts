import { App } from 'obsidian';
import { GraphInitializationResult, IGraphAnalysisPlugin } from '../types/types';

export class PluginService {
    private plugin: IGraphAnalysisPlugin;

    constructor(app: App) {
        const plugin = (app as any).plugins.plugins['obsidian-graph-analysis'];
        if (!plugin) {
            throw new Error('Graph analysis plugin not available');
        }
        this.plugin = plugin as IGraphAnalysisPlugin;
    }

    async ensureWasmLoaded(): Promise<void> {
        return this.plugin.ensureWasmLoaded();
    }

    async getGraphData(): Promise<GraphInitializationResult> {
        await this.ensureWasmLoaded();
        return this.plugin.initializeGraphAndCalculateCentrality();
    }

    getNodeNeighbors(nodeId: number): any {
        return this.plugin.getNodeNeighborsCached(nodeId);
    }

    initializeGraphCache(graphData: string): any {
        return this.plugin.initializeGraphCache(graphData);
    }

    clearGraphCache(): void {
        this.plugin.clearGraphCache();
    }
} 