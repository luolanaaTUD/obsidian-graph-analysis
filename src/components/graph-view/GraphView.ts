import { App, Notice, TFile } from 'obsidian';
import * as d3 from 'd3';
import { GraphNode, GraphLink, CentralityCalculator } from './types';
import { CentralityCalculator as CentralityCalculatorImpl } from './data/centrality';
import { GraphDataBuilder } from './data/graph-builder';

// Extend D3's simulation node type with our properties
interface SimulationGraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
    degree?: number;
}

// Define the link type for D3 simulation
interface SimulationGraphLink {
    source: string | SimulationGraphNode;
    target: string | SimulationGraphNode;
    value?: number;
}

// Define the type for cached node neighbors
interface NodeNeighborsCache {
    nodeId: string; // ID of the node whose neighbors are cached
    neighbors: Set<string>; // Set of neighbor node IDs
}

// Type guard to check if a node is our SimulationGraphNode
function isSimulationGraphNode(node: d3.SimulationNodeDatum): node is SimulationGraphNode {
    return 'id' in node && 'name' in node;
}

/**
 * A simplified graph view implementation based on the D3 example
 * This version consolidates functionality into a single class for better maintainability
 */
export class GraphView {
    private app: App;
    private container: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private nodes: SimulationGraphNode[] = [];
    private links: SimulationGraphLink[] = [];
    private width: number = 800;
    private height: number = 600;
    
    // Core components
    private graphDataBuilder: GraphDataBuilder;
    private centralityCalculator: CentralityCalculatorImpl;
    
    // D3 selections
    private nodesSelection: d3.Selection<SVGCircleElement, SimulationGraphNode, d3.BaseType, unknown>;
    private linksSelection: d3.Selection<SVGLineElement, SimulationGraphLink, d3.BaseType, unknown>;
    private labelsSelection: d3.Selection<SVGTextElement, SimulationGraphNode, d3.BaseType, unknown>;
    
    // Force simulation
    private simulation: d3.Simulation<SimulationGraphNode, SimulationGraphLink>;
    
    // UI elements
    private loadingIndicator: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private visibilityObserver: IntersectionObserver | null = null;
    private lastVisibilityChange: number = 0;
    private wasInvisible: boolean = false;
    
    // Animation frame request reference
    private _frameRequest: number | null = null;
    private highlightedNodeId: string | null = null;
    private _tooltipTimeout: number | null = null;
    private isDraggingNode: boolean = false;
    
    // Neighbors cache to avoid repeated WASM calls
    private nodeNeighborsCache: NodeNeighborsCache | null = null;
    
    // Highlight state constants to ensure consistency
    private readonly HIGHLIGHT_STATES = {
        NONE: 'none',
        HOVER: 'hover',
        DRAG: 'drag'
    } as const;
    
    // Add these constants at the class level after the private member declarations
    private readonly ANIMATION_DURATION = 200;
    private readonly HOVER_ANIMATION_DURATION = 200; 
    private readonly TOOLTIP_DELAY = 500;
    private readonly RECENTER_ANIMATION_DURATION = 300;

    // Add this property at the class level after the private readonly constants section
    private currentTooltip: HTMLElement | null = null;

    // Radius sizing constants
    private readonly BASE_NODE_RADIUS = 4; // Minimum size for nodes
    private readonly MAX_NODE_RADIUS = 12; // Maximum size for nodes with highest centrality
    private readonly NODE_RADIUS_SCALE_FACTOR = 0.69; // How much to scale by centrality (0-1)
    
    // Zoom behavior tuning constants
    private readonly ZOOM_OUT_SCALE_FACTOR = 600; // Higher = allows zooming out further
    private readonly ZOOM_IN_SCALE_FACTOR = 60;   // Lower = allows zooming in closer

    // Constants for tooltip positioning
    private readonly TOOLTIP_OFFSET_X = 20; // Fixed distance from node to tooltip
    private readonly TOOLTIP_OFFSET_Y = 0;  // Vertical offset (0 = centered)
    private readonly TOOLTIP_MARGIN = 15;   // Minimum margin from container edges

    constructor(app: App, calculateDegreeCentrality?: CentralityCalculator) {
        this.app = app;
        
        // Initialize core modules
        this.centralityCalculator = new CentralityCalculatorImpl(calculateDegreeCentrality);
        this.graphDataBuilder = new GraphDataBuilder(app);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Set up the visualization
        this.initializeD3();
        
        // Setup visibility detection
        this.setupVisibilityObserver();
        
        // Load vault data
        this.showLoadingIndicator();
        try {
            await this.loadVaultData();
        } catch (error) {
            console.error('Error loading vault data:', error);
            new Notice(`Error loading graph data: ${(error as Error).message}`);
        } finally {
            this.hideLoadingIndicator();
        }
    }

