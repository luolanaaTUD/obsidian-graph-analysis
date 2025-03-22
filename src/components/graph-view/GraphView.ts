import { App, Notice } from 'obsidian';
import * as d3 from 'd3';
import { GraphNode, GraphLink, CentralityCalculator } from './types';
import { CentralityCalculator as CentralityCalculatorImpl } from './data/centrality';
import { GraphDataBuilder } from './data/graph-builder';
import { NodeStyler } from './renderers/node-styles';
import { LinkStyler } from './renderers/link-styles';
import { ForceSimulation } from './forces/force-simulation';
import { NodeInteractions } from './interactions/node-interactions';
import { DragBehavior } from './interactions/drag-behavior';
import { CanvasManager } from './ui/canvas-manager';
import { Renderer } from './renderers/renderer';

export class GraphView {
    private app: App;
    private container: HTMLElement;
    private canvas: HTMLElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private width: number = 800;
    private height: number = 600;
    
    // Core modules
    private canvasManager: CanvasManager;
    private graphDataBuilder: GraphDataBuilder;
    private centralityCalculator: CentralityCalculatorImpl;
    private nodeStyler: NodeStyler;
    private linkStyler: LinkStyler;
    private forceSimulation: ForceSimulation;
    private nodeInteractions: NodeInteractions;
    private dragBehavior: DragBehavior;
    private renderer: Renderer;
    private loadingIndicator: HTMLElement | null = null;

    constructor(app: App, calculateDegreeCentrality?: CentralityCalculator) {
        this.app = app;
        
        // Initialize core modules
        this.centralityCalculator = new CentralityCalculatorImpl(calculateDegreeCentrality);
        this.graphDataBuilder = new GraphDataBuilder(app);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Initialize UI manager
        this.canvasManager = new CanvasManager(this.app, container, this.onResize.bind(this));
        this.canvas = this.canvasManager.createCanvas();
        
        // Initialize D3 visualization
        this.initializeD3();
        
        // Create additional modules now that we have SVG elements
        this.nodeStyler = new NodeStyler(this.centralityCalculator);
        this.linkStyler = new LinkStyler(this.nodeStyler, this.nodes);
        this.renderer = new Renderer(this.svgGroup, this.nodeStyler);
        
        // Add node interactions with SVG transform access
        this.nodeInteractions = new NodeInteractions(this.app, this.canvas);
        
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
        
        // Load real vault data
        this.loadingIndicator = this.canvasManager.showLoadingIndicator();
        try {
            await this.loadVaultData();
        } catch (error) {
            console.error('Error loading vault data:', error);
            new Notice(`Error loading graph data: ${(error as Error).message}`);
        } finally {
            this.canvasManager.hideLoadingIndicator(this.loadingIndicator);
            this.loadingIndicator = null;
        }
    }

    private initializeD3() {
        // Create SVG container
        this.svg = d3.select(this.canvas)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('position', 'absolute')
            .style('top', 0)
            .style('left', 0)
            .on('click', () => {
                // Close tooltip when clicking anywhere on the canvas
                this.nodeInteractions.removeNodeTooltip();
                
                // Reset all nodes to default state on canvas click
                this.renderer.resetGraphStyles();
            });
            
        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.svgGroup.attr('transform', event.transform);
                // Close tooltip on zoom
                this.nodeInteractions.removeNodeTooltip();
                
                // Reset all nodes to default state on zoom
                this.renderer.resetGraphStyles();
            });
            
        // Add a group for the graph that will be transformed
        this.svgGroup = this.svg.append('g');

        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Get the available height (accounting for title bar)
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight - 32; // Account for title bar
    }

    private onResize(width: number, height: number) {
        this.width = width;
        this.height = height - 32; // Account for title bar
        
        // Update SVG dimensions
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);
            
        // Update force simulation with new dimensions
        this.forceSimulation.setDimensions(this.width, this.height);
            
        // Update the transform
        this.updateGraphTransform();
    }

    private updateGraphTransform() {
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
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .call(this.dragBehavior.setupDrag())
            .on('dblclick', (event, d) => this.nodeInteractions.openNoteAndCloseGraph(d))
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

    public getCanvas(): HTMLElement {
        return this.canvas;
    }

    public onunload() {
        // Clean up event listeners
        if (this.nodeInteractions) {
            this.nodeInteractions.onunload();
        }
        
        // Stop the simulation
        if (this.forceSimulation) {
            this.forceSimulation.onunload();
        }
    }
}