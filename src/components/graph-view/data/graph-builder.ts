import { App } from 'obsidian';
import { GraphData } from '../types';

export class GraphDataBuilder {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    public async buildGraphData(): Promise<GraphData> {
        // Use the plugin's buildGraphData method if available
        // This will use the Rust implementation if available
        const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
        if (plugin && typeof plugin.buildGraphData === 'function') {
            try {
                return await plugin.buildGraphData();
            } catch (error) {
                console.error('Error using plugin graph builder, falling back to local implementation:', error);
            }
        }
        
        // Fallback to local implementation
        const files = this.app.vault.getMarkdownFiles();
        const nodes: string[] = [];
        const nodeMap: Map<string, number> = new Map();
        const edges: [number, number][] = [];
        
        // Create nodes
        for (const file of files) {
            // Skip files in excluded folders (if we had settings)
            // For now, we'll include all files
            
            const nodeId = nodes.length;
            nodes.push(file.path);
            nodeMap.set(file.path, nodeId);
        }
        
        // Create edges (links between notes)
        for (const file of files) {
            const sourceId = nodeMap.get(file.path);
            if (sourceId === undefined) continue;
            
            // Get all links in the file
            const content = await this.app.vault.read(file);
            const linkRegex = /\[\[([^\]]+?)\]\]/g;
            let match;
            
            while ((match = linkRegex.exec(content)) !== null) {
                let linkPath = match[1];
                
                // Handle aliases in links
                if (linkPath.includes('|')) {
                    linkPath = linkPath.split('|')[0];
                }
                
                // Try to resolve the link to a file
                const linkedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, file.path);
                
                if (linkedFile) {
                    const targetId = nodeMap.get(linkedFile.path);
                    if (targetId !== undefined) {
                        edges.push([sourceId, targetId]);
                    }
                }
            }
        }
        
        return { nodes, edges };
    }
}