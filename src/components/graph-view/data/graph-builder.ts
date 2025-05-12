import { App, TFile } from 'obsidian';
import { GraphData, Node, GraphMetadata } from '../../../types/types';
import { PluginService } from '../../../services/PluginService';

export class GraphDataBuilder {
    private pluginService: PluginService;
    private app: App;

    constructor(app: App) {
        this.pluginService = new PluginService(app);
        this.app = app;
    }

    private getAllMarkdownFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles();
    }

    private getLinksFromFile(file: TFile): Set<string> {
        const links = new Set<string>();
        const cache = this.app.metadataCache.getFileCache(file);
        
        if (!cache) return links;

        // Collect all types of links
        const allLinks = [
            ...(cache.links || []),
            ...(cache.embeds || []),
            ...(cache.frontmatterLinks || [])
        ];

        // Process each link
        for (const link of allLinks) {
            const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
            if (resolvedFile) {
                links.add(resolvedFile.path);
            }
        }

        // Instead of directly using getBacklinksForFile which may not be available,
        // let's modify our approach to only use standard API methods
        // This ensures compatibility with the Obsidian API

        return links;
    }

    public async buildGraphData(): Promise<{ graphData: GraphData, degreeCentrality: Node[], metadata: GraphMetadata }> {
        const files = this.getAllMarkdownFiles();
        const nodes: string[] = [];
        const edges = new Set<string>();
        const pathToIndex = new Map<string, number>();

        // Build nodes array and path-to-index mapping
        for (const file of files) {
            const index = nodes.length;
            nodes.push(file.path);
            pathToIndex.set(file.path, index);
        }

        // Build edges using metadata cache
        for (const file of files) {
            const sourceIndex = pathToIndex.get(file.path);
            if (sourceIndex === undefined) continue;

            const linkedPaths = this.getLinksFromFile(file);
            for (const linkedPath of linkedPaths) {
                const targetIndex = pathToIndex.get(linkedPath);
                if (targetIndex === undefined) continue;

                // For undirected graph, always store edge with smaller index first
                const minIndex = Math.min(sourceIndex, targetIndex);
                const maxIndex = Math.max(sourceIndex, targetIndex);
                edges.add(`${minIndex},${maxIndex}`);
            }
        }

        // Convert edges set to array format
        const edgesArray: [number, number][] = Array.from(edges).map(edge => {
            const [source, target] = edge.split(',').map(Number);
            return [source, target];
        });

        // Build final graph data structure
        const graphData: GraphData = {
            nodes,
            edges: edgesArray
        };

        // Initialize graph in Rust and get analysis results
        await this.pluginService.initializeGraph(graphData);
        const metadata = this.pluginService.getGraphMetadata();
        const degreeCentrality = this.pluginService.calculateDegreeCentrality();
        
        return {
            graphData,
            degreeCentrality,
            metadata
        };
    }
}