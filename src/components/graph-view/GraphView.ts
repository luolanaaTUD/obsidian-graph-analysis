import { App, Notice, TFile } from 'obsidian';
import * as d3 from 'd3';
import { GraphNode, GraphLink, CentralityCalculator } from './types';
import { CentralityCalculator as CentralityCalculatorImpl } from './data/centrality';
import { GraphDataBuilder } from './data/graph-builder';
import { NodeStyler } from './renderers/node-styles';
import { LinkStyler } from './renderers/link-styles';
import { ForceSimulation } from './forces/force-simulation';
import { NodeInteractions } from './interactions/node-interactions';
import { DragBehavior } from './interactions/drag-behavior';
import { Renderer } from './renderers/renderer';

export class GraphView {
    private app: App;
    private container: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private width: number = 800;
    private height: number = 600;
    
    // Core modules
    private graphDataBuilder: GraphDataBuilder;
    private centralityCalculator: CentralityCalculatorImpl;
    private nodeStyler: NodeStyler;
    private linkStyler: LinkStyler;
    private forceSimulation: ForceSimulation;
    private nodeInteractions: NodeInteractions;
    private dragBehavior: DragBehavior;
    private renderer: Renderer;
    private loadingIndicator: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private _resizeTimeout: number | null = null;
    
    // Visibility observer to ensure graph is centered when switching back to the view
    private visibilityObserver: IntersectionObserver | null = null;
    private lastVisibilityChange: number = 0;
    private wasInvisible: boolean = false;

    constructor(app: App, calculateDegreeCentrality?: CentralityCalculator) {
        this.app = app;
        
        // Initialize core modules
        this.centralityCalculator = new CentralityCalculatorImpl(calculateDegreeCentrality);
        this.graphDataBuilder = new GraphDataBuilder(app);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Initialize D3 visualization and components
        this.initializeComponents();
        
        // Setup visibility detection
        this.setupVisibilityObserver();
        
        // Load real vault data
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

    private initializeComponents() {
        // Create components
        this.nodeInteractions = new NodeInteractions(this.app, this.container);
        
        // Set up the SVG container
        this.initializeD3();
        
        // Create additional modules now that we have SVG elements
        this.nodeStyler = new NodeStyler(this.centralityCalculator);
        this.linkStyler = new LinkStyler(this.nodeStyler, this.nodes);
        
        // Create the renderer
        this.renderer = new Renderer(this.svgGroup, this.nodeStyler);
        
        // Connect renderer to node interactions for hover effects
        this.nodeInteractions.setRenderer(this.renderer);
        
        // Set SVG element reference for tooltip positioning
        this.nodeInteractions.setSvgNode(this.svg.node() || null);
        
        // Initialize force simulation
        this.forceSimulation = new ForceSimulation(
            this.width, 
            this.height, 
            this.nodeStyler, 
            this.linkStyler,
            this.updateGraph.bind(this)
        );
        
        // Setup drag behavior
        this.dragBehavior = new DragBehavior(
            this.forceSimulation.getSimulation(),
            this.renderer,
            this.onDragStart.bind(this),
            this.onDragEnd.bind(this)
        );
    }

    private initializeD3() {
        // Create SVG container that fills the entire view
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('display', 'block')
            .attr('class', 'graph-view-svg')
            .on('click', () => {
                // Close tooltip when clicking anywhere on the canvas
                this.nodeInteractions.removeNodeTooltip();
                
                // Reset all nodes to default state on canvas click
                this.renderer.resetGraphStyles();
            });
            
        // Track zoom state to prevent redundant operations
        let isZooming = false;
        let zoomEndTimeout: number | null = null;
        
        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                // Update the transform - this is always needed
                this.svgGroup.attr('transform', event.transform);
                
                // Close tooltip on zoom
                this.nodeInteractions.removeNodeTooltip();
                
                // Set zooming state
                if (!isZooming) {
                    isZooming = true;
                    
                    // Add zooming class to optimize rendering during zoom
                    this.svg.classed('zooming', true);
                }
                
                // Clear any existing timeout
                if (zoomEndTimeout !== null) {
                    window.clearTimeout(zoomEndTimeout);
                }
                
                // Set a timeout to detect when zooming has ended
                zoomEndTimeout = window.setTimeout(() => {
                    // Reset all nodes to default state when zoom is complete
                    this.renderer.resetGraphStyles();
                    
                    // Remove zooming class
                    this.svg.classed('zooming', false);
                    isZooming = false;
                    zoomEndTimeout = null;
                }, 250);
            });
            
