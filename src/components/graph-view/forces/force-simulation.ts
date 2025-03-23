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
    private _tickCounter: number = 0;
    private _batchSize: number = 2; // Process every Nth tick
    
    // Animation frame management
    private _animationFrameId: number | null = null;
    private _lastRenderTime: number = 0;
    private _minRenderInterval: number = 16; // ~60fps

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
                // Count ticks to batch updates
                this._tickCounter++;
                
                // Determine when to update based on simulation state
                const alpha = this.simulation.alpha();
                const isHighActivity = alpha > 0.2;
                const isMediumActivity = alpha > 0.05 && alpha <= 0.2;
                const isLowActivity = alpha <= 0.05;
                
                let shouldUpdate = false;
                
                // Update strategies based on simulation activity level
                if (isHighActivity) {
                    // During high activity, update every few ticks
                    shouldUpdate = this._tickCounter % this._batchSize === 0;
                } else if (isMediumActivity) {
                    // During medium activity, throttle more aggressively
                    shouldUpdate = this._tickCounter % (this._batchSize * 2) === 0;
                } else if (isLowActivity) {
                    // During low activity, only update when explicitly needed
                    if (!this._tickUpdateScheduled) {
                        this._tickUpdateScheduled = true;
                        shouldUpdate = true;
                    } else {
                        shouldUpdate = false;
                    }
                }
                
                // When we should update, use requestAnimationFrame for smooth rendering
                if (shouldUpdate) {
                    if (isLowActivity) {
                        // Reset tick counters after batched update
                        this._tickCounter = 0;
                    }
                    
                    // Cancel any existing animation frame to prevent multiple updates
                    this.cancelPendingAnimationFrame();
                    
                    // Current time for throttling
                    const now = performance.now();
                    
                    // Only schedule new frame if we're not in rapid succession
                    if (now - this._lastRenderTime >= this._minRenderInterval) {
                        // Use double requestAnimationFrame for smoother rendering
                        this._animationFrameId = requestAnimationFrame(() => {
                            // First frame - browser prepares layout calculations
                            this._animationFrameId = requestAnimationFrame(() => {
                                // Second frame - actual rendering happens here
                                this.updateCallback();
                                this._animationFrameId = null;
                                this._lastRenderTime = performance.now();
                                
                                if (isLowActivity) {
                                    this._tickUpdateScheduled = false;
                                }
                            });
                        });
                    } else if (isLowActivity) {
                        // For low activity, always ensure we get an update eventually
                        this._animationFrameId = requestAnimationFrame(() => {
                            this._animationFrameId = requestAnimationFrame(() => {
                                this.updateCallback();
                                this._animationFrameId = null;
                                this._lastRenderTime = performance.now();
                                this._tickUpdateScheduled = false;
                            });
                        });
                    }
                }
            });
            
        // Flag to prevent too many tick updates
        this._tickUpdateScheduled = false;
    }
    
    private cancelPendingAnimationFrame() {
        if (this._animationFrameId !== null) {
            cancelAnimationFrame(this._animationFrameId);
            this._animationFrameId = null;
        }
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
        const boundaryRadius = Math.min(width, height) * 0.35; // Reduced from 0.4
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
                    const orphanStrength = 0.2 * alpha; // Increased from 0.15
                    d.vx -= dx * orphanStrength;
                    d.vy -= dy * orphanStrength;
                    
                    // Keep orphans within their boundary
                    const orphanBoundary = boundaryRadius * 0.4; // Reduced from 0.5
                    if (distance > orphanBoundary) {
                        d.x = centerX + (dx / distance) * orphanBoundary;
                        d.y = centerY + (dy / distance) * orphanBoundary;
                    }
                } else {
                    // Add a gentle pulling force toward center for all nodes
                    // This helps maintain circular shape
                    const centeringStrength = 0.05 * alpha; // Increased from 0.03
                    d.vx -= dx * centeringStrength;
                    d.vy -= dy * centeringStrength;
                    
                    // Regular nodes get standard boundary behavior
                    if (distance > boundaryRadius) {
                        // Calculate new position within boundary
                        d.x = centerX + (dx / distance) * boundaryRadius;
                        d.y = centerY + (dy / distance) * boundaryRadius;
                    } else if (distance > boundaryRadius * 0.8) { // Reduced from 0.85
                        // Apply a gentle force as nodes approach the boundary
                        const nudge = (boundaryRadius - distance) / boundaryRadius;
                        d.vx -= dx * nudge * 0.08 * alpha; // Increased from 0.06
                        d.vy -= dy * nudge * 0.08 * alpha;
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
        
        // Calculate radius steps based on container size
        const minRadius = Math.min(width, height) * 0.1;  // Reduced from 0.15
        const maxRadius = Math.min(width, height) * 0.3;  // Reduced from 0.35
        
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
                radiusRatio = 0.15 + Math.random() * 0.1; // 15-25% radius
            } else {
                // Connected nodes get placed between 25% and 85% of max radius
                // Higher connectivity = larger radius
                const logBase = Math.log(connectivity + 1) / Math.log(10); // log10 of connectivity
                radiusRatio = 0.25 + Math.min(logBase * 0.3, 0.6) + Math.random() * 0.1;
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
        if (linkForce) {
            linkForce.links(links);
        } else {
            // Create a new link force if one doesn't exist
            this.simulation.force('link', d3.forceLink<GraphNode, GraphLink>()
                .id(d => d.id)
                .distance(d => this.linkStyler.getLinkDistance(d))
                .strength(0.5)
                .links(links));
        }
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
        
        try {
            // Find the bounds of all nodes
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;
            
            // Track if we have any valid nodes with positions
            let hasValidNodes = false;
            
            nodes.forEach(node => {
                // Skip nodes without valid positions
                if (node.x === undefined || node.y === undefined) return;
                
                hasValidNodes = true;
                const x = node.x;
                const y = node.y;
                const r = this.nodeStyler.getNodeRadius(node);
                
                minX = Math.min(minX, x - r);
                minY = Math.min(minY, y - r);
                maxX = Math.max(maxX, x + r);
                maxY = Math.max(maxY, y + r);
            });
            
            // If we don't have any valid nodes, use the default transform
            if (!hasValidNodes) {
                const defaultTransform = d3.zoomIdentity
                    .translate(this.width / 2, this.height / 2)
                    .scale(0.8);
                
                svg.transition()
                    .duration(300)
                    .call(zoom.transform, defaultTransform);
                return;
            }
            
            // Calculate current graph dimensions
            const graphWidth = maxX - minX;
            const graphHeight = maxY - minY;
            
            // Handle case where graph dimensions are very small or zero
            if (graphWidth < 1 || graphHeight < 1) {
                // Apply a default transform that centers at the origin with normal scale
                const defaultTransform = d3.zoomIdentity
                    .translate(this.width / 2, this.height / 2)
                    .scale(0.8);
                
                svg.transition()
                    .duration(300)
                    .call(zoom.transform, defaultTransform);
                return;
            }
            
            // Calculate center points
            const graphCenterX = minX + graphWidth / 2;
            const graphCenterY = minY + graphHeight / 2;
            const canvasCenterX = this.width / 2;
            const canvasCenterY = this.height / 2;
            
            // Calculate scale to fit everything with a comfortable margin
            const margin = 0.15; // 15% margin on each side
            const scaleX = this.width * (1 - 2 * margin) / graphWidth;
            const scaleY = this.height * (1 - 2 * margin) / graphHeight;
            
            // Use the smallest scale to ensure everything fits
            let scale = Math.min(scaleX, scaleY);
            
            // Ensure scale is reasonable (not too small or large)
            scale = Math.max(0.3, Math.min(scale, 1.2));
            
            // Create transform to center all nodes
            const transform = d3.zoomIdentity
                .translate(canvasCenterX, canvasCenterY)
                .scale(scale)
                .translate(-graphCenterX, -graphCenterY);
            
            // Check if there's already a transform
            const currentTransform = d3.zoomTransform(svg.node() as Element);
            const isInitialTransform = !currentTransform || currentTransform.k === 1;
            
            // Apply the transform with a smooth transition for initial positioning
            // but instantly for subsequent adjustments to avoid jerkiness
            if (isInitialTransform) {
                svg.transition()
                    .duration(500) // Smooth animation for initial positioning
                    .call(zoom.transform, transform);
            } else {
                svg.call(zoom.transform, transform);
            }
        } catch (error) {
            console.error('Error ensuring nodes are visible:', error);
            
            // Fallback to basic centering if there's an error
            try {
                const basicTransform = d3.zoomIdentity
                    .translate(this.width / 2, this.height / 2)
                    .scale(0.8);
                
                svg.call(zoom.transform, basicTransform);
            } catch (e) {
                console.error('Fallback transform failed:', e);
            }
        }
    }
    
    /**
     * Cleans up resources used by the simulation
     */
    public onunload() {
        console.log('Unloading force simulation');
        
        // Stop the simulation
        if (this.simulation) {
            // Set alpha to 0 to stop the simulation
            this.simulation.alpha(0).stop();
            
            // Remove all forces to help garbage collection
            this.simulation
                .force('charge', null)
                .force('center', null)
                .force('collision', null)
                .force('link', null)
                .force('boundary', null)
                .force('radial', null)
                .force('circular', null)
                .force('label', null);
            
            // Remove tick event handler
            this.simulation.on('tick', null);
        }
        
        // Cancel any pending animation frames
        this.cancelPendingAnimationFrame();
        
        // Clean up references to help garbage collection
        this.nodeStyler = null as any;
        this.linkStyler = null as any;
        this.updateCallback = null as any;
        this.simulation = null as any;
    }

    /**
     * Restart the simulation with a gentle approach for smooth transitions
     * Useful when updating the graph with minor changes
     */
    public restartGently() {
        // Use a lower alpha to make the transition smoother
        this.simulation.alpha(0.2)
            .alphaDecay(0.02) // Faster decay for quicker settling
            .restart();
        
        console.log('Force simulation restarted gently');
    }
}