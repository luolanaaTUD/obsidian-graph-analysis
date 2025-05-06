import { App } from 'obsidian';
import { GraphData, Node, IGraphAnalysisPlugin, GraphNeighborsResult, GraphMetadata } from '../types/types';

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

    async buildGraphFromVault(): Promise<GraphData> {
        await this.ensureWasmLoaded();
        return this.plugin.buildGraphFromVault();
    }

    calculateDegreeCentrality(): Node[] {
        return this.plugin.calculateDegreeCentralityCached();
    }

    calculateEigenvectorCentrality(): Node[] {
        return this.plugin.calculateEigenvectorCentralityCached();
    }

    calculateBetweennessCentrality(): Node[] {
        return this.plugin.calculateBetweennessCentralityCached();
    }

    calculateClosenessCentrality(): Node[] {
        return this.plugin.calculateClosenessCentralityCached();
    }

    getNodeNeighbors(nodeId: number): GraphNeighborsResult {
        return this.plugin.getNodeNeighborsCached(nodeId);
    }

    clearGraphCache(): void {
        this.plugin.clearGraphCache();
    }

    getGraphMetadata(): GraphMetadata {
        return this.plugin.getGraphMetadata();
    }
} 