        // Add a group for the graph that will be transformed
        this.svgGroup = this.svg.append('g');
        
        // Create separate groups for links, labels, and nodes with explicit rendering order
        // The later a group is added to the DOM, the higher it will be in the stacking order
        this.svgGroup.append('g').attr('class', 'links-group');
        this.svgGroup.append('g').attr('class', 'labels-group');
        this.svgGroup.append('g').attr('class', 'nodes-group');

        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Update dimensions based on container size
        this.updateDimensions();
        
        // Apply an initial transform to center the graph
        // This will be updated later when nodes are loaded
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const initialTransform = d3.zoomIdentity
            .translate(centerX, centerY)
            .scale(0.8);
        
        this.svg.call(this.zoom.transform, initialTransform);
        
        // Handle resize with ResizeObserver
        this.setupResizeObserver();
    }
    
    private setupResizeObserver() {
        // Clean up any existing observer
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        
        // Create a new ResizeObserver to watch for container size changes
        this.resizeObserver = new ResizeObserver((entries) => {
            // Use a debounce mechanism to avoid too many updates
            if (this._resizeTimeout) {
                window.clearTimeout(this._resizeTimeout);
            }
            
            this._resizeTimeout = window.setTimeout(() => {
                // Get the entry for our container
                const containerEntry = entries.find(entry => entry.target === this.container);
                if (!containerEntry) return;
                
                // Get the new dimensions
                const newWidth = containerEntry.contentRect.width;
                const newHeight = containerEntry.contentRect.height;
                
                // Only proceed if dimensions have changed significantly (at least 5px difference)
                if (Math.abs(newWidth - this.width) <= 5 && Math.abs(newHeight - this.height) <= 5) {
                    this._resizeTimeout = null;
                    return;
                }
                
                // Save the previous dimensions for calculating relative change
                const prevWidth = this.width;
                const prevHeight = this.height;
                
                // Update internal dimensions
                this.width = Math.max(newWidth, 300); // Minimum width of 300px
                this.height = Math.max(newHeight, 200); // Minimum height of 200px
                
                // Update SVG dimensions first
                if (this.svg) {
                    this.svg
                        .attr('width', this.width)
                        .attr('height', this.height)
                        .style('width', `${this.width}px`)
                        .style('height', `${this.height}px`);
                }
                
                // Update force simulation with new dimensions
                if (this.forceSimulation) {
                    this.forceSimulation.setDimensions(this.width, this.height);
                }
                
                // Use requestAnimationFrame for smoother visual updates
                // This ensures the dimension changes are applied before transform
                requestAnimationFrame(() => {
                    // Always recenter graph properly when dimensions change
                    this.updateGraphTransform();
                    
                    // Give the transform time to apply, then softly restart the simulation
                    setTimeout(() => {
                        if (this.forceSimulation) {
                            this.forceSimulation.restartGently();
                        }
                    }, 50);
                });
                
                this._resizeTimeout = null;
            }, 50); // Shorter debounce time for more responsive resizing
        });
        
        // Start observing the container
        if (this.container) {
            this.resizeObserver.observe(this.container);
        }
    }
    
    private updateDimensions() {
        // Check if container still exists in DOM
        if (!this.container || !this.container.isConnected) {
            return; // Exit early if container is no longer in DOM
        }
        
        try {
            // Get the current container dimensions
            const rect = this.container.getBoundingClientRect();
            
            // Store previous dimensions for comparison
            const prevWidth = this.width;
            const prevHeight = this.height;
            
            // Update width and height properties with a minimum size
            this.width = Math.max(rect.width || 800, 300); // Minimum width of 300px
            this.height = Math.max(rect.height || 600, 200); // Minimum height of 200px
            
            // Only proceed if dimensions have changed significantly (at least 5px difference)
            const hasChanged = Math.abs(this.width - prevWidth) > 5 || Math.abs(this.height - prevHeight) > 5;
            if (!hasChanged) {
                return;
            }
            
            // Check if SVG exists before updating it
            if (this.svg) {
                // Update SVG dimensions with precise values
                this.svg
                    .attr('width', this.width)
                    .attr('height', this.height)
                    .style('width', `${this.width}px`)
                    .style('height', `${this.height}px`);
            }
                
            // Update force simulation with new dimensions
            if (this.forceSimulation) {
                this.forceSimulation.setDimensions(this.width, this.height);
            }
                
            // Update the graph transform to maintain centering
            this.updateGraphTransform();
            
            // Let the simulation adjust to the new dimensions
            if (this.forceSimulation) {
                setTimeout(() => {
                    this.forceSimulation.restartGently();
                }, 50);
            }
        } catch (error) {
            console.error('Error updating dimensions:', error);
        }
    }

    private updateGraphTransform() {
        if (!this.svgGroup || !this.container || !this.container.isConnected || !this.svg || !this.zoom) return;
        
        try {
            // Get current zoom transform (if any)
            const currentTransform = d3.zoomTransform(this.svg.node() as Element);
            
            // Get current container dimensions
            const availableWidth = this.width;
            const availableHeight = this.height;
            
            // If we have nodes positioned, we want to center based on their actual positions
            if (this.nodes.length > 0 && this.nodes.some(n => n.x !== undefined && n.y !== undefined)) {
                // Find the bounds of all nodes
                let minX = Infinity, minY = Infinity;
                let maxX = -Infinity, maxY = -Infinity;
                
                this.nodes.forEach(node => {
                    if (node.x === undefined || node.y === undefined) return;
                    const x = node.x;
                    const y = node.y;
                    // Use consistent node radius
                    const r = this.nodeStyler.getNodeRadius(node);
                    
                    minX = Math.min(minX, x - r);
                    minY = Math.min(minY, y - r);
                    maxX = Math.max(maxX, x + r);
                    maxY = Math.max(maxY, y + r);
                });
                
                // Calculate current graph dimensions
                const graphWidth = maxX - minX;
                const graphHeight = maxY - minY;
                
                // Detect if we have valid graph dimensions
                if (graphWidth > 1 && graphHeight > 1) {
                    // Calculate center points
                    const graphCenterX = minX + graphWidth / 2;
                    const graphCenterY = minY + graphHeight / 2;
                    const canvasCenterX = availableWidth / 2;
                    const canvasCenterY = availableHeight / 2;
                    
                    // Calculate scale to fit everything with a comfortable margin
                    const margin = 0.15; // 15% margin on each side
                    const scaleX = availableWidth * (1 - 2 * margin) / graphWidth;
                    const scaleY = availableHeight * (1 - 2 * margin) / graphHeight;
                    
                    // Use the smallest scale to ensure everything fits
                    let scale = Math.min(scaleX, scaleY);
                    
                    // Ensure scale is reasonable (not too small or large)
                    scale = Math.max(0.3, Math.min(scale, 1.2));
                    
                    // Create transform to center all nodes
                    const transform = d3.zoomIdentity
                        .translate(canvasCenterX, canvasCenterY)
                        .scale(scale)
                        .translate(-graphCenterX, -graphCenterY);
                    
                    // Apply the transform based on context
                    if (this.wasInvisible) {
                        // When returning to the view, apply transform immediately without transition
                        // to prevent the "go to corner then center" effect
                        this.svg.call(this.zoom.transform, transform);
                    } else if (currentTransform && currentTransform.k !== 1) {
                        // For resize operations with existing transform, use a short transition
                        this.svg.transition()
                            .duration(300)
                            .ease(d3.easeQuadOut)
                            .call(this.zoom.transform, transform);
                    } else {
                        // For initial positioning, use a smooth transition
                        this.svg.transition()
                            .duration(500)
                            .ease(d3.easeQuadOut)
                            .call(this.zoom.transform, transform);
                    }
                    return;
                }
            }
            
            // Fallback to basic centering if we don't have positioned nodes
            // or if the graph dimensions calculation failed
            const centerX = availableWidth / 2;
            const centerY = availableHeight / 2;
            const scale = 0.8;
            
            const initialTransform = d3.zoomIdentity
                .translate(centerX, centerY)
                .scale(scale);
            
            // Apply the transform based on context
            if (this.wasInvisible) {
                // When returning to the view, apply transform immediately
                this.svg.call(this.zoom.transform, initialTransform);
            } else {
                // Otherwise use a transition
                this.svg.transition()
                    .duration(300)
                    .ease(d3.easeQuadOut)
                    .call(this.zoom.transform, initialTransform);
            }
        } catch (error) {
            console.error('Error updating graph transform:', error);
            
            // Ultimate fallback - just try to center things roughly
            const centerX = this.width / 2;
            const centerY = this.height / 2;
            this.svgGroup.attr('transform', `translate(${centerX}, ${centerY}) scale(0.8)`);
        }
    }

    private updateGraph() {
        // Update the renderer with the current nodes and links
        this.renderer.setData(this.nodes, this.links);
        this.renderer.updateGraph();
        
        // Re-apply event handlers after updates
        this.setupNodeEventHandlers();
    }
    
    // New method to setup node event handlers
    private setupNodeEventHandlers() {
        // Cache the drag behavior setup to avoid recreating it on each update
        const dragBehavior = this.dragBehavior.setupDrag();
        
        // Apply event handlers in a more efficient way
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .call(dragBehavior)
            .on('dblclick', (event, d) => {
                try {
                    // Prevent event propagation to avoid any additional SVG handling
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // Remove any transform-related elements early to prevent SVG errors
                    this.svg.on('.zoom', null);
                    
                    // Use the nodeInteractions to open the note and close the graph
                    this.nodeInteractions.openNoteAndCloseGraph(d);
                } catch (e) {
                    console.error('Error handling node double-click:', e);
                    // Fallback plan - just try to open the note without closing the graph
                    if (d.path) {
                        const file = this.app.vault.getAbstractFileByPath(d.path);
                        if (file instanceof TFile) {
                            this.app.workspace.getLeaf().openFile(file);
                        }
                    }
                }
            })
            .on('mouseover', (event, d) => this.nodeInteractions.onNodeMouseOver(event, d))
            .on('mouseout', (event, d) => this.nodeInteractions.onNodeMouseOut(d));
    }

    private onDragStart(node: GraphNode) {
        // Set dragging state
        this.nodeInteractions.setDraggingState(true);
        this.renderer.setDraggingState(true);
        
        // Close any open tooltips when dragging starts
        this.nodeInteractions.removeNodeTooltip();
        
        // Add dragging class to parent SVG to disable transitions
        this.svg.classed('dragging', true);
        
        // Apply contain: paint to improve rendering performance
        this.svgGroup.attr('style', 'contain: strict; will-change: transform;');
        
        // Apply hardware acceleration to reduce flickering
        document.body.classList.add('graph-view-dragging');
        
        // Highlight connections when dragging starts - without transitions
        this.renderer.highlightConnections(node.id, true, false);
    }

    private onDragEnd(node: GraphNode) {
        // Reset dragging states
        this.nodeInteractions.setDraggingState(false);
        this.renderer.setDraggingState(false);
        
        // Remove dragging class to re-enable transitions
        this.svg.classed('dragging', false);
        
        // Remove performance optimizations
        this.svgGroup.attr('style', null);
        document.body.classList.remove('graph-view-dragging');
        
        // Remove highlighting when dragging ends - with transitions
        this.renderer.highlightConnections(node.id, false, true);
    }

    private showLoadingIndicator() {
        // Create a loading indicator in the container
        this.loadingIndicator = this.container.createDiv({ cls: 'graph-analysis-loading' });
        this.loadingIndicator.createSpan({ text: 'Loading graph data...' });
        return this.loadingIndicator;
    }
    
    private hideLoadingIndicator() {
        if (this.loadingIndicator && this.loadingIndicator.parentNode) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
    }

    private async loadVaultData() {
        try {
            // Build the graph data
            const graphData = await this.graphDataBuilder.buildGraphData();
            
            // Calculate degree centrality using WASM
            const centralityResults = this.centralityCalculator.calculate(graphData);
            
            // Convert to D3 format
            this.nodes = [];
            this.links = [];
            
            // Create nodes with centrality scores from WASM
            graphData.nodes.forEach((nodePath, index) => {
                const fileName = nodePath.split('/').pop() || nodePath;
                const displayName = fileName.replace('.md', '');
                
                // Find corresponding centrality result
                const centralityResult = centralityResults.find(r => r.node_id === index);
                const centralityScore = centralityResult ? centralityResult.score : 0;
                
                this.nodes.push({
                    id: index.toString(),
                    name: displayName,
                    path: nodePath,
                    centralityScore: centralityScore,
                    degree: centralityScore // Ensure we're using the Rust-calculated degree score
                });
            });
            
            // Create links
            graphData.edges.forEach(([sourceIdx, targetIdx]) => {
                this.links.push({
                    source: sourceIdx.toString(),
                    target: targetIdx.toString()
                });
            });
            
            // Update simulation with nodes and links
            this.forceSimulation.setNodes(this.nodes);
            this.forceSimulation.setLinks(this.links);
            
            // Initialize positions
            this.forceSimulation.initializePositions();
            
            // Run a few simulation ticks to settle the layout
            for (let i = 0; i < 30; ++i) {
                this.forceSimulation.getSimulation().tick();
            }
            
            // Update the graph to reflect the new data
            this.updateGraph();
            
            // Give the nodeInteractions access to the SVG zoom transform
            this.nodeInteractions.setSvgNode(this.svg.node());
            
            // Mark the graph as initialized for CSS transitions
            if (this.svg) {
                this.svg.classed('graph-initialized', true);
            }
            
            // Use the ensureNodesAreVisible method to calculate optimal positioning based on actual node positions
            if (this.svg && this.zoom && this.forceSimulation) {
                this.forceSimulation.ensureNodesAreVisible(this.svg, this.zoom);
            }
            
            // Add a short delay to give components time to update
            setTimeout(() => {
                if (this.forceSimulation) {
                    this.forceSimulation.restartGently();
                }
            }, 250);
        } catch (error) {
            console.error('Error loading vault data:', error);
            throw error;
        }
    }

    /**
     * Public method to update the graph with new data
     * This is called when the vault data changes
     */
    public async updateData(graphData: any) {
        // Show loading indicator during update
        this.showLoadingIndicator();
        
        try {
            // Calculate degree centrality using WASM
            const centralityResults = this.centralityCalculator.calculate(graphData);
            
            // Store original positions of nodes for smooth transitions
            const oldPositions = new Map<string, {x: number, y: number}>();
            this.nodes.forEach(node => {
                oldPositions.set(node.id, {
                    x: (node as any).x || 0,
                    y: (node as any).y || 0
                });
            });
            
            // Clear existing nodes and links
            this.nodes = [];
            this.links = [];
            
            // Create nodes with centrality scores from WASM
            graphData.nodes.forEach((nodePath: string, index: number) => {
                const fileName = nodePath.split('/').pop() || nodePath;
                const displayName = fileName.replace('.md', '');
                
                // Find corresponding centrality result
                const centralityResult = centralityResults.find(r => r.node_id === index);
                const centralityScore = centralityResult ? centralityResult.score : 0;
                
                // Create the node
                const node: GraphNode = {
                    id: index.toString(),
                    name: displayName,
                    path: nodePath,
                    centralityScore: centralityScore,
                    degree: centralityScore // Ensure we're using the Rust-calculated degree score
                };
                
                // If this node existed before, preserve its position for smooth transition
                const oldPosition = oldPositions.get(node.id);
                if (oldPosition) {
                    (node as any).x = oldPosition.x;
                    (node as any).y = oldPosition.y;
                }
                
                this.nodes.push(node);
            });
            
            // Create links
            graphData.edges.forEach(([sourceIdx, targetIdx]: [number, number]) => {
                this.links.push({
                    source: sourceIdx.toString(),
                    target: targetIdx.toString()
                });
            });
            
            // Apply changes to centrality-based node styling
            this.nodeStyler.updateData(this.nodes);
            
            // Update simulation with nodes and links
            this.forceSimulation.setNodes(this.nodes);
            this.forceSimulation.setLinks(this.links);
            
            // Only re-initialize positions if there are many new nodes
            if (oldPositions.size < this.nodes.length * 0.8) {
                this.forceSimulation.initializePositions();
            } else {
                // Just restart the simulation with less energy for smoother transition
                this.forceSimulation.restartGently();
            }
            
            // Update graph visuals
            this.updateGraph();
        } catch (error) {
            console.error('Error updating graph data:', error);
            new Notice(`Error updating graph: ${(error as Error).message}`);
        } finally {
            // Hide loading indicator
            this.hideLoadingIndicator();
        }
    }

    public onunload() {
        console.log('Unloading Graph View');
        
        // Stop the force simulation first
        if (this.forceSimulation) {
            try {
                this.forceSimulation.onunload();
            } catch (e) {
                console.warn('Error unloading force simulation:', e);
            }
        }
        
        // Disconnect ResizeObserver if it exists
        if (this.resizeObserver) {
            try {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            } catch (e) {
                console.warn('Error disconnecting ResizeObserver:', e);
            }
        }
        
        // Disconnect VisibilityObserver if it exists
        if (this.visibilityObserver) {
            try {
                this.visibilityObserver.disconnect();
                this.visibilityObserver = null;
            } catch (e) {
                console.warn('Error disconnecting VisibilityObserver:', e);
            }
        }
        
        // Remove event listeners from nodes
        if (this.svgGroup) {
            try {
                this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
                    .on('dblclick', null)
                    .on('mouseover', null)
                    .on('mouseout', null)
                    .on('click', null);
            } catch (e) {
                console.warn('Error removing event listeners from nodes:', e);
            }
        }
        
        // Remove tooltip if it exists
        if (this.nodeInteractions) {
            try {
                this.nodeInteractions.removeNodeTooltip();
                this.nodeInteractions.dispose();
            } catch (e) {
                console.warn('Error disposing node interactions:', e);
            }
        }
        
        // Clean up zoom behavior - fix condition check
        if (this.svg) {
            try {
                this.svg.on('.zoom', null);
            } catch (e) {
                console.warn('Error removing zoom behavior:', e);
            }
        }
        
        // Clean up all D3 selections to prevent memory leaks
        if (this.svg) {
            try {
                this.svg.selectAll('*').remove();
                this.svg.remove();
            } catch (e) {
                console.warn('Error removing SVG elements:', e);
            }
        }
        
        // Clear loadingIndicator if it exists
        if (this.loadingIndicator && this.loadingIndicator.parentNode) {
            try {
                this.loadingIndicator.remove();
            } catch (e) {
                console.warn('Error removing loading indicator:', e);
            }
            this.loadingIndicator = null;
        }
        
        // Reset data
        this.nodes = [];
        this.links = [];
        
        // Null out references to help garbage collection
        this.svg = null as any;
        this.svgGroup = null as any;
        this.zoom = null as any;
        this.container = null as any;
        this.forceSimulation = null as any;
        this.renderer = null as any;
        this.dragBehavior = null as any;
        this.nodeInteractions = null as any;
    }

    // Public method to recenter the graph
    public recenterGraph(): void {
        this.updateGraphTransform();
    }
    
    // Public method to restart the force simulation gently
    public restartSimulationGently(): void {
        if (this.forceSimulation) {
            this.forceSimulation.restartGently();
        }
    }
    
    // Public method to force a dimension update and transform 
    public refreshGraphView(): void {
        // First update dimensions
        this.updateDimensions();
        
        // Then update graph transform, treating as if the view was invisible
        this.wasInvisible = true;
        this.updateGraphTransform();
        
        // Reset flag
        this.wasInvisible = false;
    }
    
    // Public method to set the wasInvisible flag
    public setWasInvisible(value: boolean): void {
        this.wasInvisible = value;
    }

    private setupVisibilityObserver() {
        // Clean up any existing observer
        if (this.visibilityObserver) {
            this.visibilityObserver.disconnect();
            this.visibilityObserver = null;
        }
        
        // Create a new observer for visibility changes
        this.visibilityObserver = new IntersectionObserver((entries) => {
            if (!entries || !entries.length) return;
            
            // Get the entry for our container
            const entry = entries[0];
            const isVisible = entry.isIntersecting;
            const now = Date.now();
            
            // Don't process too frequent visibility changes (debounce)
            if (now - this.lastVisibilityChange < 200) {
                return;
            }
            
            this.lastVisibilityChange = now;
            
            if (isVisible && this.wasInvisible) {
                // Container has become visible after being invisible
                console.log("Graph view has become visible again, recentering...");
                
                // Mark as visible before updating transform to ensure direct transform application
                this.wasInvisible = false;
                
                // When returning to visibility, ensure we get current dimensions
                // before applying any transforms
                this.updateDimensions();
                
                // Apply instant transform to avoid the "jump" effect
                requestAnimationFrame(() => {
                    this.updateGraphTransform();
                    
                    // After the transform is applied, restart simulation gently
                    setTimeout(() => {
                        if (this.forceSimulation) {
                            this.forceSimulation.restartGently();
                        }
                    }, 100);
                });
            } else if (!isVisible) {
                // Container has become invisible
                this.wasInvisible = true;
            }
        }, { 
            threshold: 0.05 // Trigger with just 5% visibility to respond faster
        });
        
        // Start observing the container
        if (this.container) {
            this.visibilityObserver.observe(this.container);
        }
    }
}