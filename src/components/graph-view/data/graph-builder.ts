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


        return links;
    }

    public async buildGraphData(): Promise<{ graphData: GraphData, degreeCentrality: Node[], metadata: GraphMetadata }> {
        const plugin = this.pluginService.getPlugin();
        const files = plugin.getIncludedMarkdownFiles();
        const nodes: string[] = [];
        const pathToIndex = new Map<string, number>();
        const edges = new Set<string>();

        for (const file of files) {
            const index = nodes.length;
            nodes.push(file.path);
            pathToIndex.set(file.path, index);
        }

        // Build edges using metadata cache - memoize link resolution
        const linkCache = new Map<string, Set<string>>();
        for (const file of files) {
            const sourceIndex = pathToIndex.get(file.path);
            if (sourceIndex === undefined) continue;

            // Cache link resolution to avoid repeated lookups
            let linkedPaths: Set<string>;
            if (linkCache.has(file.path)) {
                linkedPaths = linkCache.get(file.path)!;
            } else {
                linkedPaths = this.getLinksFromFile(file);
                linkCache.set(file.path, linkedPaths);
            }

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
        const edgesArray: [number, number][] = [];
        for (const edge of edges) {
            const parts = edge.split(',');
            const source = Number(parts[0] ?? 0);
            const target = Number(parts[1] ?? 0);
            edgesArray.push([source, target]);
        }

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