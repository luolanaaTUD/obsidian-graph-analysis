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

        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Update dimensions based on container size
        this.updateDimensions();
        
        // Handle resize with ResizeObserver
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.updateDimensions();
            });
            this.resizeObserver.observe(this.container);
        }
    }
    
    private updateDimensions() {
        // Check if container still exists in DOM
        if (!this.container || !this.container.isConnected) {
            return; // Exit early if container is no longer in DOM
        }
        
        // Get the current container dimensions
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        
        // Check if SVG exists before updating it
        if (this.svg) {
            // Update SVG dimensions
            this.svg
                .attr('width', this.width)
                .attr('height', this.height);
        }
            
        // Update force simulation with new dimensions
        if (this.forceSimulation) {
            this.forceSimulation.setDimensions(this.width, this.height);
        }
            
        // Update the transform
        this.updateGraphTransform();
    }

    private updateGraphTransform() {
        if (!this.svgGroup || !this.container || !this.container.isConnected) return;
        
        const availableWidth = this.width;
        const availableHeight = this.height;
        
        // Center the graph in the available space
        const centerX = availableWidth / 2;
        const centerY = availableHeight / 2;
        
        // Calculate the scale based on initial dimensions
        const scaleX = availableWidth / 800; // Use a standard initial width
        const scaleY = availableHeight / 600; // Use a standard initial height
        
        // Use the minimum scale to maintain aspect ratio
        const scale = Math.min(scaleX, scaleY);
        
        // Apply the transform to center the graph
        this.svgGroup.attr('transform', 
            `translate(${centerX}, ${centerY}) scale(${scale}) translate(${-400}, ${-300})`);
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
            
            // Ensure all nodes are visible by adjusting the initial zoom
            setTimeout(() => this.forceSimulation.ensureNodesAreVisible(this.svg, this.zoom), 100);
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
            
            // Log the update
            console.log(`Updated graph: ${this.nodes.length} nodes, ${this.links.length} links`);
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
}