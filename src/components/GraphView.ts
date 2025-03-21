import { App, TFile, Notice } from 'obsidian';
import * as d3 from 'd3';

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
    degree?: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string;
    target: string;
}

interface GraphData {
    nodes: string[];
    edges: [number, number][];
}

interface CentralityResult {
    node_id: number;
    node_name: string;
    score: number;
}

// Type for centrality calculation function
type CentralityCalculator = (graphDataJson: string) => string;

export class GraphView {
    private container: HTMLElement;
    private canvas: HTMLElement;
    private app: App;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private simulation: d3.Simulation<GraphNode, GraphLink>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private nodesSelection: d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown>;
    private linksSelection: d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>;
    private labelsSelection: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>;
    private svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private isDragging: boolean = false;
    private draggedNode: GraphNode | null = null;
    private isMovingCanvas: boolean = false;
    private isResizing: boolean = false;
    private initialX: number = 0;
    private initialY: number = 0;
    private initialWidth: number = 800;
    private initialHeight: number = 600;
    private width: number = 800;
    private height: number = 600;
    private calculateDegreeCentrality?: (graphDataJson: string) => string;
    private loadingIndicator: HTMLElement | null = null;
    private maxCentralityScore: number = 1; // Store max centrality score
    
    // Variables for dragging and resizing
    private startX: number = 0;
    private startY: number = 0;
    private startWidth: number = 0;
    private startHeight: number = 0;
    
    // For handling hover and click interactions
    private hoverNode: GraphNode | null = null;
    private nodeTooltip: HTMLElement | null = null;
    private hoverTimeout: number | null = null;
    private tooltipVisible: boolean = false;
    // Event handler references
    private tooltipMouseEnterHandler: ((e: MouseEvent) => void) | null = null;
    private tooltipMouseLeaveHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButton: HTMLElement | null = null;
    private openNoteButtonMouseEnterHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButtonMouseLeaveHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButtonClickHandler: ((e: MouseEvent) => void) | null = null;
    
    // Bound event handlers
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundMouseDown: (e: MouseEvent) => void;
    private boundResizeStart: (e: MouseEvent) => void;

    constructor(app: App, calculateDegreeCentrality?: (graphDataJson: string) => string) {
        this.app = app;
        this.calculateDegreeCentrality = calculateDegreeCentrality;
        
        // Create bound event handlers to properly handle 'this'
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundResizeStart = this.onResizeStart.bind(this);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Create the main canvas container
        this.canvas = container.createDiv({ cls: 'graph-analysis-canvas' });
        
        // Calculate initial size (80% of app size)
        const appContainer = this.app.workspace.containerEl;
        const width = Math.floor(appContainer.offsetWidth * 0.8);
        const height = Math.floor(appContainer.offsetHeight * 0.8);
        
        // Store initial dimensions for scaling reference
        this.initialWidth = width;
        this.initialHeight = height;
        
        // Set initial position and size
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.style.left = `${Math.floor((appContainer.offsetWidth - width) / 2)}px`;
        this.canvas.style.top = `${Math.floor((appContainer.offsetHeight - height) / 2)}px`;

        // Add drag handle (title bar)
        const dragHandle = this.canvas.createDiv({ cls: 'graph-analysis-drag-handle' });
        dragHandle.createSpan({ text: 'Graph Analysis' });

        // Add close button
        const closeButton = this.canvas.createDiv({ cls: 'graph-analysis-close-button' });
        closeButton.setAttribute('aria-label', 'Close graph view');
        closeButton.setAttribute('role', 'button');
        closeButton.addEventListener('click', () => {
            // Clean up
            this.onunload();
            this.canvas.remove();
            
            // Notify plugin that we've been closed
            // Find the plugin instance
            const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
            if (plugin) {
                plugin.graphView = null;
            }
        });

        // Add resize handle
        const resizeHandle = this.canvas.createDiv({ cls: 'graph-analysis-resize-handle' });

        // Setup event listeners for dragging
        dragHandle.addEventListener('mousedown', this.boundMouseDown);

        // Setup event listeners for resizing
        resizeHandle.addEventListener('mousedown', this.boundResizeStart);

        // Setup global event listeners
        document.addEventListener('mousemove', this.boundMouseMove);
        document.addEventListener('mouseup', this.boundMouseUp);

        // Add help icon with direct text
        const helpIconContainer = this.canvas.createDiv({ cls: 'graph-analysis-help-icon-container' });
        helpIconContainer.style.position = 'absolute';
        helpIconContainer.style.bottom = '10px';
        helpIconContainer.style.right = '10px';
        helpIconContainer.style.zIndex = '9999';
        helpIconContainer.style.width = '24px';
        helpIconContainer.style.height = '24px';
        helpIconContainer.style.borderRadius = '50%';
        helpIconContainer.style.backgroundColor = 'var(--background-modifier-border)';
        helpIconContainer.style.display = 'flex';
        helpIconContainer.style.alignItems = 'center';
        helpIconContainer.style.justifyContent = 'center';
        helpIconContainer.style.cursor = 'pointer';
        helpIconContainer.style.opacity = '0.7';
        helpIconContainer.style.transition = 'opacity 0.2s ease';
        
        // Use a simple text question mark instead of SVG
        helpIconContainer.setText('?');
        helpIconContainer.style.fontWeight = 'normal';
        helpIconContainer.style.fontSize = '14px';
        helpIconContainer.style.color = 'var(--text-muted)';

        // Create tooltip content
        const tooltipContainer = this.canvas.createDiv();
        tooltipContainer.style.position = 'absolute';
        tooltipContainer.style.bottom = '40px';
        tooltipContainer.style.right = '10px';
        tooltipContainer.style.width = '250px';
        tooltipContainer.style.backgroundColor = 'var(--background-primary)';
        tooltipContainer.style.border = '1px solid var(--background-modifier-border)';
        tooltipContainer.style.borderRadius = '6px';
        tooltipContainer.style.padding = '10px';
        tooltipContainer.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.15)';
        tooltipContainer.style.zIndex = '9999';
        tooltipContainer.style.opacity = '0';
        tooltipContainer.style.pointerEvents = 'none';
        tooltipContainer.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        tooltipContainer.style.transform = 'translateY(10px)';
        
        // Show/hide tooltip on hover
        helpIconContainer.addEventListener('mouseenter', () => {
            tooltipContainer.style.opacity = '1';
            tooltipContainer.style.transform = 'translateY(0)';
            helpIconContainer.style.opacity = '1';
        });
        helpIconContainer.addEventListener('mouseleave', () => {
            tooltipContainer.style.opacity = '0';
            tooltipContainer.style.transform = 'translateY(10px)';
            helpIconContainer.style.opacity = '0.7';
        });

        // Add tooltip content
        const tooltipTitle = tooltipContainer.createEl('h3', { text: 'Graph Visualization Guide' });
        tooltipTitle.style.margin = '0 0 10px 0';
        tooltipTitle.style.fontSize = '1.1em';
        tooltipTitle.style.borderBottom = '1px solid var(--background-modifier-border)';
        tooltipTitle.style.paddingBottom = '5px';

