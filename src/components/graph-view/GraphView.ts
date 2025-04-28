import { App, Notice, TFile } from 'obsidian';
import * as d3 from 'd3';
import { CentralityCalculator } from './types';
import { CentralityCalculator as CentralityCalculatorImpl } from './data/centrality';
import { GraphDataBuilder } from './data/graph-builder';

// Define the link type for D3 simulation
interface SimulationGraphLink {
    source: string | SimulationGraphNode;
    target: string | SimulationGraphNode;
}

// Define the type for cached node neighbors
interface NodeNeighborsCache {
    nodeId: number; // ID of the node whose neighbors are cached
    neighbors: Set<number>; // Set of neighbor node IDs
    timestamp?: number; // Optional: for future cache invalidation
}

interface SimulationGraphNode {
    id: string;
    name: string;
    path: string;
    degreeCentrality: number;
    highlighted?: boolean;
    dimmed?: boolean;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
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
    private width: number;
    private height: number;
    
    // Core components
    private graphDataBuilder: GraphDataBuilder;
    private centralityCalculator: CentralityCalculatorImpl;
    
    // Animation and timing constants
    private readonly ANIMATION = {
        DURATION: 200,
        RECENTER_DURATION: 300,
        TOOLTIP_DELAY: 500
    } as const;

    // Node visualization constants
    private readonly NODE = {
        RADIUS: {
            BASE: 4,
            MAX: 12,
            SCALE_FACTOR: 0.69
        }
    } as const;

    // Zoom behavior constants
    private readonly ZOOM = {
        OUT_SCALE_FACTOR: 600,
        IN_SCALE_FACTOR: 60,
        CONTAINER_SCALE: 0.6 // The graph should use 60% of the minimum dimension
    } as const;

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
    
    // Add this property at the class level after the private readonly constants section
    private currentTooltip: HTMLElement | null = null;

    // New tooltip timeout
    private _hideTooltipTimeout: number | null = null;

    // Event handlers
    private vaultModifyHandler: (file: TFile) => void;
    private vaultCreateHandler: (file: TFile) => void;
    private vaultDeleteHandler: (file: TFile) => void;
    private vaultRenameHandler: (file: TFile, oldPath: string) => void;
    private debounceTimeout: number | null = null;