    private initializeD3() {
        // Get container dimensions
        this.updateDimensions();
        
        // Create SVG container with centered viewBox like the D3 example
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')  // Ensure SVG fills container width
            .attr('height', '100%') // Ensure SVG fills container height
            .attr('viewBox', [-this.width / 2, -this.height / 2, this.width, this.height])
            .style('display', 'block')
            .style('max-width', 'none') // Remove max-width constraints
            .style('max-height', 'none') // Remove max-height constraints
            .attr('class', 'graph-view-svg');
        
        // In the D3 example, SVG uses a viewBox centered at origin, so our group doesn't need translation
        this.svgGroup = this.svg.append('g');
        
        // Create groups for links, labels, and nodes with explicit rendering order
        const linksGroup = this.svgGroup.append('g')
            .attr('stroke', 'var(--graph-link-default)')
            .attr('stroke-opacity', 0.6)
            .attr('class', 'links-group');
            
        const labelsGroup = this.svgGroup.append('g')
            .attr('class', 'labels-group');
            
        const nodesGroup = this.svgGroup.append('g')
            .attr('stroke', 'var(--graph-node-stroke)')
            .attr('stroke-width', 1.5)
            .attr('class', 'nodes-group');

        // Initialize selections
        this.linksSelection = linksGroup.selectAll('line');
        this.labelsSelection = labelsGroup.selectAll('text');
        this.nodesSelection = nodesGroup.selectAll('circle');
        
        // Initialize force simulation
        this.initializeSimulation();
        
        // Add zoom behavior
        this.setupZoomBehavior();
        
        // Handle resize with ResizeObserver
        this.setupResizeObserver();
    }
    
    /**
     * Calculate dynamic zoom limits based on screen size and node radius
     * Centralized method to ensure consistent limits across the application
     */
    private calculateZoomLimits(): [number, number] {
        if (!this.nodes || this.nodes.length === 0) {
            // Default values when no nodes are available
            const defaultRadius = this.BASE_NODE_RADIUS;
            const minZoom = this.width / (defaultRadius * this.ZOOM_OUT_SCALE_FACTOR);
            const maxZoom = this.width / (defaultRadius * this.ZOOM_IN_SCALE_FACTOR);
            return [minZoom, maxZoom];
        }
        
        // Calculate statistics for node sizes in the current graph
        let maxRadius = 0;
        let totalRadius = 0;
        let nodeCount = 0;
        
        this.nodes.forEach(node => {
            const radius = this.getNodeRadius(node);
            maxRadius = Math.max(maxRadius, radius);
            totalRadius += radius;
            nodeCount++;
        });
        
        // Use average node radius for min zoom (to see entire graph)
        const avgRadius = nodeCount > 0 ? totalRadius / nodeCount : this.BASE_NODE_RADIUS;
        // Use max node radius for max zoom (to prevent largest nodes from getting too big)
        const largestRadius = maxRadius > 0 ? maxRadius : this.BASE_NODE_RADIUS;
        
        // Calculate zoom limits based on these statistics
        const minZoom = this.width / (avgRadius * this.ZOOM_OUT_SCALE_FACTOR);
        const maxZoom = this.width / (largestRadius * this.ZOOM_IN_SCALE_FACTOR);
        
        return [minZoom, maxZoom];
    }

    private setupZoomBehavior() {
        // Add zoom behavior with dynamic limits
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent(this.calculateZoomLimits())
            .on('start', () => {
                if (this._frameRequest) {
                    window.cancelAnimationFrame(this._frameRequest);
                    this._frameRequest = null;
                }
                if (this.simulation) {
                    this.simulation.alphaTarget(0);
                }
                this.removeNodeTooltip();
            })
            .on('zoom', (event) => {
                // With a centered viewBox, we can directly apply the transform to our group
                this.svgGroup.attr('transform', event.transform);
            })
            .on('end', () => {
                this.restartSimulationGently();
            });
            
        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Initial transform to show the entire graph
        this.recenterGraph();
    }

    private initializeSimulation() {
        // Create a simulation with modified forces to better fill the available space
        // Use a constant node radius for collision detection to avoid multiple function calls
        const collisionRadius = this.getNodeRadius() + 2; // Same buffer as before
        
        this.simulation = d3.forceSimulation<SimulationGraphNode>()
            .force('link', d3.forceLink<SimulationGraphNode, SimulationGraphLink>().id(d => d.id).distance(50)) // Increase link distance
            .force('charge', d3.forceManyBody().strength(-120)) // Stronger repulsion for more spread
            .force('x', d3.forceX().strength(0.1)) // Weaker center force for more natural layout
            .force('y', d3.forceY().strength(0.1)) // Weaker center force for more natural layout
            // Add built-in collision detection with quadtree optimization
            .force('collision', d3.forceCollide<SimulationGraphNode>()
                .radius(d => collisionRadius) // Use the constant collision radius
                .strength(0.8) // Slightly softer than full collision (1.0) for more natural movement
                .iterations(2)) // More iterations = more accurate but more computationally expensive
            .alphaDecay(0.0228) // Default D3 value for smoother transitions
            .velocityDecay(0.4) // Slightly higher than D3 default (0.4 vs 0.3) for more stability
            .on('tick', () => {
                // Apply only the custom bounding force
                this.applyBoundingForce();
                
                // Use requestAnimationFrame to throttle render updates
                if (!this._frameRequest) {
                    this._frameRequest = window.requestAnimationFrame(() => {
                        this.updateGraph();
                        this._frameRequest = null;
                    });
                }
            });
    }
    