        const nodeSection = tooltipContainer.createDiv();
        nodeSection.style.marginBottom = '10px';
        const nodeTitle = nodeSection.createEl('h4', { text: 'Node Size' });
        nodeTitle.style.margin = '0 0 5px 0';
        nodeTitle.style.fontSize = '1em';
        const nodeText = nodeSection.createEl('p', { text: 'Node size represents the degree centrality of each note - larger nodes have more connections in your vault.' });
        nodeText.style.margin = '0';
        nodeText.style.color = 'var(--text-muted)';

        // Initialize D3 visualization
        await this.initializeD3();
        
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

    private showLoadingIndicator() {
        this.loadingIndicator = this.canvas.createDiv({ cls: 'graph-analysis-loading' });
        this.loadingIndicator.createSpan({ text: 'Loading graph data...' });
    }

    private hideLoadingIndicator() {
        if (this.loadingIndicator) {
            this.loadingIndicator.remove();
            this.loadingIndicator = null;
        }
    }

    private initializeD3() {
        // Reset hover state to ensure first hover works
        this.hoverNode = null;
        this.hoverTimeout = null;
        this.tooltipVisible = false;
        
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
                this.removeNodeTooltip();
                
                // Reset all nodes to default state on canvas click
                this.resetGraphStyles();
            });
            
        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.svgGroup.attr('transform', event.transform);
                // Close tooltip on zoom
                this.removeNodeTooltip();
                
                // Reset all nodes to default state on zoom
                this.resetGraphStyles();
            });
            
        // Add a group for the graph that will be transformed
        this.svgGroup = this.svg.append('g');

        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Get the available height (accounting for title bar)
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
        
        // Initialize force simulation with improved parameters
        this.simulation = d3.forceSimulation<GraphNode>()
            .force('charge', d3.forceManyBody()
                .strength((d) => this.getNodeRepulsionStrength(d as GraphNode))
                .distanceMax(400)) // Increased distance max for more spacing
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.2)) // Stronger center force for circular shape
            .force('collision', d3.forceCollide<GraphNode>()
                .radius(d => this.getNodeRadius(d) + 15) // Increased padding between nodes
                .strength(0.75)) 
            .force('link', d3.forceLink<GraphNode, GraphLink>()
                .id(d => d.id)
                .distance(d => this.getLinkDistance(d))
                .strength(0.5)) // Balanced link strength
            .force('boundary', this.createBoundaryForce())
            .force('radial', this.createRadialForce())
            .force('circular', this.createCircularLayoutForce()) // Add circular layout force
            .force('label', this.createLabelAvoidanceForce()) // Add force to prevent label overlaps
            .velocityDecay(0.35) // Increased decay for more stable positions
            .alpha(1.0)
            .alphaDecay(0.01) // Slower decay for better settling
            .on('tick', () => this.updateGraph());
            
        // Set the initial transform to center the graph properly
        this.updateGraphTransform();
    }

    // Helper method to reset all graph styles to default
    private resetGraphStyles() {
        // Only proceed if we're not currently highlighting a specific node
        if (this.hoverNode !== null) return;
        
        // Use consistent colors
        const primaryNodeColor = 'var(--interactive-accent)';
        const defaultLinkColor = 'var(--graph-line)';
        
        // Reset all nodes to default state
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .transition()
            .duration(200)
            .attr('fill', primaryNodeColor)
            .attr('opacity', 1.0)
            .attr('r', d => this.getNodeRadius(d))
            .style('filter', null);
            
        // Reset all links to default state
        this.svgGroup.selectAll<SVGLineElement, GraphLink>('.graph-link')
            .transition()
            .duration(200)
            .style('stroke', defaultLinkColor)
            .style('stroke-opacity', 0.5)
            .style('stroke-width', 2);
            
        // Reset all labels to default state
        this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label')
            .transition()
            .duration(200)
            .style('font-weight', 'normal')
            .style('opacity', 0.8);
    }

    // Calculate adaptive repulsion strength based on node connectivity
    private getNodeRepulsionStrength(node: GraphNode): number {
        // Default repulsion for nodes without degree info
        if (node.degree === undefined) return -120;
        
        // Orphan nodes get less repulsion to keep them closer to center
        if (node.degree === 0) return -60;
        
        // More aggressive repulsion to increase spacing
        const baseStrength = -100; // Increased base repulsion
        const connectivityFactor = Math.min(1 + (node.degree / 12), 2.0); // Less aggressive scaling
        
        return baseStrength * connectivityFactor;
    }

    // Create a force to arrange nodes in a circular layout
    private createCircularLayoutForce() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Create rings based on node connectivity
        return (alpha: number) => {
            const k = alpha * 0.1; // Force strength factor
            
            this.nodes.forEach(node => {
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

    // Create a radial force specifically for orphan nodes
    private createRadialForce() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.2; // Inner radius for orphans
        
        return d3.forceRadial<GraphNode>(
            (d: any) => (d as GraphNode).degree === 0 ? radius : Math.min(width, height) * 0.35, // Distribute along radii
            centerX, 
            centerY
        ).strength((d: any) => (d as GraphNode).degree === 0 ? 0.3 : 0.08); // Stronger for orphans, gentler for connected
    }

    // Create a custom force to keep nodes within a circular boundary
    private createBoundaryForce() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
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

    private getLinkDistance(link: GraphLink): number {
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
                   this.getNodeRadius(source) + this.getNodeRadius(target);
        }
        
        // For normal links within clusters, use a longer distance
        return (baseDistance * densityFactor) + 
               this.getNodeRadius(source) + this.getNodeRadius(target);
    }

    private getNodeRadius(node: GraphNode): number {
        // Default size if no centrality score is available
        if (node.centralityScore === undefined) {
            return 6; // Reduced from 8
        }
        
        // Get max centrality score
        const maxScore = this.getMaxCentralityScore();
        if (maxScore === 0) return 6; // Reduced from 8
        
        // Adaptive sizing based on graph density
        const nodeCount = this.nodes.length;
        
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
    
    private calculateCentrality(graphData: GraphData): CentralityResult[] {
        try {
            // Check if we have the WASM calculation function
            if (!this.calculateDegreeCentrality) {
                console.error('WASM centrality calculation function not available');
                return [];
            }
            
            // Call the WASM function to calculate degree centrality
            const graphDataJson = JSON.stringify(graphData);
            const resultsJson = this.calculateDegreeCentrality(graphDataJson);
            
            // Parse results
            const results = JSON.parse(resultsJson) as CentralityResult[];
            
            // Check for error
            if (results.length === 1 && 'error' in results[0]) {
                console.error('Error calculating centrality:', (results[0] as any).error);
                return [];
            }
            
            // Store the maximum score at calculation time
            if (results.length > 0) {
                this.maxCentralityScore = results.reduce((max, current) => 
                    current.score > max ? current.score : max, 0);
            }
            
            return results;
        } catch (error) {
            console.error('Error calculating centrality:', error);
            return [];
        }
    }
    
    private getMaxCentralityScore(): number {
        // Return the stored max score
        return this.maxCentralityScore > 0 ? this.maxCentralityScore : 1;
    }

    private updateGraphTransform() {
        const availableWidth = this.canvas.clientWidth;
        const availableHeight = this.canvas.clientHeight - 32; // Account for title bar
        
        // Center the graph in the available space
        const centerX = availableWidth / 2;
        const centerY = availableHeight / 2;
        
        // Calculate the scale based on initial dimensions
        const scaleX = availableWidth / this.initialWidth;
        const scaleY = (availableHeight) / (this.initialHeight - 32);
        
        // Use the minimum scale to maintain aspect ratio
        const scale = Math.min(scaleX, scaleY);
        
        // Apply the transform
        this.svgGroup.attr('transform', 
            `translate(${centerX}, ${centerY}) scale(${scale}) translate(${-this.initialWidth/2}, ${-(this.initialHeight-32)/2})`);
    }

    private updateGraph() {
        // Check if nodes and links exist
        if (this.nodes.length === 0) {
            return;
        }
        
        // Force an initial position for nodes if not set
        this.nodes.forEach(node => {
            if (node.x === undefined || node.y === undefined) {
                const width = this.canvas.clientWidth;
                const height = this.canvas.clientHeight - 32;
                node.x = width / 2 + (Math.random() - 0.5) * 100;
                node.y = height / 2 + (Math.random() - 0.5) * 100;
            }
        });
        
        // Skip style updates during drag operations to prevent flashing
        const shouldUpdateStyles = !this.isDragging;
        
        // Update links positions
        this.svgGroup.selectAll<SVGLineElement, GraphLink>('line')
            .data(this.links)
            .join(
                enter => enter.append('line')
                    .attr('stroke', 'var(--graph-line)')
                    .attr('stroke-opacity', 0.5)
                    .attr('stroke-width', 2)
                    .attr('class', 'graph-link'),
                update => update,
                exit => exit.remove()
            )
            .attr('x1', d => (d.source as unknown as GraphNode).x || 0)
            .attr('y1', d => (d.source as unknown as GraphNode).y || 0)
            .attr('x2', d => (d.target as unknown as GraphNode).x || 0)
            .attr('y2', d => (d.target as unknown as GraphNode).y || 0);

        // Update nodes positions
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('circle')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('circle')
                    .attr('r', d => this.getNodeRadius(d))
                    .attr('fill', 'var(--interactive-accent)')
                    .attr('opacity', 1.0)
                    .attr('class', 'graph-node')
                    .call(this.drag())
                    .on('dblclick', (event, d) => this.openNoteAndCloseGraph(d))
                    .on('mouseover', (event, d) => this.onNodeMouseOver(event, d))
                    .on('mouseout', (event, d) => this.onNodeMouseOut(d)),
                update => update,
                exit => exit.remove()
            )
            .attr('cx', d => (d as any).x)
            .attr('cy', d => (d as any).y);

        // Use our quadtree-based label positioning
        const labelVisibility = this.calculateLabelPositions();
        
        // Get current zoom level to adjust label visibility
        const transform = d3.zoomTransform(this.svg.node()!);
        const zoomLevel = transform.k;
        
        // Update labels positions with improved collision detection
        this.svgGroup.selectAll<SVGTextElement, GraphNode>('text')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('text')
                    .attr('dy', d => this.getNodeRadius(d) + 15)
                    .attr('text-anchor', 'middle')
                    .style('fill', 'var(--text-normal)')
                    .style('font-size', '12px')
                    .style('opacity', 0) // Start with opacity 0
                    .attr('class', 'graph-label')
                    .on('mouseover', function(event, d) {
                        // Highlight this label when hovered
                        d3.select(this)
                          .transition()
                          .duration(200)
                          .style('opacity', 1.0)
                          .style('font-weight', 'bold');
                    })
                    .on('mouseout', function(event, d) {
                        // Return to regular state
                        d3.select(this)
                          .transition()
                          .duration(200)
                          .style('opacity', (d: any, i: number) => {
                              // Get the stored label visibility object
                              const visibility = labelVisibility.find(v => v.id === d.id);
                              if (!visibility) return 0.8;
                              
                              // Apply zoom and importance adjustments
                              let opacity = visibility.opacity;
                              if (d.degree && d.degree > 5) {
                                  opacity = Math.min(1.0, opacity + 0.2);
                              }
                              if (zoomLevel > 1.5) {
                                  opacity = Math.min(1.0, opacity + 0.1);
                              }
                              return opacity;
                          })
                          .style('font-weight', 'normal');
                    })
                    .text(d => d.name),
                update => update,
                exit => exit.remove()
            )
            .attr('x', d => (d as any).x)
            .attr('y', d => (d as any).y)
            // Apply calculated opacity for each label with fallback
            .style('opacity', d => {
                // Find the visibility info for this node
                const visibility = labelVisibility.find(v => v.id === d.id);
                if (!visibility) return 0.8; // Default opacity if not found
                
                // Apply adaptive opacity based on importance and zoom
                let opacity = visibility.opacity;
                
                // Enhance opacity for important nodes
                if (d.degree && d.degree > 5) {
                    opacity = Math.min(1.0, opacity + 0.2);
                }
                
                // Show more labels when zoomed in
                if (zoomLevel > 1.5) {
                    opacity = Math.min(1.0, opacity + 0.1);
                }
                
                return opacity;
            })
            .attr('dy', d => {
                // Find the vertical shift for this node
                const visibility = labelVisibility.find(v => v.id === d.id);
                return this.getNodeRadius(d) + ((visibility?.shift || 0) * 15) + 15;
            });
            
        // If we're dragging, maintain the highlight state
        if (this.draggedNode) {
            this.highlightConnections(this.draggedNode.id, true, false);
        }
    }

    // Calculate label positions to minimize collisions
    private calculateLabelPositions(): { id: string, shift: number, opacity: number }[] {
        if (!this.nodes.length) return [];
        
        // Create an array to store position info for each label
        const labelPositions: { id: string, shift: number, opacity: number }[] = this.nodes.map(node => ({
            id: node.id,
            shift: 0, // Vertical shift (0 = default position, 1 = shift down by 1 line, etc.)
            opacity: 0.8 // Default opacity
        }));
        
        // Build a quadtree for spatial partitioning
        const quad = d3.quadtree<{ id: string, x: number, y: number, width: number, height: number, priority: number }>()
            .x(d => d.x)
            .y(d => d.y)
            .addAll(this.nodes.map(node => {
                const name = node.name || '';
                // Estimate text width based on character count and average character width
                const estWidth = name.length * 6.5;
                // Calculate priority based on node degree (higher degree = higher priority)
                const priority = node.degree || 0;
                return {
                    id: node.id,
                    x: (node as any).x,
                    y: (node as any).y + this.getNodeRadius(node) + 15, // Label Y position (below node)
                    width: estWidth,
                    height: 15,
                    priority
                };
            }));
        
        // Sort nodes by priority (degree) for processing
        const sortedNodes = [...this.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0));
        
        // Process nodes in priority order
        sortedNodes.forEach(node => {
            if (!node.x || !node.y) return;
            
            const labelInfo = {
                id: node.id,
                x: (node as any).x,
                y: (node as any).y + this.getNodeRadius(node) + 15,
                width: (node.name?.length || 0) * 6.5,
                height: 15,
                priority: node.degree || 0
            };
            
            // Check for collisions
            const collisions: string[] = [];
            const padding = 5; // Padding between labels
            
            // Search for nearby labels in the quadtree
            quad.visit((quadNode, x1, y1, x2, y2) => {
                // For internal nodes without data, we need to continue searching
                if (!('data' in quadNode)) return true;
                
                const q = quadNode.data;
                if (!q) return false;
                
                // Skip self
                if (q.id === node.id) return false;
                
                // Calculate overlap
                const dx = labelInfo.x - q.x;
                const dy = labelInfo.y - q.y;
                const halfWidthA = labelInfo.width / 2;
                const halfWidthB = q.width / 2;
                const halfHeightA = labelInfo.height / 2;
                const halfHeightB = q.height / 2;
                
                // Check if there's horizontal overlap
                const overlapX = Math.abs(dx) < (halfWidthA + halfWidthB + padding);
                // Check if there's vertical overlap
                const overlapY = Math.abs(dy) < (halfHeightA + halfHeightB + padding);
                
                // If both overlaps exist, there's a collision
                if (overlapX && overlapY) {
                    collisions.push(q.id);
                }
                
                // Return true to continue visiting nodes in this quad
                return true;
            });
            
            // Find position in our labelPositions array
            const positionIndex = labelPositions.findIndex(p => p.id === node.id);
            if (positionIndex === -1) return;
            
            // If we have collisions, try to resolve them
            if (collisions.length > 0) {
                // First, check if the current label has higher priority than all collisions
                const collidedNodes = this.nodes.filter(n => collisions.includes(n.id));
                const allLowerPriority = collidedNodes.every(n => (n.degree || 0) < (node.degree || 0));
                
                // Calculate an overlap factor based on the number of collisions
                const overlapFactor = Math.min(collisions.length, 5) / 5;
                
                if (allLowerPriority) {
                    // Higher priority labels stay visible but affected labels get reduced opacity
                    collisions.forEach(id => {
                        const collidedNode = this.nodes.find(n => n.id === id);
                        if (!collidedNode) return;
                        
                        const collidedIndex = labelPositions.findIndex(p => p.id === id);
                        if (collidedIndex === -1) return;
                        
                        // Reduce opacity based on priority difference and proximity
                        const priorityDiff = (node.degree || 0) - (collidedNode.degree || 0);
                        const normalizedDiff = Math.min(1, priorityDiff / 10);
                        // Calculate a reduced opacity that never goes below 0.2
                        const reducedOpacity = Math.max(0.2, labelPositions[collidedIndex].opacity * (1 - normalizedDiff * 0.6));
                        labelPositions[collidedIndex].opacity = reducedOpacity;
                    });
                } else {
                    // Try to shift vertically first (for high priority nodes)
                    if (node.degree && node.degree > 3) { // Only shift important nodes
                        // Try positions below the node with increasing shifts
                        for (let shift = 1; shift <= 2; shift++) {
                            // Calculate new position with shift
                            const newY = (node as any).y + this.getNodeRadius(node) + 15 + (shift * 15);
                            
                            // Check if the new position would avoid collisions
                            const wouldCollide = collisions.some(id => {
                                const collidedNode = this.nodes.find(n => n.id === id);
                                if (!collidedNode) return false;
                                
                                const collidedIndex = labelPositions.findIndex(p => p.id === id);
                                if (collidedIndex === -1) return false;
                                
                                const otherY = (collidedNode as any).y + this.getNodeRadius(collidedNode) + 15 + 
                                              (labelPositions[collidedIndex].shift * 15);
                                
                                return Math.abs(newY - otherY) < 15;
                            });
                            
                            if (!wouldCollide) {
                                // Apply the shift
                                labelPositions[positionIndex].shift = shift;
                                return; // Successfully resolved
                            }
                        }
                    }
                    
                    // If we're still here, we couldn't shift to avoid collision
                    // Reduce opacity based on number of collisions
                    labelPositions[positionIndex].opacity = Math.max(0.3, 0.8 - (overlapFactor * 0.5));
                }
            }
        });
        
        return labelPositions;
    }

    private highlightConnections(nodeId: string, highlight: boolean, useTransition: boolean = true) {
        // Find all connected links
        const connectedNodeIds = new Set<string>();
        this.links.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            if (sourceId === nodeId) {
                connectedNodeIds.add(targetId);
            } else if (targetId === nodeId) {
                connectedNodeIds.add(sourceId);
            }
        });

        const primaryNodeColor = 'var(--interactive-accent)';
        const primaryNodeHighlightColor = 'var(--text-accent)';
        const defaultLinkColor = 'var(--graph-line)';
        
        // Reset all nodes to default state first if we're canceling a highlight
        if (!highlight) {
            this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
                .style('fill', primaryNodeColor)
                .style('opacity', 1.0)
                .style('r', d => this.getNodeRadius(d))
                .style('filter', null);
                
            // Reset all links
            this.svgGroup.selectAll<SVGLineElement, GraphLink>('.graph-link')
                .style('stroke', defaultLinkColor)
                .style('stroke-opacity', 0.9)
                .style('stroke-width', 2);
                
            // Reset all labels
            this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label')
                .style('font-weight', 'normal')
                .style('opacity', 0.8)
                .style('font-size', '12px');
                
            return;
        }
        
        // If highlighting, apply styles immediately without transitions during drag
        
        // 1. Highlight the selected node and its label
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .filter(d => d.id === nodeId)
            .style('r', d => this.getNodeRadius(d) * 1.2)
            .style('fill', primaryNodeHighlightColor)
            .style('opacity', 1.0)
            .style('filter', null);
            
        // Highlight the active node's label
        this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label')
            .filter(d => d.id === nodeId)
            .style('font-weight', 'bold')
            .style('opacity', 1.0)
            .style('font-size', '13px');
            
        // 2. Highlight connected nodes
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .filter(d => d.id !== nodeId && connectedNodeIds.has(d.id))
            .style('fill', primaryNodeColor)
            .style('opacity', 1.0)
            .style('filter', null);
            
        // 3. Fade non-connected nodes
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .filter(d => d.id !== nodeId && !connectedNodeIds.has(d.id))
            .style('fill', primaryNodeColor)
            .style('opacity', 0.3)
            .style('filter', null);
            
        // 4. Highlight connected links
        this.svgGroup.selectAll<SVGLineElement, GraphLink>('.graph-link')
            .filter(d => {
                const sourceId = typeof d.source === 'string' ? d.source : (d.source as any).id;
                const targetId = typeof d.target === 'string' ? d.target : (d.target as any).id;
                return sourceId === nodeId || targetId === nodeId;
            })
            .style('stroke', primaryNodeHighlightColor)
            .style('stroke-opacity', 1)
            .style('stroke-width', 3);
            
        // 5. Fade non-connected links
        this.svgGroup.selectAll<SVGLineElement, GraphLink>('.graph-link')
            .filter(d => {
                const sourceId = typeof d.source === 'string' ? d.source : (d.source as any).id;
                const targetId = typeof d.target === 'string' ? d.target : (d.target as any).id;
                return sourceId !== nodeId && targetId !== nodeId;
            })
            .style('stroke', defaultLinkColor)
            .style('stroke-opacity', 0.3)
            .style('stroke-width', 1);
            
        // 6. Style connected node labels
        this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label')
            .filter(d => d.id !== nodeId && connectedNodeIds.has(d.id))
            .style('font-weight', 'normal')
            .style('opacity', 0.8)
            .style('font-size', '12px');
            
        // 7. Fade non-connected node labels
        this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label')
            .filter(d => d.id !== nodeId && !connectedNodeIds.has(d.id))
            .style('opacity', 0.3);
    }

    private onNodeMouseOver(event: MouseEvent, node: GraphNode) {
        // Prevent tooltip from showing if dragging is active
        if (this.isDragging) {
            return;
        }

        // Prevent tooltip from showing if the mouse button is still pressed
        if (this.isMouseButtonPressed(event)) {
            return;
        }

        this.hoverNode = node;

        // Clear any existing timeout
        if (this.hoverTimeout !== null) {
            window.clearTimeout(this.hoverTimeout);
        }
        
        // Always reset the timeout
        this.hoverTimeout = window.setTimeout(() => {
            if (this.hoverNode === node) {
                this.showNodeMetadata(node);
                this.tooltipVisible = true;
            }
        }, 500); // 0.5 second delay
    }
    
    private onNodeMouseOut(node: GraphNode) {
        // Clear the hover node
        this.hoverNode = null;
        
        // Clear the hover timeout if it exists
        if (this.hoverTimeout !== null) {
            window.clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
        
        // Add a short delay before removing tooltip to allow moving to the tooltip
        setTimeout(() => {
            // Only remove if we're not hovering over the tooltip or node
            if (!this.hoverNode) {
                this.removeNodeTooltip();
            }
        }, 100);
    }
    
    private showNodeMetadata(node: GraphNode) {
        // If we're already showing a tooltip for this node, don't create another one
        if (this.tooltipVisible && this.nodeTooltip) {
            return;
        }
        
        // Do not show tooltip if drag operations are active
        if (this.isDragging || this.isResizing || this.isMovingCanvas) {
            return;
        }
        
        // Remove any existing tooltip
        this.removeNodeTooltip();
        
        // Create tooltip element
        this.nodeTooltip = this.canvas.createDiv({ cls: 'graph-node-tooltip' });
        
        // Add mouse events to keep tooltip open when hovering over it
        this.tooltipMouseEnterHandler = () => {
            // Keep the tooltip visible when mouse enters it
            this.hoverNode = node; // Keep the hover state active
        };
        
        this.tooltipMouseLeaveHandler = () => {
            // Remove the tooltip when mouse leaves it
            this.hoverNode = null;
            this.removeNodeTooltip();
        };
        
        this.nodeTooltip.addEventListener('mouseenter', this.tooltipMouseEnterHandler);
        this.nodeTooltip.addEventListener('mouseleave', this.tooltipMouseLeaveHandler);
        
        // Calculate position (to the right and slightly above the node)
        const nodeX = (node as any).x;
        const nodeY = (node as any).y;
        
        // Get SVG transform to calculate correct screen position
        const transform = d3.zoomTransform(this.svg.node()!);
        const screenX = transform.applyX(nodeX);
        const screenY = transform.applyY(nodeY);
        
        // Position the tooltip to the right and slightly above the node
        this.nodeTooltip.style.position = 'absolute';
        this.nodeTooltip.style.left = `${screenX + this.getNodeRadius(node) + 15}px`;
        this.nodeTooltip.style.top = `${screenY - 20}px`;
        this.nodeTooltip.style.backgroundColor = 'var(--background-primary)';
        this.nodeTooltip.style.color = 'var(--text-normal)';
        this.nodeTooltip.style.padding = '10px 12px';
        this.nodeTooltip.style.borderRadius = '8px';
        this.nodeTooltip.style.boxShadow = '0 2px 8px var(--background-modifier-box-shadow)';
        this.nodeTooltip.style.zIndex = '1000';
        // Set fixed width and height for consistent size across all tooltips
        this.nodeTooltip.style.width = '320px';
        this.nodeTooltip.style.minHeight = '200px';
        this.nodeTooltip.style.maxHeight = '400px';
        this.nodeTooltip.style.overflowY = 'auto';
        this.nodeTooltip.style.fontSize = 'var(--font-ui-small)';
        this.nodeTooltip.style.border = '1px solid var(--background-modifier-border)';
        (this.nodeTooltip.style as any)['backdropFilter'] = 'blur(8px)';
        (this.nodeTooltip.style as any)['-webkit-backdrop-filter'] = 'blur(8px)';
        
        // Add custom scrollbar styling to the tooltip container
        (this.nodeTooltip.style as any)['scrollbarWidth'] = 'thin';
        (this.nodeTooltip.style as any)['scrollbarColor'] = 'var(--background-modifier-border) transparent';
        
        // Add webkit scrollbar styling (for Chrome, Safari, etc.)
        const tooltipScrollbarStyle = document.createElement('style');
        tooltipScrollbarStyle.textContent = `
            .graph-node-tooltip::-webkit-scrollbar {
                width: 6px;
            }
            .graph-node-tooltip::-webkit-scrollbar-track {
                background: transparent;
            }
            .graph-node-tooltip::-webkit-scrollbar-thumb {
                background-color: var(--background-modifier-border);
                border-radius: 3px;
            }
        `;
        document.head.appendChild(tooltipScrollbarStyle);
        
        // Add title
        const title = this.nodeTooltip.createEl('h4', { text: node.name });
        title.style.margin = '0 0 8px 0';
        title.style.borderBottom = '1px solid var(--background-modifier-border)';
        title.style.paddingBottom = '6px';
        title.style.fontSize = 'var(--font-ui-medium)';
        title.style.fontWeight = 'var(--font-medium)';
        
        // Add metadata content
        const metadataContainer = this.nodeTooltip.createDiv({ cls: 'metadata-container' });
        
        // Get Obsidian metadata for the file
        if (node.path) {
            const file = this.app.vault.getAbstractFileByPath(node.path);
            if (file instanceof TFile) {
                // Get file metadata from Obsidian cache
                const metadata = this.app.metadataCache.getFileCache(file);
                
                // Create a note about double-click action
                const actionHint = this.nodeTooltip.createDiv({
                    cls: 'action-hint',
                    attr: { 'aria-label': 'Action hint' }
                });
                actionHint.style.textAlign = 'center';
                actionHint.style.marginBottom = '10px';
                
                // Create a button instead of text hint
                const openNoteBtn = actionHint.createEl('button', {
                    text: 'Open Note',
                    cls: 'open-note-button',
                });
                this.openNoteButton = openNoteBtn;
                
                // Style the button to match Obsidian's theme
                openNoteBtn.style.backgroundColor = 'var(--interactive-accent)';
                openNoteBtn.style.color = 'var(--text-on-accent)';
                openNoteBtn.style.border = 'none';
                openNoteBtn.style.borderRadius = '4px';
                openNoteBtn.style.padding = '6px 12px';
                openNoteBtn.style.cursor = 'pointer';
                openNoteBtn.style.fontWeight = 'var(--font-medium)';
                openNoteBtn.style.fontSize = 'var(--font-ui-small)';
                openNoteBtn.style.transition = 'background-color 0.1s ease';
                openNoteBtn.style.outline = 'none';
                
                // Add hover effect
                this.openNoteButtonMouseEnterHandler = () => {
                    if (this.openNoteButton) {
                        this.openNoteButton.style.backgroundColor = 'var(--interactive-accent-hover)';
                    }
                };
                
                this.openNoteButtonMouseLeaveHandler = () => {
                    if (this.openNoteButton) {
                        this.openNoteButton.style.backgroundColor = 'var(--interactive-accent)';
                    }
                };
                
                // Add click handler to open the note
                this.openNoteButtonClickHandler = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openNoteAndCloseGraph(node);
                };
                
                openNoteBtn.addEventListener('mouseenter', this.openNoteButtonMouseEnterHandler);
                openNoteBtn.addEventListener('mouseleave', this.openNoteButtonMouseLeaveHandler);
                openNoteBtn.addEventListener('click', this.openNoteButtonClickHandler);
                
                // Show creation and modification times
                const createdField = metadataContainer.createDiv({ cls: 'metadata-field' });
                createdField.createSpan({ text: 'Created: ', cls: 'metadata-label' });
                createdField.createSpan({ 
                    text: new Date(file.stat.ctime).toLocaleString(),
                    cls: 'metadata-value' 
                });
                
                const modifiedField = metadataContainer.createDiv({ cls: 'metadata-field' });
                modifiedField.createSpan({ text: 'Modified: ', cls: 'metadata-label' });
                modifiedField.createSpan({ 
                    text: new Date(file.stat.mtime).toLocaleString(),
                    cls: 'metadata-value' 
                });
                
                const sizeField = metadataContainer.createDiv({ cls: 'metadata-field' });
                sizeField.createSpan({ text: 'Size: ', cls: 'metadata-label' });
                sizeField.createSpan({ 
                    text: `${(file.stat.size / 1024).toFixed(2)} KB`,
                    cls: 'metadata-value' 
                });
                
                // Show tags if available
                if (metadata && metadata.tags && metadata.tags.length > 0) {
                    const tagsField = metadataContainer.createDiv({ cls: 'metadata-field' });
                    tagsField.createSpan({ text: 'Tags: ', cls: 'metadata-label' });
                    const tagsContainer = tagsField.createSpan({ cls: 'metadata-value metadata-tags' });
                    tagsContainer.style.display = 'flex';
                    tagsContainer.style.flexWrap = 'wrap';
                    tagsContainer.style.gap = '4px';
                    tagsContainer.style.marginTop = '4px';
                    
                    metadata.tags.forEach((tag) => {
                        const tagEl = tagsContainer.createSpan({ 
                            text: tag.tag,
                            cls: 'metadata-tag' 
                        });
                        tagEl.style.backgroundColor = 'var(--tag-background)';
                        tagEl.style.color = 'var(--tag-color)';
                        tagEl.style.borderRadius = '4px';
                        tagEl.style.padding = '2px 6px';
                        tagEl.style.fontSize = 'var(--font-ui-smaller)';
                        tagEl.style.display = 'inline-block';
                    });
                }
                
                // Show frontmatter if available
                if (metadata && metadata.frontmatter) {
                    const frontmatterField = metadataContainer.createDiv({ cls: 'metadata-section' });
                    frontmatterField.style.marginTop = '10px';
                    
                    const frontmatterTitle = frontmatterField.createEl('div', { 
                        text: 'Frontmatter', 
                        cls: 'metadata-section-title' 
                    });
                    frontmatterTitle.style.fontWeight = 'var(--font-medium)';
                    frontmatterTitle.style.fontSize = 'var(--font-ui-small)';
                    frontmatterTitle.style.marginBottom = '4px';
                    frontmatterTitle.style.color = 'var(--text-accent)';
                    
                    const frontmatterContent = frontmatterField.createDiv({ cls: 'frontmatter-content' });
                    frontmatterContent.style.marginTop = '4px';
                    frontmatterContent.style.fontSize = 'var(--font-ui-smaller)';
                    frontmatterContent.style.paddingLeft = '8px';
                    frontmatterContent.style.borderLeft = '2px solid var(--background-modifier-border)';
                    
                    // Filter out sensitive or system properties
                    const excludedProps = ['position', 'cssclass', 'tag', 'tags'];
                    
                    Object.entries(metadata.frontmatter).forEach(([key, value]) => {
                        if (!excludedProps.includes(key.toLowerCase())) {
                            const propDiv = frontmatterContent.createDiv({ cls: 'metadata-field' });
                            propDiv.createSpan({ 
                                text: `${key}: `, 
                                cls: 'metadata-label' 
                            });
                            
                            // Handle different value types
                            let displayValue: string;
                            if (value === null || value === undefined) {
                                displayValue = '';
                            } else if (Array.isArray(value)) {
                                displayValue = value.join(', ');
                            } else if (typeof value === 'object') {
                                try {
                                    displayValue = JSON.stringify(value);
                                } catch (e) {
                                    displayValue = '[Object]';
                                }
                            } else {
                                displayValue = String(value);
                            }
                            
                            propDiv.createSpan({ 
                                text: displayValue, 
                                cls: 'metadata-value' 
                            });
                        }
                    });
                }
                
                // Show backlinks count
                // Use the resolvedLinks from metadata cache to count backlinks
                const backlinksCount = Object.entries(this.app.metadataCache.resolvedLinks)
                    .filter(([sourcePath, targetLinks]) => targetLinks[file.path])
                    .length;
                
                const backlinksField = metadataContainer.createDiv({ cls: 'metadata-field' });
                backlinksField.createSpan({ text: 'Backlinks: ', cls: 'metadata-label' });
                backlinksField.createSpan({ 
                    text: `${backlinksCount}`,
                    cls: 'metadata-value' 
                });
                
                // Note preview section
                const previewSection = this.nodeTooltip.createDiv({ cls: 'note-preview-section' });
                previewSection.style.marginTop = '15px';
                previewSection.style.borderTop = '1px solid var(--background-modifier-border)';
                previewSection.style.paddingTop = '8px';
                
                const previewTitle = previewSection.createEl('div', {
                    text: 'Note Preview',
                    cls: 'preview-section-title'
                });
                previewTitle.style.fontWeight = 'var(--font-medium)';
                previewTitle.style.fontSize = 'var(--font-ui-small)';
                previewTitle.style.marginBottom = '6px';
                previewTitle.style.color = 'var(--text-accent)';
                
                // Create preview content container
                const previewContent = previewSection.createDiv({ cls: 'preview-content' });
                previewContent.style.fontSize = 'var(--font-ui-smaller)';
                previewContent.style.color = 'var(--text-normal)';
                previewContent.style.lineHeight = '1.5';
                // Remove max-height and overflow for preview content - no scrolling here
                previewContent.style.backgroundColor = 'var(--background-secondary)';
                previewContent.style.padding = '8px';
                previewContent.style.borderRadius = '4px';
                previewContent.style.whiteSpace = 'pre-wrap';
                previewContent.style.wordBreak = 'break-word';
                
                // Get file content and render preview
                this.app.vault.read(file).then(content => {
                    // Remove YAML frontmatter if present
                    let cleanContent = content;
                    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
                    if (frontmatterMatch) {
                        cleanContent = content.slice(frontmatterMatch[0].length);
                    }
                    
                    // Truncate content if too long (show first ~300 chars)
                    const maxPreviewLength = 500;
                    let previewText = cleanContent.trim().substring(0, maxPreviewLength);
                    if (cleanContent.length > maxPreviewLength) {
                        previewText += '...';
                    }
                    
                    // Replace line breaks with HTML breaks to preserve formatting
                    previewText = previewText.replace(/\n/g, '<br>');
                    
                    // Add some basic Markdown formatting
                    // Format headings
                    previewText = previewText.replace(/^(#{1,6})\s+(.+?)(<br>|$)/gm, (match, hashes, text, lineEnd) => {
                        const headingLevel = hashes.length;
                        return `<span style="font-weight: bold; font-size: ${1.2 - (headingLevel * 0.1)}em;">${text}</span>${lineEnd}`;
                    });
                    
                    // Format bold text
                    previewText = previewText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    
                    // Format italic text
                    previewText = previewText.replace(/\*(.+?)\*/g, '<em>$1</em>');
                    
                    // Format links
                    previewText = previewText.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="#" style="color: var(--text-accent);">$1</a>');
                    
                    // Format internal links
                    previewText = previewText.replace(/\[\[(.+?)\]\]/g, '<a href="#" style="color: var(--text-accent);">$1</a>');
                    
                    // Set HTML content with basic formatting
                    previewContent.innerHTML = previewText;
                    
                    // Remove scroll indicator
                }).catch(err => {
                    previewContent.setText('Unable to load note preview.');
                    previewContent.style.color = 'var(--text-error)';
                    previewContent.style.fontStyle = 'italic';
                });
                
                // Remove path info - we don't need to show it
            } else {
                // If file doesn't exist, show an error message
                const noteInfo = metadataContainer.createDiv({ cls: 'metadata-error' });
                noteInfo.createSpan({ 
                    text: 'Note not found in vault. It may have been renamed or deleted.',
                    cls: 'metadata-error-text'
                }).style.color = 'var(--text-error)';
            }
        } else {
            // No path information
            const errorInfo = metadataContainer.createDiv({ cls: 'metadata-error' });
            errorInfo.createSpan({ 
                text: 'No file path associated with this node.',
                cls: 'metadata-error-text'
            }).style.color = 'var(--text-error)';
        }
        
        // Style metadata label/value
        const labels = this.nodeTooltip.querySelectorAll('.metadata-label');
        const values = this.nodeTooltip.querySelectorAll('.metadata-value');
        const fields = this.nodeTooltip.querySelectorAll('.metadata-field');
        
        labels.forEach((label: Element) => {
            (label as HTMLElement).style.fontWeight = 'var(--font-medium)';
            (label as HTMLElement).style.color = 'var(--text-muted)';
            (label as HTMLElement).style.display = 'inline-block';
            (label as HTMLElement).style.minWidth = '80px';
        });
        
        values.forEach((value: Element) => {
            (value as HTMLElement).style.wordBreak = 'break-word';
        });
        
        fields.forEach((field: Element) => {
            (field as HTMLElement).style.marginBottom = '6px';
        });
    }
    
    private removeNodeTooltip() {
        if (this.nodeTooltip) {
            // Clean up event listeners
            if (this.tooltipMouseEnterHandler) {
                this.nodeTooltip.removeEventListener('mouseenter', this.tooltipMouseEnterHandler);
            }
            if (this.tooltipMouseLeaveHandler) {
                this.nodeTooltip.removeEventListener('mouseleave', this.tooltipMouseLeaveHandler);
            }
            
            // Clean up button event listeners
            if (this.openNoteButton) {
                if (this.openNoteButtonMouseEnterHandler) {
                    this.openNoteButton.removeEventListener('mouseenter', this.openNoteButtonMouseEnterHandler);
                }
                if (this.openNoteButtonMouseLeaveHandler) {
                    this.openNoteButton.removeEventListener('mouseleave', this.openNoteButtonMouseLeaveHandler);
                }
                if (this.openNoteButtonClickHandler) {
                    this.openNoteButton.removeEventListener('click', this.openNoteButtonClickHandler);
                }
                this.openNoteButton = null;
            }
            
            this.nodeTooltip.remove();
            this.nodeTooltip = null;
            this.tooltipVisible = false;
            this.tooltipMouseEnterHandler = null;
            this.tooltipMouseLeaveHandler = null;
            this.openNoteButtonMouseEnterHandler = null;
            this.openNoteButtonMouseLeaveHandler = null;
            this.openNoteButtonClickHandler = null;
        }
    }
    
    private openNoteAndCloseGraph(node: GraphNode) {
        if (node.path) {
            // Try to get the file
            const file = this.app.vault.getAbstractFileByPath(node.path);
            if (file instanceof TFile) {
                // Open the file
                this.app.workspace.getLeaf().openFile(file);
                
                // Close the graph view
                // Notify plugin that we've been closed
                const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
                if (plugin) {
                    plugin.graphView = null;
                }
                
                // Clean up
                this.onunload();
                this.canvas.remove();
            } else {
                new Notice(`Could not find file at path: ${node.path}`);
            }
        } else {
            new Notice('This node has no associated file path.');
        }
    }

    private drag() {
        // Use consistent colors
        const primaryNodeColor = 'var(--interactive-accent)';
        const defaultLinkColor = 'var(--graph-line)';
        
        return d3.drag<SVGCircleElement, GraphNode>()
            .on('start', (event, d) => {
                // Set dragging state first
                this.isDragging = true;
                
                if (!event.active) {
                    // Reduce alpha target to make movement smoother
                    this.simulation.alphaTarget(0.1).restart();
                }
                (d as any).fx = (d as any).x;
                (d as any).fy = (d as any).y;
                
                // Clear hover state and remove tooltip when dragging starts
                this.hoverNode = null;
                if (this.hoverTimeout !== null) {
                    window.clearTimeout(this.hoverTimeout);
                    this.hoverTimeout = null;
                }
                this.removeNodeTooltip();
                
                // Add dragging class to parent SVG to disable transitions
                this.svg.classed('dragging', true);
                
                // Highlight connections when dragging starts - without transitions
                this.highlightConnections(d.id, true, false);
                
                // Store the dragged node ID
                this.draggedNode = d;
            })
            .on('drag', (event, d) => {
                (d as any).fx = event.x;
                (d as any).fy = event.y;
                
                // Update highlighting without transitions during drag
                if (this.draggedNode) {
                    this.highlightConnections(this.draggedNode.id, true, false);
                }
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                (d as any).fx = null;
                (d as any).fy = null;
                
                // Remove dragging class to re-enable transitions
                this.svg.classed('dragging', false);
                
                // Remove highlighting when dragging ends - with transitions
                this.highlightConnections(d.id, false, true);
                
                // Reset dragging states
                this.isDragging = false;
                this.draggedNode = null;
            });
    }

    private async loadVaultData() {
        try {
            // Reset hover state
            this.hoverNode = null;
            this.hoverTimeout = null;
            this.tooltipVisible = false;
            
            // Build the graph data
            const graphData = await this.buildGraphData();
            
            // Calculate degree centrality using WASM
            const centralityResults = this.calculateCentrality(graphData);
            
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
            
            // Update simulation
            this.simulation.nodes(this.nodes);
            const linkForce = this.simulation.force('link') as d3.ForceLink<GraphNode, GraphLink>;
            linkForce.links(this.links);
            
            // Update collision detection radius based on node sizes
            const collisionForce = this.simulation.force('collision') as d3.ForceCollide<GraphNode>;
            collisionForce.radius(d => this.getNodeRadius(d) + 24); // Match the padding with initialization
            
            // Arrange nodes in an initial circular layout
            this.initializeCircularPositions();
            
            // Restart simulation with higher alpha for better initial layout
            this.simulation.alpha(1).restart();
            
            // Force immediate update for initial rendering
            for (let i = 0; i < 30; ++i) this.simulation.tick();
            
            // Ensure all nodes are visible in the canvas
            setTimeout(() => this.ensureNodesAreVisible(), 100);
        } catch (error) {
            console.error('Error loading vault data:', error);
            throw error;
        }
    }

    private async buildGraphData(): Promise<GraphData> {
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

    private onMouseDown(e: MouseEvent) {
        if (e.target instanceof HTMLElement && e.target.closest('.graph-analysis-drag-handle')) {
            this.isDragging = true;
            this.startX = e.clientX - parseInt(this.canvas.style.left);
            this.startY = e.clientY - parseInt(this.canvas.style.top);
            
            // Close any open tooltips when dragging the canvas
            this.removeNodeTooltip();
            
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private onResizeStart(e: MouseEvent) {
        if (e.target instanceof HTMLElement && e.target.closest('.graph-analysis-resize-handle')) {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.startWidth = this.canvas.offsetWidth;
            this.startHeight = this.canvas.offsetHeight;
            
            // Close any open tooltips when resizing the canvas
            this.removeNodeTooltip();
            
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private onMouseMove(e: MouseEvent) {
        if (this.isDragging) {
            const newX = e.clientX - this.startX;
            const newY = e.clientY - this.startY;
            
            // Ensure the canvas stays within viewport bounds
            const maxX = window.innerWidth - this.canvas.offsetWidth;
            const maxY = window.innerHeight - this.canvas.offsetHeight;
            
            this.canvas.style.left = `${Math.max(0, Math.min(maxX, newX))}px`;
            this.canvas.style.top = `${Math.max(0, Math.min(maxY, newY))}px`;
            e.preventDefault();
            e.stopPropagation();
        } else if (this.isResizing) {
            const newWidth = Math.max(300, this.startWidth + (e.clientX - this.startX));
            const newHeight = Math.max(200, this.startHeight + (e.clientY - this.startY));
            
            // Ensure the canvas doesn't resize beyond viewport bounds
            const maxWidth = window.innerWidth - parseInt(this.canvas.style.left);
            const maxHeight = window.innerHeight - parseInt(this.canvas.style.top);
            
            const width = Math.min(maxWidth, newWidth);
            const height = Math.min(maxHeight, newHeight);
            
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
            
            // Update the graph transform to scale proportionally
            this.updateGraphTransform();
            
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private onMouseUp(e: MouseEvent) {
        this.isDragging = false;
        this.isResizing = false;
    }

    private onResizeEnd() {
        if (!this.isResizing) return;
        
        // Update based on final size
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight - 32; // Account for title bar
        
        // Update SVG dimensions
        this.svg
            .attr('width', this.width)
            .attr('height', this.height);
        
        // Update simulation forces that depend on canvas size
        this.simulation
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('boundary', this.createBoundaryForce());
            
        // Restart simulation with an increased alpha to adjust layout
        this.simulation.alpha(0.3).restart();
        
        this.isResizing = false;
    }

    // Return the canvas element for external access
    public getCanvas(): HTMLElement {
        return this.canvas;
    }

    public onunload() {
        // Clear any pending hover timeouts
        if (this.hoverTimeout !== null) {
            window.clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }
        
        // Clear hover state
        this.hoverNode = null;
        this.tooltipVisible = false;
        this.tooltipMouseEnterHandler = null;
        this.tooltipMouseLeaveHandler = null;
        this.openNoteButton = null;
        this.openNoteButtonMouseEnterHandler = null;
        this.openNoteButtonMouseLeaveHandler = null;
        this.openNoteButtonClickHandler = null;
        
        // Remove any tooltips
        this.removeNodeTooltip();
        
        // Clean up event listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
        
        // Clean up D3
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    // Check if mouse buttons are pressed (used during mousemove event)
    private isMouseButtonPressed(event: MouseEvent): boolean {
        return event && event.buttons !== 0;
    }

    // Add method to ensure all nodes are visible within canvas
    private ensureNodesAreVisible() {
        if (!this.nodes.length) return;
        
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
        
        // Find the bounds of all nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            const x = (node as any).x || 0;
            const y = (node as any).y || 0;
            const r = this.getNodeRadius(node);
            
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
        const canvasCenterX = width / 2;
        const canvasCenterY = height / 2;
        
        // Calculate scale to fit everything
        const scaleX = width * 0.9 / graphWidth; // Leave 5% margin on each side
        const scaleY = height * 0.9 / graphHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // Set initial zoom transform to fit all nodes
        const initialTransform = d3.zoomIdentity
            .translate(canvasCenterX, canvasCenterY)
            .scale(scale > 1 ? 1 : scale) // Don't zoom in, only zoom out if needed
            .translate(-graphCenterX, -graphCenterY);
            
        this.svg.call(this.zoom.transform, initialTransform);
    }

    // Initialize node positions in a circular layout
    private initializeCircularPositions() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32;
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Sort nodes by degree (highest to lowest)
        // This places the most connected nodes on the outer rings
        const sortedNodes = [...this.nodes].sort((a, b) => {
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

    // Create a force to prevent label overlaps
    private createLabelAvoidanceForce() {
        return (alpha: number) => {
            const k = alpha * 0.2; // Force strength factor
            
            // Use quadtree for efficient collision detection
            const quadtree = d3.quadtree<{x: number, y: number, node: GraphNode, isLabel: boolean, width: number, height: number}>()
                .x(d => d.x)
                .y(d => d.y)
                .addAll(
                    // First add all nodes
                    this.nodes.map(node => ({
                        x: (node as any).x,
                        y: (node as any).y,
                        node: node,
                        isLabel: false,
                        width: this.getNodeRadius(node) * 2,
                        height: this.getNodeRadius(node) * 2
                    }))
                    // Then add all labels (positioned below their nodes)
                    .concat(this.nodes.map(node => ({
                        x: (node as any).x,
                        y: (node as any).y + this.getNodeRadius(node) + 15,
                        node: node,
                        isLabel: true,
                        width: (node.name?.length || 0) * 6.5,
                        height: 14
                    })))
                );
            
            // Process each label to avoid overlaps
            this.nodes.forEach(node => {
                if (!node.x || !node.y) return;
                
                // Skip nodes that are being dragged
                if ((node as any).fx !== undefined && (node as any).fy !== undefined) return;
                
                // Get the label position (below the node)
                const labelX = (node as any).x;
                const labelY = (node as any).y + this.getNodeRadius(node) + 15;
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
}