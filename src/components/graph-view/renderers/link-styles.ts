import { GraphLink, GraphNode } from '../types';
import { NodeStyler } from './node-styles';

export class LinkStyler {
    private nodeStyler: NodeStyler;
    private nodes: GraphNode[];

    constructor(nodeStyler: NodeStyler, nodes: GraphNode[]) {
        this.nodeStyler = nodeStyler;
        this.nodes = nodes;
    }

    public setNodes(nodes: GraphNode[]) {
        this.nodes = nodes;
    }

    public getLinkDistance(link: GraphLink): number {
        // Get source and target nodes
        const source = this.nodes.find(n => n.id === (typeof link.source === 'string' ? link.source : (link.source as any).id));
        const target = this.nodes.find(n => n.id === (typeof link.target === 'string' ? link.target : (link.target as any).id));
        
        if (!source || !target) return 100;
        
        // Base distance plus node radii - increased for more breathing room
        const baseDistance = 90; // Increased from 60
        
        // Adjust distance based on graph density
        const densityFactor = Math.max(0.7, 1 - (this.nodes.length / 500));
        
        // Enhanced bridge node handling
        const sourceConnectivity = source.degree || 0;
        const targetConnectivity = target.degree || 0;
        
        // Check if this is likely a bridge between clusters
        const isBridgeLink = 
            // Case 1: Both nodes have significant connectivity (connecting major nodes)
            (sourceConnectivity > 3 && targetConnectivity > 3) ||
            // Case 2: Large difference in connectivity (connecting hub to periphery)
            (Math.abs(sourceConnectivity - targetConnectivity) > 3);
        
        // For bridge links, moderate the distance to maintain circular shape
        if (isBridgeLink) {
            return (baseDistance * 0.8 * densityFactor) + 
                   this.nodeStyler.getNodeRadius(source) + this.nodeStyler.getNodeRadius(target);
        }
        
        // For normal links within clusters, use a longer distance
        return (baseDistance * densityFactor) + 
               this.nodeStyler.getNodeRadius(source) + this.nodeStyler.getNodeRadius(target);
    }
}