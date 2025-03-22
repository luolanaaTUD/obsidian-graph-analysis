import * as d3 from 'd3';
import { GraphNode, GraphLink } from '../types';
import { NodeStyler } from '../renderers/node-styles';
import { LinkStyler } from '../renderers/link-styles';

export class ForceSimulation {
    private simulation: d3.Simulation<GraphNode, GraphLink>;
    private nodeStyler: NodeStyler;
    private linkStyler: LinkStyler;
    private width: number;
    private height: number;
    private updateCallback: () => void;
    private _tickUpdateScheduled: boolean = false;

    constructor(
        width: number, 
        height: number, 
        nodeStyler: NodeStyler, 
        linkStyler: LinkStyler,
        updateCallback: () => void
    ) {
        this.width = width;
        this.height = height;
        this.nodeStyler = nodeStyler;
        this.linkStyler = linkStyler;
        this.updateCallback = updateCallback;

        // Initialize force simulation with improved parameters
        this.simulation = d3.forceSimulation<GraphNode>()
            .force('charge', d3.forceManyBody()
                .strength((d) => this.nodeStyler.getNodeRepulsionStrength(d as GraphNode))
                .distanceMax(400)) // Increased distance max for more spacing
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.2)) // Stronger center force for circular shape
            .force('collision', d3.forceCollide<GraphNode>()
                .radius(d => this.nodeStyler.getNodeRadius(d) + 15) // Increased padding between nodes
                .strength(0.75)) 
            .force('link', d3.forceLink<GraphNode, GraphLink>()
                .id(d => d.id)
                .distance(d => this.linkStyler.getLinkDistance(d))
                .strength(0.5)) // Balanced link strength
            .force('boundary', this.createBoundaryForce())
            .force('radial', this.createRadialForce())
            .force('circular', this.createCircularLayoutForce()) // Add circular layout force
            .force('label', this.createLabelAvoidanceForce()) // Add force to prevent label overlaps
            .velocityDecay(0.35) // Increased decay for more stable positions
            .alpha(1.0)
            .alphaDecay(0.01) // Slower decay for better settling
            .on('tick', () => {
                // Use a debounced update during low-alpha periods
                if (this.simulation.alpha() < 0.1) {
                    // For settled simulation, we can throttle updates
                    if (!this._tickUpdateScheduled) {
                        this._tickUpdateScheduled = true;
                        requestAnimationFrame(() => {
                            this.updateCallback();
                            this._tickUpdateScheduled = false;
                        });
                    }
                } else {
                    // For active simulation, request animation frame for smoother updates
                    requestAnimationFrame(() => {
                        this.updateCallback();
                    });
                }
            });
            
        // Flag to prevent too many tick updates
        this._tickUpdateScheduled = false;
    }

    public getSimulation(): d3.Simulation<GraphNode, GraphLink> {
        return this.simulation;
    }

    public setDimensions(width: number, height: number) {
        this.width = width;
        this.height = height;
        
        // Update forces that depend on dimensions
        this.simulation
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.2))
            .force('boundary', this.createBoundaryForce())
            .force('radial', this.createRadialForce());
    }

    // Create a custom force to keep nodes within a circular boundary
    private createBoundaryForce() {
        const width = this.width;
        const height = this.height;
        const boundaryRadius = Math.min(width, height) * 0.4; // Boundary for all nodes 
        const centerX = width / 2;
        const centerY = height / 2;
        
        return function(alpha: number) {
            return function(d: any) {
                const dx = d.x - centerX;
                const dy = d.y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Apply different forces based on node connectivity
                const isOrphan = d.degree === 0;
                
                if (isOrphan) {
                    // Orphans stay in inner circle
                    const orphanStrength = 0.15 * alpha;
                    d.vx -= dx * orphanStrength;
                    d.vy -= dy * orphanStrength;
                    
                    // Keep orphans within their boundary
                    const orphanBoundary = boundaryRadius * 0.5; // Tighter boundary for orphans
                    if (distance > orphanBoundary) {
                        d.x = centerX + (dx / distance) * orphanBoundary;
                        d.y = centerY + (dy / distance) * orphanBoundary;
                    }
                } else {
                    // Add a gentle pulling force toward center for all nodes
                    // This helps maintain circular shape
                    const centeringStrength = 0.03 * alpha;
                    d.vx -= dx * centeringStrength;
                    d.vy -= dy * centeringStrength;
                    
                    // Regular nodes get standard boundary behavior
                    if (distance > boundaryRadius) {
                        // Calculate new position within boundary
                        d.x = centerX + (dx / distance) * boundaryRadius;
                        d.y = centerY + (dy / distance) * boundaryRadius;
                    } else if (distance > boundaryRadius * 0.85) {
                        // Apply a gentle force as nodes approach the boundary
                        const nudge = (boundaryRadius - distance) / boundaryRadius;
                        d.vx -= dx * nudge * 0.06 * alpha; // Slightly stronger
                        d.vy -= dy * nudge * 0.06 * alpha;
                    }
                }
            };
        };
    }

    // Create a radial force specifically for orphan nodes
    private createRadialForce() {
        const width = this.width;
        const height = this.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.2; // Inner radius for orphans
        
        return d3.forceRadial<GraphNode>(
            (d: any) => (d as GraphNode).degree === 0 ? radius : Math.min(width, height) * 0.35, // Distribute along radii
            centerX, 
            centerY
        ).strength((d: any) => (d as GraphNode).degree === 0 ? 0.3 : 0.08); // Stronger for orphans, gentler for connected
    }

    // Create a force to arrange nodes in a circular layout
    private createCircularLayoutForce() {
        const width = this.width;
        const height = this.height;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Create rings based on node connectivity
        return (alpha: number) => {
            const k = alpha * 0.1; // Force strength factor
            
            this.simulation.nodes().forEach(node => {
                if (!node.x || !node.y) return;
                
                const connectivity = node.degree || 0;
                
                // Calculate desired radius based on connectivity
                // Higher connectivity = larger radius from center
                const minRadius = Math.min(width, height) * 0.15; // Minimum radius for orphan nodes
                const maxRadius = Math.min(width, height) * 0.35; // Maximum radius for highly connected nodes
                
                // Calculate target radius based on connectivity
                // Map connectivity to a value between minRadius and maxRadius
                // Natural logarithm provides a nice distribution curve
                let targetRadius: number;
                
                if (connectivity === 0) {
                    // Orphan nodes get placed in inner ring
                    targetRadius = minRadius;
                } else {
                    // Connected nodes get distributed based on connectivity
                    // Using log scale to prevent highly connected nodes from going too far
                    const logBase = Math.log(connectivity + 1) / Math.log(10);
                    targetRadius = minRadius + (maxRadius - minRadius) * Math.min(logBase * 0.4, 1);
                }
                
                // Calculate current distance from center
                const dx = (node as any).x - centerX;
                const dy = (node as any).y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy) || 0.1; // Avoid division by zero
                
                // Move node toward the correct radius
                // If too close, push outward; if too far, pull inward
                const radiusDifference = targetRadius - distance;
                
                // Apply force proportional to distance from target radius
                (node as any).vx += dx * radiusDifference * k / distance;
                (node as any).vy += dy * radiusDifference * k / distance;
            });
        };
    }

    // Create a force to prevent label overlaps
    private createLabelAvoidanceForce() {
        const nodeStyler = this.nodeStyler;
        
        return (alpha: number) => {
            const k = alpha * 0.2; // Force strength factor
            const nodes = this.simulation.nodes();
            
            // Use quadtree for efficient collision detection
            const quadtree = d3.quadtree<{x: number, y: number, node: GraphNode, isLabel: boolean, width: number, height: number}>()
                .x(d => d.x)
                .y(d => d.y)
                .addAll(
                    // First add all nodes
                    nodes.map(node => ({
                        x: (node as any).x,
                        y: (node as any).y,
                        node: node,
                        isLabel: false,
                        width: nodeStyler.getNodeRadius(node) * 2,
                        height: nodeStyler.getNodeRadius(node) * 2
                    }))
                    // Then add all labels (positioned below their nodes)
                    .concat(nodes.map(node => ({
                        x: (node as any).x,
                        y: (node as any).y + nodeStyler.getNodeRadius(node) + 15,
                        node: node,
                        isLabel: true,
                        width: (node.name?.length || 0) * 6.5,
                        height: 14
                    })))
                );
            
            // Process each label to avoid overlaps
            nodes.forEach(node => {
                if (!node.x || !node.y) return;
                
                // Skip nodes that are being dragged
                if ((node as any).fx !== undefined && (node as any).fy !== undefined) return;
                
                // Get the label position (below the node)
                const labelX = (node as any).x;
                const labelY = (node as any).y + nodeStyler.getNodeRadius(node) + 15;
                const labelWidth = (node.name?.length || 0) * 6.5;
                const labelHeight = 14;
                
                // Keep track of overlaps
                let overlaps = 0;
                let totalDisplacementX = 0;
                let totalDisplacementY = 0;
                
                // Use the quadtree to efficiently find nearby entities
                quadtree.visit((quad, x1, y1, x2, y2) => {
                    if (!('data' in quad)) return true;
                    
                    const d = quad.data;
                    if (!d || d.node === node) return true; // Skip self
                    
                    // Calculate distance between centers
                    const dx = labelX - d.x;
                    const dy = labelY - d.y;
                    
                    // For distance check, nodes are circular but labels are rectangular
                    let collision = false;
                    
                    if (d.isLabel) {
                        // Label-label collision (rectangle-rectangle)
                        const halfWidthA = labelWidth / 2;
                        const halfHeightA = labelHeight / 2;
                        const halfWidthB = d.width / 2;
                        const halfHeightB = d.height / 2;
                        
                        // Check for overlap
                        const overlapX = Math.abs(dx) < (halfWidthA + halfWidthB);
                        const overlapY = Math.abs(dy) < (halfHeightA + halfHeightB);
                        
                        collision = overlapX && overlapY;
                    } else {
                        // Label-node collision (rectangle-circle)
                        // Convert circle (node) to a square for simpler collision check
                        const nodeRadius = d.width / 2;
                        const halfLabelWidth = labelWidth / 2;
                        const halfLabelHeight = labelHeight / 2;
                        
                        // Check if the rectangle (label) overlaps with the circle (node)
                        // Simplify by checking if the rectangle overlaps with the square that bounds the circle
                        const overlapX = Math.abs(dx) < (halfLabelWidth + nodeRadius);
                        const overlapY = Math.abs(dy) < (halfLabelHeight + nodeRadius);
                        
                        collision = overlapX && overlapY;
                    }
                    
                    if (collision) {
                        overlaps++;
                        
                        // Calculate displacement vector
                        const distance = Math.sqrt(dx * dx + dy * dy) || 0.1;
                        const padding = d.isLabel ? 5 : 0; // Extra padding for label-label collisions
                        
                        // Strength is stronger for node-label collisions than label-label
                        const strength = d.isLabel ? 0.5 : 1.5;
                        
                        // Normalized displacement
                        const displacementX = (dx / distance) * strength;
                        const displacementY = (dy / distance) * strength;
                        
                        totalDisplacementX += displacementX;
                        totalDisplacementY += displacementY;
                    }
                    
                    return true;
                });
                
                // If we have overlaps, adjust the node position to resolve them
                if (overlaps > 0) {
                    // Apply average displacement to the node
                    const avgDisplacementX = totalDisplacementX / overlaps;
                    const avgDisplacementY = totalDisplacementY / overlaps;
                    
                    // Stronger force for highly connected nodes
                    const connectivityFactor = 1 + Math.min((node.degree || 0) / 10, 1);
                    
                    // Apply displacement force to the node
                    (node as any).vx += avgDisplacementX * k * connectivityFactor;
                    (node as any).vy += avgDisplacementY * k * connectivityFactor;
                }
            });
        };
    }

    /**
     * Initializes node positions using a circular layout
     */
    public initializePositions() {
        const nodes = this.simulation.nodes();
        this.initializeCircularPositions(nodes);
        
        // Restart simulation with higher alpha for better initial layout
        this.simulation.alpha(1).restart();
    }

    /**
     * Initialize node positions in a circular layout
     */
    public initializeCircularPositions(nodes: GraphNode[]) {
        const width = this.width;
        const height = this.height;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Sort nodes by degree (highest to lowest)
        // This places the most connected nodes on the outer rings
        const sortedNodes = [...nodes].sort((a, b) => {
            const degreeA = a.degree || 0;
            const degreeB = b.degree || 0;
            return degreeB - degreeA;
        });
        
        // Calculate radius steps based on node count
        const numNodes = sortedNodes.length;
        const minRadius = Math.min(width, height) * 0.15;
        const maxRadius = Math.min(width, height) * 0.35;
        
        // Position nodes along concentric circles
        sortedNodes.forEach((node, i) => {
            // Distribute nodes along multiple concentric circles
            // Nodes with higher connectivity go to outer rings
            const connectivity = node.degree || 0;
            
            // Calculate which ring this node belongs to (based on connectivity)
            // Generate a radius value that increases with connectivity (with some randomness)
            let radiusRatio: number;
            
            if (connectivity === 0) {
                // Orphan nodes stay in inner circle
                radiusRatio = 0.2 + Math.random() * 0.1; // 20-30% radius
            } else {
                // Connected nodes get placed between 30% and 90% of max radius
                // Higher connectivity = larger radius
                const logBase = Math.log(connectivity + 1) / Math.log(10); // log10 of connectivity
                radiusRatio = 0.3 + Math.min(logBase * 0.3, 0.6) + Math.random() * 0.1;
            }
            
            const radius = minRadius + (maxRadius - minRadius) * radiusRatio;
            
            // Calculate position on circle (distribute nodes evenly around circle)
            // Use golden ratio to avoid clustering
            const angle = i * 2.39996; // Close to golden angle in radians
            
            // Set initial position
            (node as any).x = centerX + radius * Math.cos(angle);
            (node as any).y = centerY + radius * Math.sin(angle);
        });
    }

    /**
     * Updates forces in the simulation
     */
    public updateForces() {
        // Restart simulation with an increased alpha for better layout
        this.simulation.alpha(0.3).restart();
    }

    /**
     * Sets the nodes for the simulation
     */
    public setNodes(nodes: GraphNode[]) {
        this.simulation.nodes(nodes);
    }

    /**
     * Sets the links for the simulation
     */
    public setLinks(links: GraphLink[]) {
        const linkForce = this.simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>;
        linkForce.links(links);
    }

    /**
     * Ensures all nodes are visible by adjusting the zoom transform
     */
    public ensureNodesAreVisible(
        svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
        zoom: d3.ZoomBehavior<SVGSVGElement, unknown>
    ) {
        const nodes = this.simulation.nodes();
        if (!nodes.length) return;
        
        // Find the bounds of all nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        nodes.forEach(node => {
            const x = (node as any).x || 0;
            const y = (node as any).y || 0;
            const r = this.nodeStyler.getNodeRadius(node);
            
            minX = Math.min(minX, x - r);
            minY = Math.min(minY, y - r);
            maxX = Math.max(maxX, x + r);
            maxY = Math.max(maxY, y + r);
        });
        
        // Calculate current graph dimensions
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Calculate center points
        const graphCenterX = minX + graphWidth / 2;
        const graphCenterY = minY + graphHeight / 2;
        const canvasCenterX = this.width / 2;
        const canvasCenterY = this.height / 2;
        
        // Calculate scale to fit everything
        const scaleX = this.width * 0.9 / graphWidth; // Leave 5% margin on each side
        const scaleY = this.height * 0.9 / graphHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // Set initial zoom transform to fit all nodes
        const initialTransform = d3.zoomIdentity
            .translate(canvasCenterX, canvasCenterY)
            .scale(scale > 1 ? 1 : scale) // Don't zoom in, only zoom out if needed
            .translate(-graphCenterX, -graphCenterY);
            
        svg.call(zoom.transform, initialTransform);
    }
    
    /**
     * Cleans up resources used by the simulation
     */
    public onunload() {
        if (this.simulation) {
            this.simulation.stop();
        }
    }
}