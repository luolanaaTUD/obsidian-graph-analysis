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


        return links;
    }

    public async buildGraphData(): Promise<{ graphData: GraphData, degreeCentrality: Node[], metadata: GraphMetadata }> {
        const allFiles = this.getAllMarkdownFiles();
        const plugin = this.pluginService.getPlugin();
        
        // Filter files using exclusion logic - single pass
        const files: TFile[] = [];
        const nodes: string[] = [];
        const pathToIndex = new Map<string, number>();
        const edges = new Set<string>();

        // Build nodes array, path-to-index mapping, and filter in single pass
        for (const file of allFiles) {
            if (plugin.isFileExcluded(file)) continue;
            
            const index = nodes.length;
            nodes.push(file.path);
            pathToIndex.set(file.path, index);
            files.push(file);
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

        // Convert edges set to array format - single pass with pre-allocated array
        const edgesArray: [number, number][] = new Array(edges.size);
        let edgeIndex = 0;
        for (const edge of edges) {
            const [source, target] = edge.split(',').map(Number);
            edgesArray[edgeIndex++] = [source, target];
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