    /**
     * Apply a bounding force to ensure nodes stay within a reasonable area
     */
    private applyBoundingForce() {
        const bound = 1000; // Boundary size
        const strength = 0.05; // Force strength
        
        for (let node of this.nodes) {
            const x = node.x || 0;
            const y = node.y || 0;
            
            // Apply force toward center when nodes go beyond boundaries
            if (Math.abs(x) > bound) {
                node.vx = (node.vx || 0) - (x > 0 ? strength : -strength);
            }
            
            if (Math.abs(y) > bound) {
                node.vy = (node.vy || 0) - (y > 0 ? strength : -strength);
            }
        }
    }
    
    private updateGraph() {
        // Cache selection references for performance
        const linksSelection = this.linksSelection;
        const nodesSelection = this.nodesSelection;
        const labelsSelection = this.labelsSelection;
        
        // Safety check - if selections don't exist, exit early
        if (!linksSelection || !nodesSelection || !labelsSelection) return;
        
        // Update link positions
        linksSelection
            .attr('x1', d => (d.source as unknown as SimulationGraphNode).x || 0)
            .attr('y1', d => (d.source as unknown as SimulationGraphNode).y || 0)
            .attr('x2', d => (d.target as unknown as SimulationGraphNode).x || 0)
            .attr('y2', d => (d.target as unknown as SimulationGraphNode).y || 0);
            
        // Update node positions
        nodesSelection
            .attr('cx', d => d.x || 0)
            .attr('cy', d => d.y || 0);
            
        // Update label positions
        labelsSelection
            .attr('x', d => d.x || 0)
            .attr('y', d => d.y || 0);
    }
    
    private updateDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 800;
        this.height = rect.height || 600;
        