    constructor(app: App, calculateDegreeCentrality?: CentralityCalculator) {
        this.app = app;
        
        // Initialize core modules
        this.centralityCalculator = new CentralityCalculatorImpl(calculateDegreeCentrality);
        this.graphDataBuilder = new GraphDataBuilder(app);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Get initial dimensions from container
        const rect = container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        
        // Set up the visualization
        this.initializeD3();
        
        // Setup visibility detection
        this.setupVisibilityObserver();

        // Setup vault event handlers
        this.setupVaultEventHandlers();
        
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
        
        // Create SVG container with centered viewBox
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', [
                -this.width / 2,
                -this.height / 2,
                this.width,
                this.height
            ].join(' '))
            .style('display', 'block')
            .style('max-width', 'none')
            .style('max-height', 'none')
            .attr('class', 'graph-view-svg');

        // Create the main SVG group
        this.svgGroup = this.svg.append('g');
        
        // Create groups for links, nodes, and labels
        const linksGroup = this.svgGroup.append('g')
            .attr('class', 'links-group')
            .style('stroke', 'var(--graph-link-color-default)')
            .style('stroke-width', 'var(--graph-link-width-default)')
            .style('stroke-opacity', 'var(--graph-link-opacity-default)');
            
        const nodesGroup = this.svgGroup.append('g')
            .attr('class', 'nodes-group')
            .style('fill', 'var(--graph-node-color-default)')
            .style('opacity', 'var(--graph-node-opacity-default)');

        const labelsGroup = this.svgGroup.append('g')
            .attr('class', 'labels-group')
            .style('fill', 'var(--graph-label-color)')
            .style('font-size', 'var(--graph-label-font-size)')
            .style('opacity', 'var(--graph-label-opacity)')
            .style('pointer-events', 'none')
            .style('text-anchor', 'middle');

        // Initialize selections
        this.linksSelection = linksGroup.selectAll('line');
        this.nodesSelection = nodesGroup.selectAll('circle');
        this.labelsSelection = labelsGroup.selectAll('text');
        
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
            const defaultRadius = this.NODE.RADIUS.BASE;
            const minZoom = this.width / (defaultRadius * this.ZOOM.OUT_SCALE_FACTOR);
            const maxZoom = this.width / (defaultRadius * this.ZOOM.IN_SCALE_FACTOR);
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
        const avgRadius = nodeCount > 0 ? totalRadius / nodeCount : this.NODE.RADIUS.BASE;
        // Use max node radius for max zoom (to prevent largest nodes from getting too big)
        const largestRadius = maxRadius > 0 ? maxRadius : this.NODE.RADIUS.BASE;
        
        // Calculate zoom limits based on these statistics
        const minZoom = this.width / (avgRadius * this.ZOOM.OUT_SCALE_FACTOR);
        const maxZoom = this.width / (largestRadius * this.ZOOM.IN_SCALE_FACTOR);
        
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
                this.container.addClass('zooming');
            })
            .on('zoom', (event) => {
                // Update SVG group transform
                this.svgGroup.attr('transform', event.transform);
                
                // Request a frame to update labels
                if (!this._frameRequest) {
                    this._frameRequest = window.requestAnimationFrame(() => {
                        this.updateGraph();
                        this._frameRequest = null;
                    });
                }
            })
            .on('end', () => {
                this.container.removeClass('zooming');
                this.restartSimulationGently();
            });
            
        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Initial transform to show the entire graph
        this.recenterGraph();
    }


    /**
     * Initialize the force simulation with modified forces to better fill the available space
     */
    private initializeSimulation() {
        // Create a simulation with modified forces to better fill the available space
        const collisionRadius = this.getNodeRadius() + 2;
        
        this.simulation = d3.forceSimulation<SimulationGraphNode>()
            .force('link', d3.forceLink<SimulationGraphNode, SimulationGraphLink>()
                .id(d => d.id)
                .distance(50)
                .strength(0.7)) // Slightly reduced for smoother movement
            .force('charge', d3.forceManyBody()
                .strength(-120)
                .distanceMax(300)) // Limit the distance of charge effect
            .force('x', d3.forceX().strength(0.15)) // Increased for better centering stability
            .force('y', d3.forceY().strength(0.15)) // Increased for better centering stability
            .force('collision', d3.forceCollide<SimulationGraphNode>()
                .radius(d => collisionRadius)
                .strength(0.5) // Reduced for smoother collisions
                .iterations(2))
            .alphaDecay(0.02) // Slower decay for smoother transitions
            .velocityDecay(0.35) // Slightly increased for more stability
            .on('tick', () => {
                this.applyBoundingForce();
                
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
            .attr('x', d => (d.x || 0)) // Center horizontally with node
            .attr('y', d => {
                const radius = this.getNodeRadius(d);
                const margin = parseInt(getComputedStyle(document.documentElement)
                    .getPropertyValue('--graph-label-margin')
                    .trim()) || 8;
                return (d.y || 0) + radius + margin;
            });
    }
    
    private updateDimensions() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        
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

        this.resizeObserver = new ResizeObserver((entries) => {
            const containerEntry = entries.find(entry => entry.target === this.container);
            if (!containerEntry) return;

            // Check if the graph is still active and has valid elements
            if (!this.container || !this.svg || !this.svgGroup) {
                // If graph is inactive, disconnect the observer
                if (this.resizeObserver) {
                    this.resizeObserver.disconnect();
                    this.resizeObserver = null;
                }
                return;
            }

            try {
                // Get new container dimensions
                const rect = this.container.getBoundingClientRect();
                this.width = rect.width;
                this.height = rect.height;

                // Check if dimensions are valid numbers
                if (!isFinite(this.width) || !isFinite(this.height) || this.width <= 0 || this.height <= 0) {
                    return;
                }

                // Update the SVG viewBox to match new container size
                this.svg.attr('viewBox', [
                    -this.width / 2,
                    -this.height / 2,
                    this.width,
                    this.height
                ].join(' '));

                // Use recenterGraph to maintain consistent scaling behavior
                // Only proceed if we have valid nodes and the simulation is active
                if (this.nodes.length > 0 && this.simulation) {
                    this.recenterGraph(false); // false to skip animation during resize
                }
            } catch (error) {
                console.warn('Error in resize observer:', error);
                // If we encounter an error, it's safer to disconnect the observer
                if (this.resizeObserver) {
                    this.resizeObserver.disconnect();
                    this.resizeObserver = null;
                }
            }
        });

        // Start observing the container
        if (this.container) {
            this.resizeObserver.observe(this.container);
        }
    }
    
    private setupNodeEventHandlers() {
        // Add hover and click interactivity
        this.nodesSelection
            .on('mouseover', this.onNodeMouseOver.bind(this))
            .on('mouseout', this.onNodeMouseOut.bind(this))
            .on('click', this.onNodeClick.bind(this));
    }
    
    private onNodeMouseOver(event: any, d: SimulationGraphNode) {
        // Don't process mouseover during drag operations
        if (this.isDraggingNode) {
            return;
        }

        // Clear any existing hide timeout
        if (this._hideTooltipTimeout) {
            window.clearTimeout(this._hideTooltipTimeout);
            this._hideTooltipTimeout = null;
        }

        // Set the highlighted node ID
        this.highlightedNodeId = d.id;
        
        // Highlight the node visually
        this.highlightNode(event.currentTarget, true);
        
        // Highlight connections
        this.highlightConnections(d.id, true);
        
        // Only show tooltip if not dragging
        if (!this.isDraggingNode) {
            // Handle tooltip with delay
            this.scheduleTooltip(d, event);
        }
    }
    
    private onNodeMouseOut(event: any, d: SimulationGraphNode) {
        // Don't process mouseout during drag operations
        if (this.isDraggingNode) {
            return;
        }
        
        // Remove visual highlight
        this.highlightNode(event.currentTarget, false);
        
        // Remove connections highlight
        this.highlightConnections(d.id, false);
        
        // Schedule tooltip removal with delay
        this.scheduleTooltipRemoval();
        
        this.highlightedNodeId = null;
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
    
    private createTooltip(node: SimulationGraphNode, event: any) {
        // Remove existing tooltip if any
        this.removeNodeTooltip();

        // Create tooltip
        const tooltip = this.container.createDiv({ cls: 'graph-node-tooltip' });
        this.currentTooltip = tooltip;

        // Add mouse enter/leave handlers for the tooltip itself
        tooltip.addEventListener('mouseenter', () => {
            if (this._hideTooltipTimeout) {
                clearTimeout(this._hideTooltipTimeout);
                this._hideTooltipTimeout = null;
            }
        });

        tooltip.addEventListener('mouseleave', () => {
            this.scheduleTooltipRemoval();
        });

        // Add title
        tooltip.createEl('h4', { text: node.name, cls: 'node-tooltip-title' });
        
        // Add metadata content
        const metadataContainer = tooltip.createDiv({ cls: 'metadata-container' });
        
        // Get Obsidian metadata for the file
        if (node.path) {
            const file = this.app.vault.getAbstractFileByPath(node.path);
            if (file instanceof TFile) {
                // Get file metadata from Obsidian cache
                const metadata = this.app.metadataCache.getFileCache(file);
                
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
                    
                    metadata.tags.forEach((tag) => {
                        tagsContainer.createSpan({ 
                            text: tag.tag,
                            cls: 'metadata-tag' 
                        });
                    });
                }
                
                // Show frontmatter if available
                if (metadata && metadata.frontmatter) {
                    const frontmatterField = metadataContainer.createDiv({ cls: 'metadata-section' });
                    const frontmatterTitle = frontmatterField.createEl('div', { 
                        text: 'Frontmatter', 
                        cls: 'metadata-section-title' 
                    });
                    
                    const frontmatterContent = frontmatterField.createDiv({ cls: 'frontmatter-content' });
                    
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

                // Create a button to open the note
                const actionHint = metadataContainer.createDiv({ cls: 'action-hint' });
                const openNoteBtn = actionHint.createEl('button', {
                    text: 'Open Note',
                    cls: 'open-note-button',
                });
                
                // Add click handler to open the note
                openNoteBtn.addEventListener('click', (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (node.path) {
                        const file = this.app.vault.getAbstractFileByPath(node.path);
                        if (file instanceof TFile) {
                            this.app.workspace.getLeaf().openFile(file);
                        }
                    }
                });
                
                // Note preview section
                const previewSection = tooltip.createDiv({ cls: 'note-preview-section' });
                previewSection.createEl('div', {
                    text: 'Note Preview',
                    cls: 'preview-section-title'
                });
                
                // Create preview content container
                const previewContent = previewSection.createDiv({ cls: 'preview-content' });
                
                // Load and format note content
                this.app.vault.read(file).then(content => {
                    let previewText = content.slice(0, 500) + (content.length > 500 ? '...' : '');
                    
                    // Format headings
                    previewText = previewText.replace(/^(#{1,6})\s+(.+?)$/gm, (_, hashes, text) => {
                        const lineEnd = '\n';
                        const headingLevel = hashes.length;
                        return `<span style="font-weight: bold; font-size: ${1.2 - (headingLevel * 0.1)}em;">${text}</span>${lineEnd}`;
                    });
                    
                    // Format bold text
                    previewText = previewText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    
                    // Format italic text
                    previewText = previewText.replace(/\*(.+?)\*/g, '<em>$1</em>');
                    
                    // Format links
                    previewText = previewText.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="#" style="color: var(--text-accent);">$1</a>');
                    
                    // Set HTML content with basic formatting
                    previewContent.innerHTML = previewText;
                }).catch(err => {
                    previewContent.setText('Unable to load note preview.');
                    previewContent.classList.add('metadata-error-text');
                });
            } else {
                // If file doesn't exist, show an error message
                const noteInfo = metadataContainer.createDiv({ cls: 'metadata-error' });
                noteInfo.createSpan({ 
                    text: 'Note not found in vault. It may have been renamed or deleted.',
                    cls: 'metadata-error-text'
                });
            }
        } else {
            // No path information
            const errorInfo = metadataContainer.createDiv({ cls: 'metadata-error' });
            errorInfo.createSpan({ 
                text: 'No file path associated with this node.',
                cls: 'metadata-error-text'
            });
        }

        // Position tooltip at mouse location
        const containerRect = this.container.getBoundingClientRect();
        this.positionTooltip(tooltip, event.clientX - containerRect.left, event.clientY - containerRect.top, containerRect);
    }

    private getTooltipSetting(settingName: string): number {
        const workspace = document.querySelector('.workspace');
        if (!workspace) {
            console.warn('Workspace element not found for tooltip settings');
            return 0;
        }
        
        const value = getComputedStyle(workspace)
            .getPropertyValue(`--graph-tooltip-${settingName}`)
            .trim();
        return parseInt(value) || 0;
    }

    private positionTooltip(
        tooltip: HTMLElement,
        mouseX: number,
        mouseY: number,
        containerRect: DOMRect
    ): void {
        // Get dimensions from CSS variables
        const tooltipWidth = this.getTooltipSetting('width');
        const tooltipHeight = this.getTooltipSetting('height');
        const offsetX = this.getTooltipSetting('offset-x');
        const offsetY = this.getTooltipSetting('offset-y');
        

        // Initial position (prefer showing below and to the right of cursor)
        let tooltipX = mouseX + offsetX;
        let tooltipY = mouseY + offsetY;
        
        // Flip to left side if it would go off right edge
        if (tooltipX + tooltipWidth > containerRect.width) {
            tooltipX = mouseX - offsetX - tooltipWidth;
        }
        
        // Flip to above cursor if it would go off bottom edge
        if (tooltipY + tooltipHeight > containerRect.height) {
            tooltipY = mouseY - offsetY - tooltipHeight;
        }
        
        // Apply the calculated position
        tooltip.style.display = 'block';
        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${tooltipY}px`;
    }
    
    private highlightConnections(nodeId: string, highlight: boolean) {
        // Don't reset highlights during drag operations
        if (!highlight && this.isDraggingNode && this.highlightedNodeId === nodeId) {
            return;
        }

        if (!highlight) {
            this.resetHighlights();
            return;
        }
        
        // Store animation duration in a local variable to use in callbacks
        const animationDuration = this.ANIMATION.DURATION;
        
        // Find connected nodes
        let connectedNodeIds = new Set<number>();
        
        // Check if we have a valid cache for this node
        const nodeIdInt = parseInt(nodeId);
        const cacheValid = this.nodeNeighborsCache && 
                           this.nodeNeighborsCache.nodeId === nodeIdInt;
        
        // If we're in a drag operation or we have a valid cache, use the cached data
        if ((this.isDraggingNode && this.highlightedNodeId === nodeId) || cacheValid) {
            if (this.nodeNeighborsCache) {
                connectedNodeIds = this.nodeNeighborsCache.neighbors;
            }
        } else {
            // No cache hit, need to get data from WASM
            try {
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
                        connectedNodeIds.add(neighbor.node_id);
                    });
                    
                    // Update the cache with the new data
                    this.nodeNeighborsCache = {
                        nodeId: nodeIdInt,
                        neighbors: connectedNodeIds
                    };
                } else if (neighborResult && neighborResult.error) {
                    console.error(`Error from WASM neighbor function: ${neighborResult.error}`);
                    throw new Error(neighborResult.error);
                } else {
                    console.error('Unexpected result format from WASM neighbor function', neighborResult);
                    throw new Error('Unexpected result format from WASM');
                }
            } catch (error) {
                console.error('Error in highlightConnections with WASM:', error);
                this.nodeNeighborsCache = null;
                
                try {
                    const plugin = (this.app as any).plugins.plugins['obsidian-graph-analysis'];
                    if (plugin && plugin.initializeGraphCache) {
                        const wasmGraphData = {
                            nodes: this.nodes.map(node => node.name),
                            edges: this.links.map(link => {
                                const source = typeof link.source === 'string' ? parseInt(link.source) : parseInt((link.source as unknown as SimulationGraphNode).id);
                                const target = typeof link.target === 'string' ? parseInt(link.target) : parseInt((link.target as unknown as SimulationGraphNode).id);
                                return [source, target];
                            })
                        };
                        
                        plugin.initializeGraphCache(JSON.stringify(wasmGraphData))
                            .then(() => {
                                console.log('Graph cache reinitialized after error');
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
                return;
            }
        }
        
        // Dim all nodes and links not connected
        this.nodesSelection.each(function(d) {
            const isSelected = d.id === nodeId;
            const isConnected = isSelected || connectedNodeIds.has(parseInt(d.id));
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .style('fill', isSelected ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)')
                .style('opacity', isConnected ? 'var(--graph-node-opacity-default)' : 'var(--graph-node-opacity-dimmed)');
        });
        
        this.linksSelection.each(function(d) {
            const sourceId = typeof d.source === 'string' ? d.source : (d.source as unknown as SimulationGraphNode).id;
            const targetId = typeof d.target === 'string' ? d.target : (d.target as unknown as SimulationGraphNode).id;
            const isConnected = sourceId === nodeId || targetId === nodeId;
            
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .style('stroke', isConnected ? 'var(--graph-link-color-highlighted)' : 'var(--graph-link-color-default)')
                .style('stroke-width', isConnected ? 'var(--graph-link-width-highlighted)' : 'var(--graph-link-width-default)')
                .style('stroke-opacity', isConnected ? 'var(--graph-link-opacity-default)' : 'var(--graph-link-opacity-dimmed)');
        });

        // Update label styles based on node connection state
        this.labelsSelection.each(function(d) {
            const isSelected = d.id === nodeId;
            const isConnected = isSelected || connectedNodeIds.has(parseInt(d.id));
            d3.select(this)
                .transition()
                .duration(animationDuration)
                .style('fill', isSelected ? 'var(--graph-label-color-highlighted)' : 'var(--graph-label-color)')
                .style('opacity', isConnected ? 'var(--graph-label-opacity-highlighted)' : 'var(--graph-label-opacity-dimmed)');
        });
    }
    
    private resetHighlights() {
        // Clear the neighbors cache when resetting highlights
        this.nodeNeighborsCache = null;
        
        // Store animation duration in a local variable for consistency with other methods
        const animationDuration = this.ANIMATION.DURATION;
        
        // Reset all nodes, links, and labels to default state
        this.nodesSelection
            .transition()
            .duration(animationDuration)
            .style('opacity', 'var(--graph-node-opacity-default)')
            .style('fill', 'var(--graph-node-color-default)');
            
        // Reset links to default style
        this.linksSelection
            .transition()
            .duration(animationDuration)
            .style('stroke-opacity', 'var(--graph-link-opacity-default)')
            .style('stroke-width', 'var(--graph-link-width-default)')
            .style('stroke', 'var(--graph-link-color-default)');

        // Reset labels to default style
        this.labelsSelection
            .transition()
            .duration(animationDuration)
            .style('opacity', 'var(--graph-label-opacity)')
            .style('fill', 'var(--graph-label-color)');
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
                    
                    // Set drag state and remove tooltip
                    this.isDraggingNode = true;
                    this.clearTooltipTimeout();
                    this.removeNodeTooltip();
                    
                    // Apply node highlighting if not already highlighted
                    this.highlightedNodeId = d.id;
                    this.highlightNode(event.sourceEvent.currentTarget, true);
                    this.highlightConnections(d.id, true);
                } catch (e) {
                    console.error("Error in drag start:", e);
                }
            })
            .on('drag', (event, d) => {
                try {
                    d.fx = event.x;
                    d.fy = event.y;
                    
                    // Ensure highlight state is maintained during drag
                    if (this.highlightedNodeId !== d.id) {
                        this.highlightedNodeId = d.id;
                        this.highlightNode(event.sourceEvent.currentTarget, true);
                        this.highlightConnections(d.id, true);
                    }
                } catch (e) {
                    console.error("Error in drag:", e);
                }
            })
            .on('end', (event, d) => {
                try {
                    const wasFixed = d.fx !== null || d.fy !== null;
                    
                    // Clear fixed position if shift key is not pressed
                    if (!event.sourceEvent.shiftKey) {
                        d.fx = null;
                        d.fy = null;
                    }

                    // Gently transition the simulation
                    if (this.simulation) {
                        if (wasFixed && !event.sourceEvent.shiftKey) {
                            // If we're releasing a fixed node, use a gentler transition
                            this.simulation
                                .alphaTarget(0)
                                .alpha(0.1) // Start with a lower alpha for gentler movement
                                .restart();
                        } else {
                            // For other cases (like fixing a node), stop more quickly
                            this.simulation.alphaTarget(0);
                        }
                    }

                    // Check if mouse is still over the node
                    const element = event.sourceEvent.target;
                    const bounds = element.getBoundingClientRect();
                    const mouseX = event.sourceEvent.clientX;
                    const mouseY = event.sourceEvent.clientY;
                    
                    const isMouseOver = mouseX >= bounds.left && mouseX <= bounds.right && 
                                      mouseY >= bounds.top && mouseY <= bounds.bottom;

                    // Reset drag state
                    this.isDraggingNode = false;

                    if (!isMouseOver) {
                        // Only reset highlights if mouse is not over the node
                        setTimeout(() => {
                            if (!this.isDraggingNode && this.highlightedNodeId === d.id) {
                                this.highlightNode(element, false);
                                this.highlightConnections(d.id, false);
                                this.highlightedNodeId = null;
                            }
                        }, this.ANIMATION.DURATION);
                    }
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
            .duration(this.ANIMATION.DURATION)
            .style('fill', highlight ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)');
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
                this.createTooltip(node, event);
            }
            this._tooltipTimeout = null;
        }, this.ANIMATION.TOOLTIP_DELAY);
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
                    degreeCentrality: 0, // Will be updated by centrality calculation
                    x: undefined,
                    y: undefined,
                    vx: undefined,
                    vy: undefined,
                    fx: undefined,
                    fy: undefined
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
                    node.degreeCentrality = centralityResult.score;
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
        } catch (error) {
            console.error('Failed to initialize graph cache:', error);
            new Notice(`Graph initialization failed: ${(error as Error).message || 'Unknown error'}`);
        }
        
        // Create D3 selections for the graph elements
        this.linksSelection = this.svgGroup.select('.links-group')
            .selectAll<SVGLineElement, SimulationGraphLink>('line')
            .data(this.links, d => `${d.source}-${d.target}`)
            .join(
                enter => enter.append('line')
                    .style('stroke', 'var(--graph-link-color-default)')
                    .style('stroke-width', 'var(--graph-link-width-default)')
                    .style('stroke-opacity', 'var(--graph-link-opacity-default)')
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
                    const nodeEnter = enter.append('circle')
                        .attr('r', d => this.getNodeRadius(d))
                        .style('fill', 'var(--graph-node-color-default)')
                        .style('stroke', 'var(--graph-node-color-default)')
                        .style('stroke-width', 'var(--graph-node-stroke-width)')
                        .style('opacity', 'var(--graph-node-opacity-default)')
                        .call(this.setupDragBehavior());
                    
                    nodeEnter.style('fill', d => d.highlighted ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)')
                            .style('opacity', d => d.dimmed ? 'var(--graph-node-opacity-dimmed)' : 'var(--graph-node-opacity-default)');
                    
                    return nodeEnter;
                },
                update => update,
                exit => exit.remove()
            );

        // Add labels with proper data binding and update handling
        this.labelsSelection = this.svgGroup.select('.labels-group')
            .selectAll<SVGTextElement, SimulationGraphNode>('text')
            .data(this.nodes, d => d.id) // Use the same key function as nodes
            .join(
                enter => enter.append('text')
                    .text(d => d.name)
                    .attr('class', 'graph-label')
                    .style('pointer-events', 'none')
                    .style('text-anchor', 'middle'),
                update => update.text(d => d.name), // Update text content on update
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
            this.simulation.alpha(1).restart();
        }
    }
    
    /**
     * Calculate node radius based on centrality and other factors
     */
    private getNodeRadius(node?: SimulationGraphNode | null): number {
        if (!node) {
            return this.NODE.RADIUS.BASE;
        }
        
        // Scale node size based on centrality or degree
        if (node.degreeCentrality !== undefined && node.degreeCentrality > 0) {
            // Find a normalized value between 0 and 1 for the centrality score
            // We'd need to know the max centrality across all nodes for perfect normalization
            // As a simple approach, cap at 1.0 and ensure positive values
            const normalizedScore = Math.min(1.0, Math.max(0, node.degreeCentrality));
            
            // Scale the node radius between BASE_NODE_RADIUS and MAX_NODE_RADIUS
            // Linear scaling: radius = base + (max-base) * normalized * scale_factor
            return this.NODE.RADIUS.BASE + 
                   (this.NODE.RADIUS.MAX - this.NODE.RADIUS.BASE) * 
                   normalizedScore * this.NODE.RADIUS.SCALE_FACTOR;
        }
        
        // Default size if no centrality data available
        return this.NODE.RADIUS.BASE;
    }
    
    public refreshGraphView(): void {
        this.updateDimensions();
        this.recenterGraph();
    }
    
    public recenterGraph(animate: boolean = true): void {
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
        
        const minDimension = Math.min(this.width, this.height);
        const scaleX = (this.ZOOM.CONTAINER_SCALE * minDimension) / graphWidth;
        const scaleY = (this.ZOOM.CONTAINER_SCALE * minDimension) / graphHeight;
        
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
        
        // Apply the transform with or without transition based on animate parameter
        const transform = d3.zoomIdentity
            .translate(-centerX * scale, -centerY * scale)
            .scale(scale);
        
        if (animate) {
            this.svg.transition()
                .duration(this.ANIMATION.RECENTER_DURATION)
                .call(this.zoom.transform, transform);
        } else {
            this.svg.call(this.zoom.transform, transform);
        }
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
        // Remove vault event handlers
        this.app.vault.off('modify', this.vaultModifyHandler);
        this.app.vault.off('create', this.vaultCreateHandler);
        this.app.vault.off('delete', this.vaultDeleteHandler);
        this.app.vault.off('rename', this.vaultRenameHandler);

        // Clear any pending debounce timeout
        if (this.debounceTimeout) {
            window.clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

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

    private scheduleTooltipRemoval() {
        // Clear any existing timeouts
        this.clearTooltipTimeout();
        if (this._hideTooltipTimeout) {
            window.clearTimeout(this._hideTooltipTimeout);
        }

        // Set new timeout for hiding
        this._hideTooltipTimeout = window.setTimeout(() => {
            // Only remove if mouse is not over tooltip
            const tooltip = this.currentTooltip;
            if (tooltip && !tooltip.matches(':hover')) {
                this.removeNodeTooltip();
            }
            this._hideTooltipTimeout = null;
        }, this.getTooltipSetting('hide-delay'));
    }

    private setupVaultEventHandlers() {
        // Create handlers that debounce updates
        this.vaultModifyHandler = (file: TFile) => {
            if (file.extension === 'md') {
                this.debouncedUpdate();
            }
        };

        this.vaultCreateHandler = (file: TFile) => {
            if (file.extension === 'md') {
                this.debouncedUpdate();
            }
        };

        this.vaultDeleteHandler = (file: TFile) => {
            if (file.extension === 'md') {
                this.debouncedUpdate();
            }
        };

        this.vaultRenameHandler = (file: TFile, oldPath: string) => {
            if (file.extension === 'md') {
                this.debouncedUpdate();
            }
        };

        // Register the event handlers
        this.app.vault.on('modify', this.vaultModifyHandler);
        this.app.vault.on('create', this.vaultCreateHandler);
        this.app.vault.on('delete', this.vaultDeleteHandler);
        this.app.vault.on('rename', this.vaultRenameHandler);
    }

    private debouncedUpdate() {
        // Clear any existing timeout
        if (this.debounceTimeout) {
            window.clearTimeout(this.debounceTimeout);
        }

        // Set a new timeout to update after a delay
        this.debounceTimeout = window.setTimeout(async () => {
            try {
                await this.loadVaultData();
            } catch (error) {
                console.error('Error updating graph data:', error);
                new Notice('Failed to update graph view');
            }
            this.debounceTimeout = null;
        }, 2000); // 2 second debounce delay
    }
} 