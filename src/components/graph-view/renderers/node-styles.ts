import { GraphNode } from '../types';
import { CentralityCalculator } from '../data/centrality';

export class NodeStyler {
    private centralityCalculator: CentralityCalculator;

    constructor(centralityCalculator: CentralityCalculator) {
        this.centralityCalculator = centralityCalculator;
    }

    public getNodeRadius(node: GraphNode): number {
        // Default size if no centrality score is available
        if (node.centralityScore === undefined) {
            return 6; // Reduced from 8
        }
        
        // Get max centrality score
        const maxScore = this.centralityCalculator.getMaxCentralityScore();
        if (maxScore === 0) return 6; // Reduced from 8
        
        // Adaptive sizing based on graph density
        const nodeCount = node.degree || 0;
        
        // Calculate adaptive scale factor based on node count
        // Use logarithmic scaling to handle both small and large graphs
        // For small graphs: smaller scale factor (starting at 1.5x)
        // For large graphs: larger scale factor (up to 3x)
        let scaleFactor = 1.5;
        if (nodeCount > 10) {
            // Increase scale factor as node count increases
            // Using logarithmic function to make it more gradual
            // 10 nodes: ~1.5x, 100 nodes: ~2x, 1000 nodes: ~2.5x, 10000 nodes: ~3x
            scaleFactor = 1.5 + Math.min(1.5, Math.log10(nodeCount) * 0.5);
        }
        
        // Base size range - reduced for smaller nodes
        const minRadius = 7; // Reduced from 9
        const maxRadius = minRadius * scaleFactor;
        
        // Normalized score (0-1)
        const normalizedScore = node.centralityScore / maxScore;
        
        // Apply the scale factor to determine the final radius
        const radius = minRadius + normalizedScore * (maxRadius - minRadius);
        
        return radius;
    }

    // Calculate adaptive repulsion strength based on node connectivity
    public getNodeRepulsionStrength(node: GraphNode): number {
        // Default repulsion for nodes without degree info
        if (node.degree === undefined) return -120;
        
        // Orphan nodes get less repulsion to keep them closer to center
        if (node.degree === 0) return -60;
        
        // More aggressive repulsion to increase spacing
        const baseStrength = -100; // Increased base repulsion
        const connectivityFactor = Math.min(1 + (node.degree / 12), 2.0); // Less aggressive scaling
        
        return baseStrength * connectivityFactor;
    }
}