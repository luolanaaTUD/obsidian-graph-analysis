import { App } from 'obsidian';
import { GraphData, Node, IGraphAnalysisPlugin, GraphNeighborsResult, GraphMetadata } from '../types/types';
import GraphAnalysisPlugin from '../main';

interface ExtendedApp extends App {
    plugins: {
        plugins: {
            [key: string]: any;
        };
    };
}

export class PluginService {
    private plugin: GraphAnalysisPlugin;

    constructor(app: App) {
        const extendedApp = app as ExtendedApp;
        this.plugin = extendedApp.plugins.plugins['obsidian-graph-analysis'] as GraphAnalysisPlugin;
        if (!this.plugin) {
            throw new Error('Graph Analysis plugin not found');
        }
    }

    public getPlugin(): GraphAnalysisPlugin {
        return this.plugin;
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