        // Update zoom limits when dimensions change
        if (this.zoom) {
            this.zoom.scaleExtent(this.calculateZoomLimits());
        }
    }
    
    private setupResizeObserver() {
        // Clean up any existing observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        // Create a new ResizeObserver with debouncing
        let resizeTimeout: number | null = null;
        
        this.resizeObserver = new ResizeObserver((entries) => {
            const containerEntry = entries.find(entry => entry.target === this.container);
            if (!containerEntry) return;
            
            // Clear any existing timeout to debounce resize events
            if (resizeTimeout) {
                window.clearTimeout(resizeTimeout);
            }
            
            // Set a new timeout to handle the resize after a brief delay
            // This prevents too many recalculations during active resizing
            resizeTimeout = window.setTimeout(() => {
                // Update dimensions
                this.updateDimensions();
                
                // Update SVG viewBox to keep it centered at origin and fill the container
                this.svg.attr('viewBox', [-this.width / 2, -this.height / 2, this.width, this.height]);
                
                // Update zoom behavior with new limits
                const transform = d3.zoomTransform(this.svg.node() as Element);
                this.svg.call(this.zoom.transform, transform);
                
                // Recenter the graph with animation to ensure it fills the available space
                this.recenterGraph();
                
                resizeTimeout = null;
            }, 100); // Small delay to debounce rapid resize events
        });
        
        // Start observing the container
        this.resizeObserver.observe(this.container);
    }
    
    private setupNodeEventHandlers() {
        // Add hover and click interactivity
        this.nodesSelection
            .on('mouseover', this.onNodeMouseOver.bind(this))
            .on('mouseout', this.onNodeMouseOut.bind(this))
            .on('click', this.onNodeClick.bind(this));
    }
    
    private onNodeMouseOver(event: any, d: SimulationGraphNode) {
        // Set the highlighted node ID
        this.highlightedNodeId = d.id;
        
        // Highlight the node visually
        this.highlightNode(event.currentTarget, true);
        
        // Highlight connections
        this.highlightConnections(d.id, true);
        
        // Handle tooltip with delay
        this.scheduleTooltip(d, event);
    }
    
    private onNodeMouseOut(event: any, d: SimulationGraphNode) {
        // Don't remove highlights if we're dragging this node
        if (this.isDraggingNode && this.highlightedNodeId === d.id) {
            return;
        }
        
        // Remove visual highlight
        this.highlightNode(event.currentTarget, false);
        
        // Remove connections highlight
        this.highlightConnections(d.id, false);
        
        // Clean up tooltip
        this.clearTooltipTimeout();
        this.highlightedNodeId = null;
        this.removeNodeTooltip();
        
        // We don't need to clear the neighbors cache here
        // It will be overwritten when we interact with another node
        // And must be cleared only when the graph data changes
    }
    
    private onNodeClick(event: any, d: SimulationGraphNode) {
        event.stopPropagation();
        
        // Open the note when clicked
        if (d.path) {
            const file = this.app.vault.getAbstractFileByPath(d.path);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf(false).openFile(file);
            }
        }
    }
    
    private removeNodeTooltip() {
        // Remove any existing tooltip using our cached reference
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }
    
    private showNodeTooltip(node: SimulationGraphNode, event: any) {
        // Remove any existing tooltip
        this.removeNodeTooltip();
        
        // Create tooltip
        const tooltip = this.container.createDiv({ cls: 'graph-node-tooltip' });
        this.currentTooltip = tooltip;
        
        // Add content to tooltip
        tooltip.createEl('h3', { text: node.name });
        
        // Add metadata if available
        const metadataContainer = tooltip.createDiv({ cls: 'tooltip-metadata' });
        
        // Display degree centrality if available
        if (node.degree !== undefined) {
            const field = metadataContainer.createDiv({ cls: 'tooltip-field' });
            field.createSpan({ cls: 'tooltip-label', text: 'Connections:' });
            field.createSpan({ cls: 'tooltip-value', text: node.degree.toString() });
        }
        
        // Add centrality score if available
        if (node.centralityScore !== undefined) {
            const field = metadataContainer.createDiv({ cls: 'tooltip-field' });
            field.createSpan({ cls: 'tooltip-label', text: 'Centrality:' });
            field.createSpan({ cls: 'tooltip-value', text: node.centralityScore.toFixed(3) });
        }
        
        // Placeholder for proper tooltip positioning
        // Temporarily position in the middle of the container
        const containerRect = this.container.getBoundingClientRect();
        tooltip.style.left = `${containerRect.width / 2}px`;
        tooltip.style.top = `${containerRect.height / 2}px`;
    }

    /**
     * Position the tooltip at a fixed distance from the node
     */
    private positionTooltip(
        tooltip: HTMLElement, 
        nodeX: number, 
        nodeY: number, 
        nodeRadius: number, 
        containerRect: DOMRect
    ): void {
        // This method is kept as a stub but not used
        // The user will implement their own tooltip positioning solution
    }
    
    private highlightConnections(nodeId: string, highlight: boolean) {
        if (!highlight) {
            this.resetHighlights();
            return;
        }
        
        // Store animation duration in a local variable to use in callbacks
        const animationDuration = this.ANIMATION_DURATION;
        
        // Find connected nodes
        let connectedNodeIds = new Set<string>();
        
        // Check if we have a valid cache for this node
        const cacheValid = this.nodeNeighborsCache && 
                           this.nodeNeighborsCache.nodeId === nodeId;
        
        // If we're in a drag operation or we have a valid cache, use the cached data
        if ((this.isDraggingNode && this.highlightedNodeId === nodeId) || cacheValid) {
            if (this.nodeNeighborsCache) {
                connectedNodeIds = this.nodeNeighborsCache.neighbors;
                
                // Only log in development mode or when debug is enabled
                if (process.env.NODE_ENV === 'development') {
                    console.log(`Using cached neighbors (${connectedNodeIds.size}) for node ${nodeId}`);
                }
            }
        } else {
            // No cache hit, need to get data from WASM
            try {
                const nodeIdInt = parseInt(nodeId);
                const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
                
                if (!plugin || !plugin.getNodeNeighborsCached) {
                    console.error('WASM functions are not available. Make sure the plugin is properly initialized.');
                    throw new Error('WASM functions not available');
                }
                
                // Use the WASM cached implementation
                const neighborResult = plugin.getNodeNeighborsCached(nodeIdInt);
                
                // Extract neighbor IDs from the result
                if (neighborResult && neighborResult.neighbors) {
                    neighborResult.neighbors.forEach((neighbor: { node_id: number }) => {
                        connectedNodeIds.add(neighbor.node_id.toString());
                    });
                    
                    // Only log in development mode or when debug is enabled
                    if (process.env.NODE_ENV === 'development') {
                        console.log(`Retrieved ${connectedNodeIds.size} neighbors from WASM cache for node ${nodeId}`);
                    }
                    
                    // Update the cache with the new data
                    this.nodeNeighborsCache = {
                        nodeId: nodeId,
                        neighbors: connectedNodeIds
                    };
                } else if (neighborResult && neighborResult.error) {
                    // If there's an error message in the result, handle it
                    console.error(`Error from WASM neighbor function: ${neighborResult.error}`);
                    throw new Error(neighborResult.error);
                } else {
                    // If no neighbor data and no error, it's an unexpected result format
                    console.error('Unexpected result format from WASM neighbor function', neighborResult);
                    throw new Error('Unexpected result format from WASM');
                }
            } catch (error) {
                // Log the error and initialize/refresh the graph cache as a recovery attempt
                console.error('Error in highlightConnections with WASM:', error);
                
                // Clear the cache on error
                this.nodeNeighborsCache = null;
                
                // Attempt to reinitialize the graph cache with current data
                try {
                    const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
                    if (plugin && plugin.initializeGraphCache) {
                        // Format the graph data for WASM
                        const wasmGraphData = {
                            nodes: this.nodes.map(node => node.name),
                            edges: this.links.map(link => {
                                const source = typeof link.source === 'string' ? parseInt(link.source) : parseInt((link.source as unknown as SimulationGraphNode).id);
                                const target = typeof link.target === 'string' ? parseInt(link.target) : parseInt((link.target as unknown as SimulationGraphNode).id);
                                return [source, target];
                            })
                        };
                        
                        // Reinitialize the graph in WASM
                        plugin.initializeGraphCache(JSON.stringify(wasmGraphData))
                            .then(() => {
                                console.log('Graph cache reinitialized after error');
                                // Retry the highlight operation after reinitialization
                                this.highlightConnections(nodeId, highlight);
                                return;
                            })
                            .catch((reinitError: any) => {
                                console.error('Failed to reinitialize graph cache:', reinitError);
                            });
                    }
                } catch (reinitError) {
                    console.error('Error attempting to reinitialize graph cache:', reinitError);
                }
                
                // Since we're returning early after attempting reinitialization,
                // we don't proceed with any fallback or highlighting updates
                return;
            }
        }
        
        // Dim all nodes and links not connected
        this.nodesSelection.each(function(d) {
            const isConnected = d.id === nodeId || connectedNodeIds.has(d.id);
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .attr('opacity', isConnected ? 1 : 0.3);
        });
        
        this.linksSelection.each(function(d) {
            const sourceId = typeof d.source === 'string' ? d.source : (d.source as unknown as SimulationGraphNode).id;
            const targetId = typeof d.target === 'string' ? d.target : (d.target as unknown as SimulationGraphNode).id;
            const isConnected = sourceId === nodeId || targetId === nodeId;
            
            // Get base width
            const baseWidth = d.value ? Math.sqrt(d.value) : 1;
            
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .attr('stroke-opacity', isConnected ? 1 : 0.2)
                .attr('stroke-width', isConnected ? baseWidth * 1.5 : baseWidth)
                .attr('stroke', isConnected ? 'var(--graph-link-highlighted)' : 'var(--graph-link-default)');
        });
        
        // Also dim unconnected labels
        this.labelsSelection.each(function(d) {
            const isConnected = d.id === nodeId || connectedNodeIds.has(d.id);
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .attr('opacity', isConnected ? 1 : 0.2);
        });
    }
    
    private resetHighlights() {
        // Clear the neighbors cache when resetting highlights
        this.nodeNeighborsCache = null;
        
        // Store animation duration in a local variable for consistency with other methods
        const animationDuration = this.ANIMATION_DURATION;
        
        // Reset all nodes, links, and labels to default state
        this.nodesSelection
            .transition()
            .duration(animationDuration)
            .attr('opacity', 1)
            .attr('fill', 'var(--graph-node-default)');
            
        // Reset links to default style
        this.linksSelection
            .transition()
            .duration(animationDuration)
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', d => d.value ? Math.sqrt(d.value) : 1)
            .attr('stroke', 'var(--graph-link-default)');
            
        this.labelsSelection
            .transition()
            .duration(animationDuration)
            .attr('opacity', d => d.degree && d.degree > 3 ? 0.8 : 0.6);
    }
    
    private setupDragBehavior() {
        return d3.drag<SVGCircleElement, SimulationGraphNode>()
            .on('start', (event, d) => {
                try {
                    // Stop any animation frames during drag to prevent jitter
                    if (this._frameRequest) {
                        window.cancelAnimationFrame(this._frameRequest);
                        this._frameRequest = null;
                    }
                    
                    // Update simulation if it exists
                    if (this.simulation && !event.active) {
                        this.simulation.alphaTarget(0.3).restart();
                    }
                    
                    // Set fixed position
                    d.fx = d.x;
                    d.fy = d.y;
                    
                    // Set drag state
                    this.isDraggingNode = true;
                    
                    // Apply node highlighting if not already highlighted
                    if (this.highlightedNodeId !== d.id) {
                        this.highlightNode(event.sourceEvent.currentTarget, true);
                        this.highlightConnections(d.id, true);
                        this.highlightedNodeId = d.id;
                    }
                } catch (e) {
                    console.error("Error in drag start:", e);
                }
            })
            .on('drag', (event, d) => {
                try {
                    d.fx = event.x;
                    d.fy = event.y;
                } catch (e) {
                    console.error("Error in drag:", e);
                }
            })
            .on('end', (event, d) => {
                try {
                    // Update simulation if it exists
                    if (this.simulation && !event.active) {
                        this.simulation.alphaTarget(0);
                    }
                    
                    // Clear fixed position
                    d.fx = null;
                    d.fy = null;
                    
                    // Reset drag state
                    this.isDraggingNode = false;
                    
                    // We keep both the highlight and the cache when drag ends
                    // The cache will be overwritten when we interact with another node
                    // The highlight will be cleared when the mouse leaves the node
                    
                    // Note: We intentionally don't clear highlights here to match hover behavior
                    // The highlight will only be cleared when the mouse leaves the node
                } catch (e) {
                    console.error("Error in drag end:", e);
                }
            });
    }
    
    /**
     * Apply or remove visual highlighting from a node element
     */
    private highlightNode(element: SVGCircleElement, highlight: boolean) {
        const node = d3.select(element);
        const nodeData = node.datum() as SimulationGraphNode;
        
        node.transition()
            .duration(this.HOVER_ANIMATION_DURATION)
            .attr('stroke-width', highlight ? 2 : 1.5)
            .attr('fill', highlight ? 'var(--graph-node-hover)' : this.getNodeColor(nodeData));
    }
    
    /**
     * Schedule tooltip display after delay
     */
    private scheduleTooltip(node: SimulationGraphNode, event: any) {
        // Clear any existing tooltip timeout
        this.clearTooltipTimeout();
        
        // If no node is highlighted or a different node is highlighted, don't schedule
        if (this.highlightedNodeId !== node.id) return;
        
        // Show tooltip after a delay
        this._tooltipTimeout = window.setTimeout(() => {
            // Double-check that the node is still highlighted when the timeout fires
            if (this.highlightedNodeId === node.id) {
                this.showNodeTooltip(node, event);
            }
            this._tooltipTimeout = null;
        }, this.TOOLTIP_DELAY);
    }
    
    /**
     * Clear tooltip timeout if it exists
     */
    private clearTooltipTimeout() {
        if (this._tooltipTimeout) {
            window.clearTimeout(this._tooltipTimeout);
            this._tooltipTimeout = null;
        }
    }
    
    private async loadVaultData() {
        try {
            // Get graph data from builder
            const graphData = await this.graphDataBuilder.buildGraphData();
            
            // Convert edges to links format
            const nodes: SimulationGraphNode[] = graphData.nodes.map((nodePath: string, index: number) => {
                const fileName = nodePath.split('/').pop() || nodePath;
                const displayName = fileName.replace('.md', '');
                return {
                    id: index.toString(),
                    name: displayName,
                    path: nodePath,
                    centralityScore: 0, // Will be updated by centrality calculation
                    degree: 0 // Will be updated by centrality calculation
                };
            });
            
            const links: SimulationGraphLink[] = graphData.edges.map(([sourceIdx, targetIdx]: [number, number]) => ({
                source: sourceIdx.toString(),
                target: targetIdx.toString()
            }));
            
            // Calculate centrality scores
            const centralityResults = this.centralityCalculator.calculate({ nodes: graphData.nodes, edges: graphData.edges });
            
            // Update node centrality scores
            nodes.forEach(node => {
                const centralityResult = centralityResults.find((r: { node_id: number; score: number }) => r.node_id === parseInt(node.id));
                if (centralityResult) {
                    node.centralityScore = centralityResult.score;
                    node.degree = centralityResult.score; // Using centrality score as degree for now
                }
            });
            
            // Update the graph with the processed data
            await this.updateData({ nodes, links });
        } catch (error) {
            console.error('Error in loadVaultData:', error);
            throw error;
        }
    }
    
    public async updateData(graphData: { nodes: SimulationGraphNode[], links: SimulationGraphLink[] }) {
        // Store the data
        this.nodes = graphData.nodes || [];
        this.links = graphData.links || [];
        
        // Clear any existing neighbors cache as the graph data has changed
        this.nodeNeighborsCache = null;
        
        // Initialize the graph cache in WASM with current graph data
        try {
            // Format the graph data for WASM
            const wasmGraphData = {
                nodes: this.nodes.map(node => node.name),
                edges: this.links.map(link => {
                    const source = typeof link.source === 'string' ? parseInt(link.source) : parseInt((link.source as unknown as SimulationGraphNode).id);
                    const target = typeof link.target === 'string' ? parseInt(link.target) : parseInt((link.target as unknown as SimulationGraphNode).id);
                    return [source, target];
                })
            };
            
            // Initialize the graph in WASM
            const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
            if (!plugin || !plugin.initializeGraphCache) {
                throw new Error('WASM functions are not available. Make sure the plugin is properly initialized.');
            }
            
            const result = await plugin.initializeGraphCache(JSON.stringify(wasmGraphData));
            
            if (result && result.error) {
                console.error(`Error initializing graph cache in WASM: ${result.error}`);
                throw new Error(`Failed to initialize graph cache: ${result.error}`);
            }
            
            if (process.env.NODE_ENV === 'development') {
                console.log('Graph cache initialized in WASM');
            }
        } catch (error) {
            console.error('Failed to initialize graph cache:', error);
            
            // Throw the error to indicate initialization failure
            // This is critical for graph functionality, so we want to make it clear there's an issue
            new Notice(`Graph initialization failed: ${(error as Error).message || 'Unknown error'}`);
            
            // Don't throw here to allow the UI to render even with reduced functionality
            // Instead, we'll gracefully proceed but log the error
        }
        
        // Create D3 selections for the graph elements
        // Links first to ensure they're behind nodes
        this.linksSelection = this.svgGroup.select('.links-group')
            .selectAll<SVGLineElement, SimulationGraphLink>('line')
            .data(this.links, d => `${d.source}-${d.target}`)
            .join(
                enter => enter.append('line')
                    .attr('stroke-width', d => d.value ? Math.sqrt(d.value) : 1)
                    .attr('stroke-opacity', 0.6)
                    .attr('stroke', 'var(--graph-link-default)')
                    .attr('class', 'graph-link'),
                update => update,
                exit => exit.remove()
            );
        
        // Add nodes
        this.nodesSelection = this.svgGroup.select('.nodes-group')
            .selectAll<SVGCircleElement, SimulationGraphNode>('circle')
            .data(this.nodes, d => d.id)
            .join(
                enter => {
                    // Create the node elements
                    const nodeEnter = enter.append('circle')
                        .attr('r', d => this.getNodeRadius(d))
                        .attr('fill', d => this.getNodeColor(d))
                        .attr('class', 'graph-node')
                        .call(this.setupDragBehavior());
                    
                    // Add title elements separately like in D3 example
                    nodeEnter.append('title')
                        .text(d => d.name);
                    
                    return nodeEnter;
                },
                update => update,
                exit => exit.remove()
            );
        
        // Add labels with improved visibility - but keep minimal for performance
        this.labelsSelection = this.svgGroup.select('.labels-group')
            .selectAll<SVGTextElement, SimulationGraphNode>('text')
            .data(this.nodes.filter(d => d.degree && d.degree > 2), d => d.id) // Only label nodes with higher degree
            .join(
                enter => enter.append('text')
                    .attr('dy', d => this.getNodeRadius(d) + 15)
                    .attr('text-anchor', 'middle')
                    .attr('fill', 'var(--text-normal)')
                    .attr('font-size', 'var(--font-ui-smaller)')
                    .attr('opacity', 'var(--graph-label-opacity, 0.7)')
                    .attr('pointer-events', 'none') // Prevent labels from interfering with interactions
                    .attr('class', 'graph-label')
                    .text(d => d.name),
                update => update,
                exit => exit.remove()
            );
            
        // Setup event handlers
        this.setupNodeEventHandlers();
            
        // Update simulation with new data
        if (this.simulation) {
            this.simulation.nodes(this.nodes);
            const linkForce = this.simulation.force('link') as d3.ForceLink<SimulationGraphNode, SimulationGraphLink>;
            if (linkForce) {
                linkForce.links(this.links);
            }
            
            // Restart the simulation
            this.simulation.alpha(1).restart();
        }
    }
    
    /**
     * Calculate node radius based on centrality and other factors
     */
    private getNodeRadius(node?: SimulationGraphNode | null): number {
        if (!node) {
            return this.BASE_NODE_RADIUS;
        }
        
        // Scale node size based on centrality or degree
        if (node.centralityScore !== undefined && node.centralityScore > 0) {
            // Find a normalized value between 0 and 1 for the centrality score
            // We'd need to know the max centrality across all nodes for perfect normalization
            // As a simple approach, cap at 1.0 and ensure positive values
            const normalizedScore = Math.min(1.0, Math.max(0, node.centralityScore));
            
            // Scale the node radius between BASE_NODE_RADIUS and MAX_NODE_RADIUS
            // Linear scaling: radius = base + (max-base) * normalized * scale_factor
            return this.BASE_NODE_RADIUS + 
                   (this.MAX_NODE_RADIUS - this.BASE_NODE_RADIUS) * 
                   normalizedScore * this.NODE_RADIUS_SCALE_FACTOR;
        }
        
        // Default size if no centrality data available
        return this.BASE_NODE_RADIUS;
    }
    
    private getNodeColor(node: SimulationGraphNode): string {
        // Use the CSS variable for consistent theming across light/dark modes
        return 'var(--graph-node-default)';
    }
    
    /**
     * Get the color for links based on CSS variables for consistent theming
     */
    private getLinkColor(): string {
        // Use the CSS variable for consistent theming across light/dark modes
        return 'var(--graph-link-default)';
    }
    
    public refreshGraphView(): void {
        this.updateDimensions();
        this.recenterGraph();
    }
    
    public recenterGraph(): void {
        // Find the bounds of all nodes
        if (this.nodes.length === 0) return;
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            if (node.x === undefined || node.y === undefined) return;
            const radius = this.getNodeRadius(node);
            
            minX = Math.min(minX, node.x - radius);
            minY = Math.min(minY, node.y - radius);
            maxX = Math.max(maxX, node.x + radius);
            maxY = Math.max(maxY, node.y + radius);
        });
        
        // Only proceed if we have valid bounds
        if (minX === Infinity || minY === Infinity) return;
        
        // Calculate width and height of the graph
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // instead of using fixed margins
        const containerScale = 0.6; // The graph should use 70% of the minimum dimension
        const minDimension = Math.min(this.width, this.height);
        const scaleX = (containerScale * minDimension) / graphWidth;
        const scaleY = (containerScale * minDimension) / graphHeight;
        
        // Use the smallest scale to ensure everything fits
        // Prevent scaling below 0.3 to avoid negative or too small values
        const minScale = 0.3;
        let scale = Math.min(scaleX, scaleY);
        if (scale < minScale) {
            scale = minScale;
        }
        
        // Calculate center point of the graph
        const centerX = minX + graphWidth / 2;
        const centerY = minY + graphHeight / 2;
        
        // Apply the transform with transition
        // With a centered viewBox, we need to transform to bring the graph center to the origin
        const transform = d3.zoomIdentity
            .translate(-centerX * scale, -centerY * scale)
            .scale(scale);
        
        this.svg.transition()
            .duration(this.RECENTER_ANIMATION_DURATION)
            .call(this.zoom.transform, transform);
    }
    
    public restartSimulationGently(): void {
        try {
            if (this.simulation) {
                // Use a lower alpha value for gentler restart with our optimized decay settings
                this.simulation.alpha(0.1).restart();
            }
        } catch (e) {
            console.error("Error restarting simulation:", e);
        }
    }
    
    private setupVisibilityObserver() {
        // Clean up any existing observer
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
        }
        
        // Create a new IntersectionObserver
        this.visibilityObserver = new IntersectionObserver(
            (entries) => {
                const now = performance.now();
                
                // Check if the graph view became visible
                const entry = entries[0];
                if (entry.isIntersecting && this.wasInvisible) {
                    // Only recenter if it's been a significant time since the last visibility change
                    // This prevents unnecessary recentering during quick tab switches
                    if (now - this.lastVisibilityChange > 1000) {
                        this.recenterGraph();
                        this.restartSimulationGently();
                    }
                    this.wasInvisible = false;
                } else if (!entry.isIntersecting) {
                    this.wasInvisible = true;
                }
                
                this.lastVisibilityChange = now;
            },
            { threshold: 0.1 } // Trigger when at least 10% is visible
        );
        
        // Start observing the container
        this.visibilityObserver.observe(this.container);
    }
    
    private showLoadingIndicator() {
        this.loadingIndicator = this.container.createDiv({ cls: 'graph-loading-indicator' });
        this.loadingIndicator.setText('Loading graph data...');
        return this.loadingIndicator;
    }
    
    private hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
    }
    
    public onunload() {
        // Cancel any pending timers or animation frames
        if (this._frameRequest) {
            window.cancelAnimationFrame(this._frameRequest);
            this._frameRequest = null;
        }
        
        if (this._tooltipTimeout) {
            window.clearTimeout(this._tooltipTimeout);
            this._tooltipTimeout = null;
        }
        
        // Clean up UI elements
        this.removeNodeTooltip();
        
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
        
        // Clear data caches
        this.nodeNeighborsCache = null;
        this.nodes = [];
        this.links = [];
        
        // Stop and clean up D3 simulation
        if (this.simulation) {
            this.simulation.stop();
            // Remove all forces in one block
            ['link', 'charge', 'x', 'y', 'collision'].forEach(force => 
                this.simulation.force(force, null)
            );
            // Clear node references
            this.simulation.nodes([]);
            // @ts-ignore - explicitly break circular references
            this.simulation = null;
        }
        
        // Clean up observers
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
            this.visibilityObserver = null;
        }
        
        // Clear the graph cache in WASM
        try {
            const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
            if (plugin && plugin.clearGraphCache) {
                plugin.clearGraphCache();
                console.log('Graph cache cleared from WASM');
            }
        } catch (error) {
            console.error('Error clearing graph cache:', error);
        }
        
        // Clean up D3 selections and SVG
        if (this.nodesSelection) {
            this.nodesSelection.on('mouseover', null).on('mouseout', null).on('click', null);
        }
        
        if (this.svg) {
            // Remove event listeners
            this.svg.on('.zoom', null);
            
            // Remove all elements and clear selections in one operation
            this.svg.selectAll('*').remove();
            this.svg.remove();
            
            // Clear selection references
            // @ts-ignore - explicitly break circular references
            this.svgGroup = null;
            // @ts-ignore - explicitly break circular references
            this.zoom = null;
            // @ts-ignore - we're intentionally clearing the selections
            this.nodesSelection = undefined;
            // @ts-ignore - we're intentionally clearing the selections
            this.linksSelection = undefined;
            // @ts-ignore - we're intentionally clearing the selections
            this.labelsSelection = undefined;
            // @ts-ignore - explicitly break circular references
            this.svg = null;
        }
        
        // Clear remaining references
        // @ts-ignore - explicitly break circular references
        this.container = null;
        // @ts-ignore - explicitly break circular references
        this.graphDataBuilder = null;
        // @ts-ignore - explicitly break circular references
        this.centralityCalculator = null;
        // @ts-ignore - explicitly break circular references
        this.app = null;
    }
} 