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
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .attr('class', 'links-group');
            
        const labelsGroup = this.svgGroup.append('g')
            .attr('class', 'labels-group');
            
        const nodesGroup = this.svgGroup.append('g')
            .attr('stroke', '#fff')
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
    
    private setupZoomBehavior() {
        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 10]) // Wider zoom range for better flexibility
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
        this.simulation = d3.forceSimulation<SimulationGraphNode>()
            .force('link', d3.forceLink<SimulationGraphNode, SimulationGraphLink>().id(d => d.id).distance(50)) // Increase link distance
            .force('charge', d3.forceManyBody().strength(-120)) // Stronger repulsion for more spread
            .force('x', d3.forceX().strength(0.1)) // Weaker center force for more natural layout
            .force('y', d3.forceY().strength(0.1)) // Weaker center force for more natural layout
            // Add built-in collision detection with quadtree optimization
            .force('collision', d3.forceCollide<SimulationGraphNode>()
                .radius(d => this.getNodeRadius() + 2) // Same buffer as our custom implementation
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
        // Safety check
        if (!this.linksSelection || !this.nodesSelection || !this.labelsSelection) return;
        
        // Update link positions
        this.linksSelection
            .attr('x1', d => (d.source as unknown as SimulationGraphNode).x || 0)
            .attr('y1', d => (d.source as unknown as SimulationGraphNode).y || 0)
            .attr('x2', d => (d.target as unknown as SimulationGraphNode).x || 0)
            .attr('y2', d => (d.target as unknown as SimulationGraphNode).y || 0);
            
        // Update node positions
        this.nodesSelection
            .attr('cx', d => d.x || 0)
            .attr('cy', d => d.y || 0);
            
        // Update label positions
        this.labelsSelection
            .attr('x', d => d.x || 0)
            .attr('y', d => d.y || 0);
    }
    
    private updateDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width || 800;
        this.height = rect.height || 600;
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
        // Highlight the node
        d3.select(event.currentTarget as SVGCircleElement)
            .transition()
            .duration(100)
            .attr('stroke-width', 2)
            .style('fill', 'var(--graph-node-hover)');
        
        // Highlight connections
        this.highlightConnections(d.id, true);
        
        // Clear any existing tooltip timeout
        if (this._tooltipTimeout) {
            window.clearTimeout(this._tooltipTimeout);
            this._tooltipTimeout = null;
        }
        
        // Show tooltip after a delay
        this._tooltipTimeout = window.setTimeout(() => {
            if (this.highlightedNodeId === d.id) {
                this.showNodeTooltip(d, event);
            }
            this._tooltipTimeout = null;
        }, 500);
        
        this.highlightedNodeId = d.id;
    }
    
    private onNodeMouseOut(event: any, d: SimulationGraphNode) {
        // Remove highlight
        d3.select(event.currentTarget as SVGCircleElement)
            .transition()
            .duration(100)
            .attr('stroke-width', 1.5)
            .style('fill', this.getNodeColor(d));
        
        // Remove connections highlight
        this.highlightConnections(d.id, false);
        
        // Clear any pending tooltip timeout
        if (this._tooltipTimeout) {
            window.clearTimeout(this._tooltipTimeout);
            this._tooltipTimeout = null;
        }
        
        this.highlightedNodeId = null;
        
        // Remove tooltip
        this.removeNodeTooltip();
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
        // Remove any existing tooltip
        this.container.querySelectorAll('.graph-node-tooltip').forEach(el => el.remove());
    }
    
    private showNodeTooltip(node: SimulationGraphNode, event: any) {
        // Remove any existing tooltip
        this.removeNodeTooltip();
        
        // Create tooltip
        const tooltip = this.container.createDiv({ cls: 'graph-node-tooltip' });
        
        // Get the current transform to position tooltip correctly
        const transform = d3.zoomTransform(this.svg.node() as Element);
        
        // Calculate position based on node coordinates and current transform
        // With centered viewBox, we need to adjust by half the container dimensions
        const nodeX = (node.x || 0) * transform.k + transform.x;
        const nodeY = (node.y || 0) * transform.k + transform.y;
        
        // Get container dimensions for positioning
        const containerRect = this.container.getBoundingClientRect();
        const radius = this.getNodeRadius(node);
        
        // Position tooltip relative to the node's transformed coordinates
        // Add offset to prevent tooltip from overlapping with the node
        const offsetX = radius + 10;
        const offsetY = -20; // Position slightly above the node
        
        // With the centered viewBox, we need to add half the container dimensions
        const x = nodeX + containerRect.width / 2 + offsetX;
        const y = nodeY + containerRect.height / 2 + offsetY;
        
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        
        // Add content
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
        
        // Ensure tooltip stays within container bounds
        const tooltipRect = tooltip.getBoundingClientRect();
        if (tooltipRect.right > containerRect.right) {
            tooltip.style.left = `${x - tooltipRect.width - radius - 20}px`;
        }
        if (tooltipRect.bottom > containerRect.bottom) {
            tooltip.style.top = `${y - tooltipRect.height}px`;
        }
    }

    private highlightConnections(nodeId: string, highlight: boolean) {
        if (!highlight) {
            this.resetHighlights();
            return;
        }
        
        // Find connected nodes
        const connectedNodeIds = new Set<string>();
        this.links.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as unknown as SimulationGraphNode).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as unknown as SimulationGraphNode).id;
            
            if (sourceId === nodeId) {
                connectedNodeIds.add(targetId);
            } else if (targetId === nodeId) {
                connectedNodeIds.add(sourceId);
            }
        });
        
        // Dim all nodes and links not connected
        this.nodesSelection.each(function(d) {
            const isConnected = d.id === nodeId || connectedNodeIds.has(d.id);
            d3.select(this)
                .transition()
                .duration(200)
                .style('opacity', isConnected ? 1 : 0.3);
        });
        
        this.linksSelection.each(function(d) {
            const sourceId = typeof d.source === 'string' ? d.source : (d.source as unknown as SimulationGraphNode).id;
            const targetId = typeof d.target === 'string' ? d.target : (d.target as unknown as SimulationGraphNode).id;
            const isConnected = sourceId === nodeId || targetId === nodeId;
            
            d3.select(this)
                .transition()
                .duration(200)
                .style('stroke-opacity', isConnected ? 0.8 : 0.2)
                .style('stroke-width', isConnected ? 2 : 1);
        });
        
        // Also dim unconnected labels
        this.labelsSelection.each(function(d) {
            const isConnected = d.id === nodeId || connectedNodeIds.has(d.id);
            d3.select(this)
                .transition()
                .duration(200)
                .style('opacity', isConnected ? 1 : 0.2);
        });
    }
    
    private resetHighlights() {
        // Reset all nodes, links, and labels to default state
        this.nodesSelection
            .transition()
            .duration(200)
            .style('opacity', 1)
            .style('fill', 'var(--graph-node-default)');
            
        this.linksSelection
            .transition()
            .duration(200)
            .style('stroke-opacity', 0.6)
            .style('stroke-width', 1);
            
        this.labelsSelection
            .transition()
            .duration(200)
            .style('opacity', d => d.degree && d.degree > 3 ? 0.8 : 0.6);
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
                } catch (e) {
                    console.error("Error in drag end:", e);
                }
            });
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
        
        // Create D3 selections for the graph elements
        // Links first to ensure they're behind nodes
        this.linksSelection = this.svgGroup.select('.links-group')
            .selectAll<SVGLineElement, SimulationGraphLink>('line')
            .data(this.links, d => `${d.source}-${d.target}`)
            .join(
                enter => enter.append('line')
                    .attr('stroke-width', d => Math.sqrt(d.value || 1)) // Scale line width by value like example
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
                    .style('fill', 'var(--text-normal)')
                    .style('font-size', '12px')
                    .style('opacity', 0.7)
                    .style('pointer-events', 'none') // Prevent labels from interfering with interactions
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
        // Use a slightly larger radius for better visibility
        return 6;
    }
    
    private getNodeColor(node: SimulationGraphNode): string {
        // Use a consistent color for all nodes as requested
        return '#1f77b4'; // D3's default blue color
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
        
        // Calculate scale to fill most of the available space
        // Use a smaller margin to maximize graph size
        const margin = 120;
        const scaleX = (this.width - margin * 2) / graphWidth;
        const scaleY = (this.height - margin * 2) / graphHeight;
        
        // Use the smallest scale to ensure everything fits
        // Removed the 1.2 limit to allow scaling up small graphs
        const scale = Math.min(scaleX, scaleY);
        
        // Calculate center point of the graph
        const centerX = minX + graphWidth / 2;
        const centerY = minY + graphHeight / 2;
        
        // Apply the transform with transition
        // With a centered viewBox, we need to transform to bring the graph center to the origin
        const transform = d3.zoomIdentity
            .translate(-centerX * scale, -centerY * scale)
            .scale(scale);
        
        this.svg.transition()
            .duration(500)
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
        // Cancel any pending animation frame
        if (this._frameRequest) {
            window.cancelAnimationFrame(this._frameRequest);
            this._frameRequest = null;
        }
        
        // Clear any pending tooltip timeout
        if (this._tooltipTimeout) {
            window.clearTimeout(this._tooltipTimeout);
            this._tooltipTimeout = null;
        }
        
        // Stop simulation
        if (this.simulation) {
            this.simulation.stop();
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
        
        // Clean up UI elements
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
        
        // Remove all selections
        if (this.svg) {
            this.svg.selectAll('*').remove();
        }
    }
} 