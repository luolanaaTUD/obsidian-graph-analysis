/* eslint-disable @typescript-eslint/unbound-method -- D3 zoom.transform requires .call with bound method */
import { App, Notice, TFile, setIcon } from 'obsidian';
import * as d3 from 'd3';
import * as ss from 'simple-statistics';
import { 
    SimulationGraphLink, 
    SimulationGraphNode,
    Node as GraphNode,
    GraphMetadata,
    GraphAnalysisSettings
} from '../../types/types';
import { GraphDataBuilder } from './data/graph-builder';
import { PluginService } from '../../services/PluginService';
import { VaultSemanticAnalysisManager } from '../../ai/VaultSemanticAnalysisManager';
import { CENTRALITY_RESULTS_VIEW_TYPE } from '../../views/CentralityResultsView';
import {
    KEPLER_COLOR_PALETTES,
    colorPaletteToColorRange,
    // buildCustomPalette,
    // CATEGORIES
} from '../../lib/color-palette';

/**
 * A simplified graph view implementation based on the D3 example
 * This version consolidates functionality into a single class for better maintainability
 */
export class GraphView {
    private app: App;
    private container!: HTMLElement;
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private svgGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private nodes: SimulationGraphNode[] = [];
    private links: SimulationGraphLink[] = [];
    private width!: number;
    private height!: number;
    
    // Core components
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;
    private vaultAnalysisManager: VaultSemanticAnalysisManager;
    
    // Centrality state tracking
    private readonly centralityTypes = ['betweenness', 'closeness', 'eigenvector'] as const;
    private centralityState: Record<typeof this.centralityTypes[number], boolean> = {
        betweenness: false,
        closeness: false,
        eigenvector: false
    };
    private lastCentralityScores: { [nodeId: string]: number } = {};
    
    // Animation and timing constants
    private readonly ANIMATION = {
        DURATION: 200,
        RECENTER_DURATION: 300,
        TOOLTIP_DELAY: 500
    } as const;

    // Node visualization constants
    private readonly NODE = {
        RADIUS: {
            SMALL_GRAPH: {
                BASE: 2,
                MAX: 4
            },
            MEDIUM_GRAPH: {
                BASE: 3,
                MAX: 6
            },
            LARGE_GRAPH: {
                BASE: 3,
                MAX: 9
            }
        },
        COLORS: {
            DEFAULT: 'var(--graph-node-color-default)',
            HIGHLIGHTED: 'var(--graph-node-color-highlighted)'
        },
        SIZE_CATEGORIES: 10 // Using 10 categories for optimal visual distinction while maintaining meaningful degree variations
    } as const;

    // Zoom behavior constants
    private readonly ZOOM = {
        OUT_SCALE_FACTOR: 600,
        IN_SCALE_FACTOR: 60,
        CONTAINER_SCALE: {
            MIN: 0.3,   // Minimum scale (30% of viewport)
            MAX: 0.85,  // Maximum scale (85% of viewport)
            NODE_SCALE_FACTOR: 600  // Node count that represents mid-point of scaling
        }
    } as const;

    // D3 selections
    private nodesSelection!: d3.Selection<SVGCircleElement, SimulationGraphNode, d3.BaseType, unknown>;
    private linksSelection!: d3.Selection<SVGLineElement, SimulationGraphLink, d3.BaseType, unknown>;
    
    // Force simulation
    private simulation!: d3.Simulation<SimulationGraphNode, SimulationGraphLink>;
    
    // UI elements
    private loadingIndicator: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private visibilityObserver: IntersectionObserver | null = null;
    private lastVisibilityChange: number = 0;
    private wasInvisible: boolean = false;
    private graphMetadata: GraphMetadata | null = null;
    private activeButton: HTMLElement | null = null;
    private isVisible: boolean = false;
    
    // Animation frame request reference
    private _frameRequest: number | null = null;
    private highlightedNodeId: string | null = null;
    private _tooltipTimeout: number | null = null;
    private isDraggingNode: boolean = false;
    
    // Neighbors cache to avoid repeated WASM calls
    private cachedNeighbors: Set<number> | null = null;
    private cachedNodeId: number | null = null;
    
    // Add this property at the class level after the private readonly constants section
    private currentTooltip: HTMLElement | null = null;

    // New tooltip timeout
    private _hideTooltipTimeout: number | null = null;

    // Control panel elements
    private controlPanel: HTMLElement | null = null;
    private documentClickHandler: (() => void) | null = null;

    // Track selected gradients for each centrality type
    private selectedPalettes: Record<typeof this.centralityTypes[number], string> = {
        betweenness: 'Viridis',
        closeness: 'Magma',
        eigenvector: 'Plasma'
    };

    // Track gradient settings for each centrality type
    private gradientSettings: Record<typeof this.centralityTypes[number], {
        type: 'sequential' | 'diverging' | 'cyclical' | 'qualitative';
        reversed: boolean;
        steps: number;
        distribution: 'linear' | 'quantize' | 'jenks';
    }> = {
        betweenness: { type: 'sequential', reversed: false, steps: 6, distribution: 'jenks' },
        closeness: { type: 'sequential', reversed: false, steps: 6, distribution: 'jenks' },
        eigenvector: { type: 'sequential', reversed: false, steps: 6, distribution: 'jenks' }
    };

    // Add color palette state
    private colorPalettes = KEPLER_COLOR_PALETTES;



    // Add this as a class property after the NODE constant
    private nodeRadiusScale: d3.ScaleThreshold<number, number> | null = null;
    private nodeRadiusCache: Map<string, number> = new Map();
    private cachedZoomLimits: [number, number] | null = null;
    private cachedZoomLimitsWidth: number = 0;
    private cachedZoomLimitsHeight: number = 0;

    // Display toggles for labels and arrows
    private showNodeLabels: boolean = true;
    private showArrows: boolean = true;
    private markerIdDefault: string = '';
    private markerIdHighlighted: string = '';
    private labelsSelection!: d3.Selection<SVGTextElement, SimulationGraphNode, d3.BaseType, unknown>;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        
        // Initialize core modules
        this.pluginService = new PluginService(app);
        this.graphDataBuilder = new GraphDataBuilder(app);
        this.vaultAnalysisManager = new VaultSemanticAnalysisManager(app, settings);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Initialize visibility state
        this.isVisible = true; // Assume visible when first loaded
        
        // Initialize D3 components (includes SVG setup, force simulation, and zoom behavior)
        this.initializeD3();
        
        // Create control panel
        this.createControlPanel();
        
        // Setup visibility detection
        this.setupVisibilityObserver();
        
        // Mark container as initialized
        this.container.addClass('graph-initialized');
        
        // Load vault data
        this.showLoadingIndicator();
        try {
            // Ensure WASM is initialized first
            await this.pluginService.ensureWasmLoaded();
            await this.loadVaultData();
        } catch (error) {
            // console.error('Error loading vault data:', error);
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
                -this.width / 2,  // Center the viewBox at (0,0)
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

        // Arrow markers for directional links (source -> target)
        const defs = this.svg.append('defs');
        const markerAttrs = {
            markerUnits: 'userSpaceOnUse',
            markerWidth: 4,
            markerHeight: 4,
            refX: 3,
            refY: 0,
            orient: 'auto',
            viewBox: '0 -2 4 4'
        };
        this.markerIdDefault = `graph-arrow-default-${Date.now()}`;
        defs.append('marker')
            .attr('id', this.markerIdDefault)
            .attr('markerUnits', markerAttrs.markerUnits)
            .attr('markerWidth', markerAttrs.markerWidth)
            .attr('markerHeight', markerAttrs.markerHeight)
            .attr('refX', markerAttrs.refX)
            .attr('refY', markerAttrs.refY)
            .attr('orient', markerAttrs.orient)
            .attr('viewBox', markerAttrs.viewBox)
            .append('path')
            .attr('d', 'M0,-1.5 L4,0 L0,1.5 Z')
            .attr('fill', 'var(--graph-link-color-default)');
        this.markerIdHighlighted = `graph-arrow-highlighted-${Date.now()}`;
        defs.append('marker')
            .attr('id', this.markerIdHighlighted)
            .attr('markerUnits', markerAttrs.markerUnits)
            .attr('markerWidth', markerAttrs.markerWidth)
            .attr('markerHeight', markerAttrs.markerHeight)
            .attr('refX', markerAttrs.refX)
            .attr('refY', markerAttrs.refY)
            .attr('orient', markerAttrs.orient)
            .attr('viewBox', markerAttrs.viewBox)
            .append('path')
            .attr('d', 'M0,-1.5 L4,0 L0,1.5 Z')
            .attr('fill', 'var(--graph-link-color-highlighted)');
        
        // Create groups for links and nodes
        const linksGroup = this.svgGroup.append('g')
            .attr('class', 'links-group')
            .style('stroke', 'var(--graph-link-color-default)')
            .style('stroke-width', 'var(--graph-link-width-default)')
            .style('stroke-opacity', 'var(--graph-link-opacity-default)');
            
        const nodesGroup = this.svgGroup.append('g')
            .attr('class', 'nodes-group')
            .style('fill', 'var(--graph-node-color-default)')
            .style('opacity', 'var(--graph-node-opacity-default)');

        const labelsGroup = this.svgGroup.append('g').attr('class', 'labels-group');

        // Initialize selections
        this.linksSelection = linksGroup.selectAll('line');
        this.nodesSelection = nodesGroup.selectAll('circle');
        this.labelsSelection = labelsGroup.selectAll('text');
        
        // Initialize force simulation
        this.initializeSimulation();
        
        // Setup zoom behavior
        this.setupZoomBehavior();
        
        // Handle resize with ResizeObserver
        this.setupResizeObserver();
    }
    
    /**
     * Calculate dynamic zoom limits based on screen size and node radius
     * Centralized method to ensure consistent limits across the application
     * Results are cached and invalidated when nodes or dimensions change
     */
    private calculateZoomLimits(): [number, number] {
        if (!this.nodes || this.nodes.length === 0) {
            this.cachedZoomLimits = null;
            return [0.1, 4];
        }

        if (this.cachedZoomLimits !== null &&
            this.cachedZoomLimitsWidth === this.width &&
            this.cachedZoomLimitsHeight === this.height) {
            return this.cachedZoomLimits;
        }

        // Calculate statistics for node sizes in the current graph
        let maxRadius = 0;
        let totalRadius = 0;
        const nodeCount = this.nodes.length;
        const baseRadius = this.NODE.RADIUS.SMALL_GRAPH.BASE;

        for (let i = 0; i < nodeCount; i++) {
            const radius = this.nodeRadiusCache.get(this.nodes[i].id) ?? baseRadius;
            maxRadius = Math.max(maxRadius, radius);
            totalRadius += radius;
        }

        // Use average node radius for min zoom (to see entire graph)
        const avgRadius = totalRadius / nodeCount;

        // Adjust scale factors based on node count
        const baseOutScaleFactor = 600;
        const baseInScaleFactor = 60;
        const outScaleFactor = nodeCount < 100 ? baseOutScaleFactor / 2 : baseOutScaleFactor;
        const inScaleFactor = nodeCount < 100 ? baseInScaleFactor / 2 : baseInScaleFactor;

        let minZoom = this.width / (avgRadius * outScaleFactor);
        let maxZoom = this.width / (maxRadius * inScaleFactor);
        minZoom = Math.max(0.1, Math.min(minZoom, 1.0));
        maxZoom = Math.max(2.0, Math.min(maxZoom, 8.0));

        this.cachedZoomLimits = [minZoom, maxZoom];
        this.cachedZoomLimitsWidth = this.width;
        this.cachedZoomLimitsHeight = this.height;
        return this.cachedZoomLimits;
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
            .on('zoom', (evt: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                // Validate transform values before applying
                const t = evt.transform;
                if (!isFinite(t.x) || !isFinite(t.y) || !isFinite(t.k)) {
                    // console.warn('Invalid transform values detected, skipping zoom update');
                    return;
                }
                // Update SVG group transform (ZoomTransform.toString() yields "translate(x,y) scale(k)")
                this.svgGroup.attr('transform', String(t));
                
                
                // Request a frame to update graph elements
                if (!this._frameRequest) {
                    this._frameRequest = window.requestAnimationFrame(() => {
                        this.updateGraph();
                        this._frameRequest = null;
                    });
                }
            })
            .on('end', () => {
                this.container.removeClass('zooming');
            });
        
        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Don't call recenterGraph here - it will be called after data is loaded
    }


    /**
     * Initialize the force simulation with simplified forces similar to the D3 example
     */
    private initializeSimulation() {
        // Create a simulation with forces matching Obsidian's built-in graph view defaults
        this.simulation = d3.forceSimulation<SimulationGraphNode>()
            // Link force connects nodes with edges (link force: 1)
            .force('link', d3.forceLink<SimulationGraphNode, SimulationGraphLink>()
                .id(d => d.id)
                .distance(50)) // link distance: 250
            // Charge force creates repulsion between nodes (repel force: 10)
            .force('charge', d3.forceManyBody()
                .strength(-300)) // Stronger repulsion to match Obsidian's repel force of 10
            // Center forces to keep the graph roughly centered (center force: 0.52)
            .force('x', d3.forceX().strength(0.8)) // Scaled down by factor of 10 to match D3's scale
            .force('y', d3.forceY().strength(0.8)) // Scaled down by factor of 10 to match D3's scale
            // Simple collision detection to prevent overlap
            .force('collision', d3.forceCollide<SimulationGraphNode>()
                .radius(d => this.getNodeRadius(d) + 1)
                .strength(0.8))
            // Standard decay parameters
            .alphaDecay(0.0228) // D3 default value
            .velocityDecay(0.4) // D3 default value
            .on('tick', () => {
                if (!this._frameRequest) {
                    this._frameRequest = window.requestAnimationFrame(() => {
                        this.updateGraph();
                        this._frameRequest = null;
                    });
                }
            });
    }
    
    /**
     * Gently restart the simulation with lower alpha
     */
    public restartSimulationGently(): void {
        try {
            if (this.simulation) {
                // Default D3 behavior - lower alpha for gentle restart
                this.simulation.alpha(0.3).restart();
            }
        } catch {
            // Simulation may not be initialized
        }
    }

    /** Compute all four link endpoints at once (edge-to-edge for arrows) */
    private linkEndpoints(d: SimulationGraphLink): [number, number, number, number] {
        const s = d.source as SimulationGraphNode;
        const t = d.target as SimulationGraphNode;
        const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        const baseRadius = this.NODE.RADIUS.SMALL_GRAPH.BASE;
        const sr = this.nodeRadiusCache.get(s.id) ?? baseRadius;
        const tr = this.nodeRadiusCache.get(t.id) ?? baseRadius;
        return [sx + nx * sr, sy + ny * sr, tx - nx * tr, ty - ny * tr];
    }

    private updateGraph() {
        // Cache selection references for performance
        const linksSelection = this.linksSelection;
        const nodesSelection = this.nodesSelection;

        // Safety check - if selections don't exist, exit early
        if (!linksSelection || !nodesSelection) return;

        // Update link positions (edge-to-edge when arrows enabled, center-to-center otherwise)
        if (this.showArrows) {
            linksSelection.each((d, i, nodes) => {
                const [x1, y1, x2, y2] = this.linkEndpoints(d);
                const el = nodes[i];
                el.setAttribute('x1', String(x1));
                el.setAttribute('y1', String(y1));
                el.setAttribute('x2', String(x2));
                el.setAttribute('y2', String(y2));
            });
        } else {
            linksSelection
                .attr('x1', d => (d.source as unknown as SimulationGraphNode).x || 0)
                .attr('y1', d => (d.source as unknown as SimulationGraphNode).y || 0)
                .attr('x2', d => (d.target as unknown as SimulationGraphNode).x || 0)
                .attr('y2', d => (d.target as unknown as SimulationGraphNode).y || 0);
        }

        // Update node positions
        nodesSelection
            .attr('cx', d => d.x || 0)
            .attr('cy', d => d.y || 0);

        // Update label positions only when labels are visible
        if (this.showNodeLabels && this.labelsSelection && !this.labelsSelection.empty()) {
            this.labelsSelection
                .attr('x', d => d.x || 0)
                .attr('y', d => (d.y || 0) + (this.nodeRadiusCache.get(d.id) ?? this.NODE.RADIUS.SMALL_GRAPH.BASE) + 5);
        }
    }
    
    private updateDimensions() {
        // Check if container is visible before updating dimensions
        if (!this.container || !this.container.isConnected) {
            return;
        }
        
        const rect = this.container.getBoundingClientRect();

        // Only update dimensions if they are valid and the container is visible
        if (rect.width > 0 && rect.height > 0 && isFinite(rect.width) && isFinite(rect.height)) {
            this.width = rect.width;
            this.height = rect.height;

            // Invalidate zoom limits cache when dimensions change
            this.cachedZoomLimits = null;

            // Update zoom limits when dimensions change
            if (this.zoom) {
                this.zoom.scaleExtent(this.calculateZoomLimits());
            }
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

                // Update the SVG viewBox to maintain centering at (0,0)
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
            } catch {
                // If we encounter an error, disconnect the observer
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
    
    private onNodeMouseOver(event: MouseEvent, d: SimulationGraphNode) {
        if (this.isDraggingNode) return;
        if (this._hideTooltipTimeout) {
            window.clearTimeout(this._hideTooltipTimeout);
            this._hideTooltipTimeout = null;
        }
        this.highlightedNodeId = d.id;
        this.highlightNode(event.currentTarget as SVGCircleElement, true);
        
        // Highlight connections
        this.highlightConnections(d.id, true);
        
        // Only show tooltip if not dragging
        if (!this.isDraggingNode) {
            // Handle tooltip with delay
            this.scheduleTooltip(d, event);
        }
    }
    
    private onNodeMouseOut(event: MouseEvent, d: SimulationGraphNode) {
        if (this.isDraggingNode) return;
        this.highlightNode(event.currentTarget as SVGCircleElement, false);
        
        // Remove connections highlight
        this.highlightConnections(d.id, false);
        
        // Schedule tooltip removal with delay
        this.scheduleTooltipRemoval();
        
        this.highlightedNodeId = null;
    }
    
    private onNodeClick(event: MouseEvent, d: SimulationGraphNode) {
        event.stopPropagation();
        
        // Open the note when clicked
        if (d.path) {
            const file = this.app.vault.getAbstractFileByPath(d.path);
            if (file instanceof TFile) {
                void this.app.workspace.getLeaf(false).openFile(file);
            }
        }
    }
    
    private removeNodeTooltip() {
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }
    
    private createTooltip(node: SimulationGraphNode, event: MouseEvent) {
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
                                } catch {
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
                    text: 'Open note',
                    cls: 'open-note-button',
                });
                
                // Add click handler to open the note
                openNoteBtn.addEventListener('click', (ev: MouseEvent) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if (node.path) {
                        const file = this.app.vault.getAbstractFileByPath(node.path);
                        if (file instanceof TFile) {
                            void this.app.workspace.getLeaf().openFile(file);
                        }
                    }
                });
                
                // Note preview section
                const previewSection = tooltip.createDiv({ cls: 'note-preview-section' });
                previewSection.createEl('div', {
                    text: 'Note preview',
                    cls: 'preview-section-title'
                });
                
                // Create preview content container
                const previewContent = previewSection.createDiv({ cls: 'preview-content' });
                
                // Load and display raw note content (condensed, one blank line before each heading)
                void this.app.vault.read(file).then(content => {
                    if (this.currentTooltip !== tooltip) return;
                    const previewText = this.formatNotePreview(content);
                    previewContent.setText(previewText);
                }).catch(() => {
                    if (this.currentTooltip !== tooltip) return;
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

    /** Raw content: strip frontmatter, condense empty lines, keep one blank line before each heading, truncate to 900 chars. */
    private formatNotePreview(content: string): string {
        const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/m, '');
        const condensed = withoutFrontmatter.replace(/\n{2,}/g, '\n').trim();
        const withHeadingSpacing = condensed
            .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
            .replace(/^\n(#{1,6}\s)/, '\n\n$1');
        return withHeadingSpacing.slice(0, 900) + (withHeadingSpacing.length > 900 ? '...' : '');
    }

    private getTooltipSetting(settingName: string): number {
        const workspace = document.querySelector('.workspace');
        if (!workspace) {
            // console.warn('Workspace element not found for tooltip settings');
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
        
        // Apply position via CSS variables (dynamic values allowed by rule)
        tooltip.style.setProperty('--graph-tooltip-x', `${tooltipX}px`);
        tooltip.style.setProperty('--graph-tooltip-y', `${tooltipY}px`);
        tooltip.classList.add('graph-node-tooltip-visible');
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
        const cacheValid = this.cachedNodeId === nodeIdInt && this.cachedNeighbors !== null;
        
        // If we're in a drag operation or we have a valid cache, use the cached data
        if ((this.isDraggingNode && this.highlightedNodeId === nodeId) || cacheValid) {
            if (this.cachedNeighbors) {
                connectedNodeIds = this.cachedNeighbors;
            }
        } else {
            // No cache hit, need to get data from WASM
            try {
                // Use the WASM cached implementation
                const neighborResult = this.pluginService.getNodeNeighbors(nodeIdInt);
                
                // Extract neighbor IDs from the result
                if (neighborResult && neighborResult.neighbors) {
                    neighborResult.neighbors.forEach((neighbor: { node_id: number }) => {
                        connectedNodeIds.add(neighbor.node_id);
                    });
                    
                    // Update the cache with the new data
                    this.cachedNodeId = nodeIdInt;
                    this.cachedNeighbors = connectedNodeIds;
                } else {
                    // console.error('Unexpected result format from WASM neighbor function', neighborResult);
                    throw new Error('Unexpected result format from WASM');
                }
            } catch {
                this.cachedNodeId = null;
                this.cachedNeighbors = null;
                return;
            }
        }
        
        // Check if any centrality analysis is active
        const isCentralityActive = Object.values(this.centralityState).some(state => state);
        
        // Dim all nodes and links not connected - use single transition per node to reduce overhead
        this.nodesSelection.each(function(d) {
            const isSelected = d.id === nodeId;
            const isConnected = isSelected || connectedNodeIds.has(parseInt(d.id));
            const selection = d3.select(this);

            if (!isCentralityActive) {
                selection.transition()
                    .duration(animationDuration)
                    .style('opacity', isConnected ? 'var(--graph-node-opacity-default)' : 'var(--graph-node-opacity-dimmed)')
                    .style('fill', isSelected ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)');
            } else {
                const trans = selection.transition()
                    .duration(animationDuration)
                    .style('opacity', isConnected ? 'var(--graph-node-opacity-default)' : 'var(--graph-node-opacity-dimmed)');
                if (isSelected) {
                    trans.style('stroke', 'var(--graph-node-color-highlighted)')
                        .style('stroke-width', '2px');
                }
            }
        });
        
        const showArrows = this.showArrows;
        const markerIdDefault = this.markerIdDefault;
        const markerIdHighlighted = this.markerIdHighlighted;
        this.linksSelection.each(function(d) {
            const sourceId = typeof d.source === 'string' ? d.source : (d.source as unknown as SimulationGraphNode).id;
            const targetId = typeof d.target === 'string' ? d.target : (d.target as unknown as SimulationGraphNode).id;
            const isConnected = sourceId === nodeId || targetId === nodeId;
            
            const sel = d3.select(this)
                .transition()
                .duration(animationDuration)
                .style('stroke', isConnected ? 'var(--graph-link-color-highlighted)' : 'var(--graph-link-color-default)')
                .style('stroke-width', isConnected ? 'var(--graph-link-width-highlighted)' : 'var(--graph-link-width-default)')
                .style('stroke-opacity', isConnected ? 'var(--graph-link-opacity-default)' : 'var(--graph-link-opacity-dimmed)');
            if (showArrows) {
                sel.attr('marker-end', isConnected ? `url(#${markerIdHighlighted})` : `url(#${markerIdDefault})`);
            }
        });
    }
    
    private resetHighlights() {
        // Clear the neighbors cache when resetting highlights
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
        
        // Store animation duration in a local variable for consistency with other methods
        const animationDuration = this.ANIMATION.DURATION;
        
        // Check if any centrality analysis is active
        const isCentralityActive = Object.values(this.centralityState).some(state => state);
        
        // Reset all nodes - use single transition when possible
        if (!isCentralityActive) {
            this.nodesSelection
                .transition()
                .duration(animationDuration)
                .style('opacity', 'var(--graph-node-opacity-default)')
                .style('stroke', 'var(--graph-node-color-default)')
                .style('stroke-width', 'var(--graph-node-stroke-width)')
                .style('fill', 'var(--graph-node-color-default)');
        } else {
            this.nodesSelection
                .transition()
                .duration(animationDuration)
                .style('opacity', 'var(--graph-node-opacity-default)')
                .style('stroke', 'var(--graph-node-color-default)')
                .style('stroke-width', 'var(--graph-node-stroke-width)');
        }
            
        // Reset links to default style
        this.linksSelection
            .transition()
            .duration(animationDuration)
            .style('stroke-opacity', 'var(--graph-link-opacity-default)')
            .style('stroke-width', 'var(--graph-link-width-default)')
            .style('stroke', 'var(--graph-link-color-default)')
            .attr('marker-end', this.showArrows ? `url(#${this.markerIdDefault})` : null);
    }
    
    private setupDragBehavior() {
        type DragEvent = d3.D3DragEvent<SVGCircleElement, SimulationGraphNode, SimulationGraphNode>;
        return d3.drag<SVGCircleElement, SimulationGraphNode>()
            .on('start', (event: DragEvent, d: SimulationGraphNode) => {
                // Reheat simulation when drag starts
                if (!event.active && this.simulation) {
                    this.simulation.alphaTarget(0.3).restart();
                }
                
                // Fix the position of the dragged node
                d.fx = d.x ?? null;
                d.fy = d.y ?? null;
                
                // Set drag state and remove tooltip
                this.isDraggingNode = true;
                this.clearTooltipTimeout();
                this.removeNodeTooltip();
                
                // Apply highlighting
                this.highlightedNodeId = d.id;
                const target = (event.sourceEvent as MouseEvent).currentTarget;
                this.highlightNode(target as SVGCircleElement, true);
                this.highlightConnections(d.id, true);
            })
            .on('drag', (event: DragEvent, d: SimulationGraphNode) => {
                // Update the fixed position of the dragged node
                d.fx = event.x;
                d.fy = event.y;
                
                // Maintain highlighting during drag
                if (this.highlightedNodeId !== d.id) {
                    this.highlightedNodeId = d.id;
                    const target = (event.sourceEvent as MouseEvent).currentTarget;
                    this.highlightNode(target as SVGCircleElement, true);
                    this.highlightConnections(d.id, true);
                }
            })
            .on('end', (event: DragEvent, d: SimulationGraphNode) => {
                // Cool down the simulation
                if (!event.active && this.simulation) {
                    this.simulation.alphaTarget(0);
                }
                
                // Release the fixed position if shift is not pressed
                const sourceEvent = event.sourceEvent as MouseEvent;
                if (!sourceEvent.shiftKey) {
                    d.fx = null;
                    d.fy = null;
                }
                this.isDraggingNode = false;
                const element = sourceEvent.target as Element;
                const bounds = element.getBoundingClientRect();
                const mouseX = sourceEvent.clientX;
                const mouseY = sourceEvent.clientY;
                
                const isMouseOver = mouseX >= bounds.left && mouseX <= bounds.right && 
                                  mouseY >= bounds.top && mouseY <= bounds.bottom;

                if (!isMouseOver) {
                    // Reset highlights if mouse is not over the node
                    setTimeout(() => {
                        if (!this.isDraggingNode && this.highlightedNodeId === d.id) {
                            this.highlightNode(element as SVGCircleElement, false);
                            this.highlightConnections(d.id, false);
                            this.highlightedNodeId = null;
                        }
                    }, this.ANIMATION.DURATION);
                }
            });
    }
    
    /**
     * Apply or remove visual highlighting from a node element
     */
    private highlightNode(element: SVGCircleElement, highlight: boolean) {
        const node = d3.select(element);
        // const nodeData = node.datum() as SimulationGraphNode;
        
        // Get the current node fill color, which could be a gradient if centrality analysis is active
        // const currentFill = node.style('fill');
        
        // Check if any centrality analysis is active
        const isCentralityActive = Object.values(this.centralityState).some(state => state);
        
        // If highlighting and a centrality is active, we need to preserve the gradient color
        if (highlight && isCentralityActive) {
            // For highlighted nodes, we still want to show some visual feedback
            // We can slightly increase opacity or add a stroke instead of changing the fill color
            node.transition()
                .duration(this.ANIMATION.DURATION)
                .style('stroke', 'var(--graph-node-color-highlighted)')
                .style('stroke-width', '2px');
        } else if (!highlight && isCentralityActive) {
            // When un-highlighting with centrality active, just remove the stroke
            node.transition()
                .duration(this.ANIMATION.DURATION)
                .style('stroke', 'var(--graph-node-color-default)')
                .style('stroke-width', 'var(--graph-node-stroke-width)');
        } else {
            // Default behavior when no centrality is active
            node.transition()
                .duration(this.ANIMATION.DURATION)
                .style('fill', highlight ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)');
        }
    }
    
    /**
     * Schedule tooltip display after delay
     */
    private scheduleTooltip(node: SimulationGraphNode, event: MouseEvent) {
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
        // Get graph data, degree centrality and metadata from builder
        const { graphData, degreeCentrality, metadata } = await this.graphDataBuilder.buildGraphData();
            
        // Store metadata for later use
        this.graphMetadata = metadata;

        // Build O(1) lookup map for degree centrality
            const degreeMap = new Map<number, number>();
        if (degreeCentrality) {
            for (const r of degreeCentrality) {
                if (r?.centrality?.degree !== undefined) {
                    degreeMap.set(r.node_id, r.centrality.degree);
                }
            }
        }

        // Convert edges to links format
        const nodes: SimulationGraphNode[] = graphData.nodes.map((nodePath: string, index: number) => {
                const fileName = nodePath.split('/').pop() || nodePath;
                const displayName = fileName.replace('.md', '');
                const degreeCentralityScore = degreeMap.get(index) ?? 0;
                
                return {
                    id: index.toString(),
                    name: displayName,
                    path: nodePath,
                    degreeCentrality: degreeCentralityScore,
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
            
        // Update the graph with the processed data
        await this.updateData({ nodes, links });
    }
    
    public updateData(graphData: { nodes: SimulationGraphNode[], links: SimulationGraphLink[] }): Promise<void> {
        // Invalidate zoom limits cache when node data changes
        this.cachedZoomLimits = null;

        // Store the data
        this.nodes = graphData.nodes || [];
        this.links = graphData.links || [];
        
        // Initialize the node radius scale
        this.initializeNodeRadiusScale();
        
        // Clear any existing neighbors cache as the graph data has changed
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
        
        // Create D3 selections for the graph elements
        this.linksSelection = this.svgGroup.select('.links-group')
            .selectAll<SVGLineElement, SimulationGraphLink>('line')
            .data(this.links, (d: SimulationGraphLink) => {
                const sid = typeof d.source === 'string' ? d.source : (d.source).id;
                const tid = typeof d.target === 'string' ? d.target : (d.target).id;
                return `${sid}-${tid}`;
            })
            .join(
                enter => enter.append('line')
                    .style('stroke', 'var(--graph-link-color-default)')
                    .style('stroke-width', 'var(--graph-link-width-default)')
                    .style('stroke-opacity', 'var(--graph-link-opacity-default)')
                    .attr('class', 'graph-link')
                    .attr('marker-end', this.showArrows ? `url(#${this.markerIdDefault})` : null),
                update => update.attr('marker-end', this.showArrows ? `url(#${this.markerIdDefault})` : null),
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

        // Create/update labels in labels group
        this.labelsSelection = this.svgGroup.select('.labels-group')
            .selectAll<SVGTextElement, SimulationGraphNode>('text')
            .data(this.nodes, d => d.id)
            .join(
                enter => {
                    const textEnter = enter.append('text')
                        .attr('class', 'graph-node-label-svg')
                        .attr('text-anchor', 'middle')
                        .attr('x', d => d.x ?? 0)
                        .attr('y', d => (d.y ?? 0) + this.getNodeRadius(d) + 5)
                        .text(d => {
                        const name = d.name ?? '';
                        if (name.length > 30) return name.slice(0, 27) + '...';
                        return name;
                    })
                        .style('pointer-events', 'none');
                    if (!this.showNodeLabels) textEnter.style('display', 'none');
                    return textEnter;
                },
                update => {
                    const textUpdate = update
                        .attr('x', d => d.x ?? 0)
                        .attr('y', d => (d.y ?? 0) + this.getNodeRadius(d) + 5);
                    if (this.showNodeLabels) textUpdate.style('display', null);
                    else textUpdate.style('display', 'none');
                    return textUpdate;
                },
                exit => exit.remove()
            );

        // Setup event handlers
        this.setupNodeEventHandlers();
        
        // Update simulation with new data
        if (this.simulation) {
            // Assign initial positions in a circle layout
            // Use for loop instead of forEach for better performance
            const radius = Math.min(this.width, this.height) / 6;
            const angleStep = (2 * Math.PI) / this.nodes.length;
            const nodeCount = this.nodes.length;
            
            for (let i = 0; i < nodeCount; i++) {
                const node = this.nodes[i];
                const angle = i * angleStep;
                node.x = Math.cos(angle) * radius;
                node.y = Math.sin(angle) * radius;
                // Clear any fixed positions
                node.fx = null;
                node.fy = null;
            }

            // Update the simulation with our nodes and links
            this.simulation.nodes(this.nodes);
            const linkForce = this.simulation.force('link') as d3.ForceLink<SimulationGraphNode, SimulationGraphLink>;
            if (linkForce) {
                linkForce.links(this.links);
            }

            // Center the graph immediately with initial layout
            this.recenterGraph(false);

            // Start the simulation with a higher alpha for better initial layout
            this.simulation
                .alpha(1)
                .alphaTarget(0.3) // Keep some movement
                .restart();
            
            this.recenterGraph(true);

            // After initial movement, cool down the simulation and recenter
            this.simulation.on('tick.init', () => {
                if (this.simulation.alpha() < 0.1) {
                    // Remove this special tick handler
                    this.simulation.on('tick.init', null);
                    
                    // Cool down simulation completely
                    this.simulation.alphaTarget(0);
                    
                    
                }
            });
        }
        return Promise.resolve();
    }
    
    /**
     * Initialize the node radius scale using Jenks natural breaks
     * This ensures orphan nodes (degree 0) map to the smallest radius
     * This should be called when the graph data is updated
     */
    private initializeNodeRadiusScale(): void {
        if (!this.nodes.length) {
            this.nodeRadiusCache.clear();
            return;
        }

        // Collect all degree values
        const degrees = this.nodes
            .map(n => n.degreeCentrality)
            .filter((d): d is number => d !== undefined);

        if (degrees.length === 0) {
            this.nodeRadiusCache.clear();
            return;
        }

        // Calculate Jenks natural breaks using the number of size categories from NODE constant
        // Jenks returns n+1 break points for n categories
        const breaks = ss.jenks(degrees, this.NODE.SIZE_CATEGORIES);

        // Create an array of radius values based on graph size
        let minRadius: number;
        let maxRadius: number;
        if (this.nodes.length <= 20) {
            minRadius = this.NODE.RADIUS.SMALL_GRAPH.BASE;
            maxRadius = this.NODE.RADIUS.SMALL_GRAPH.MAX;
        } else if (this.nodes.length <= 100) {
            minRadius = this.NODE.RADIUS.MEDIUM_GRAPH.BASE;
            maxRadius = this.NODE.RADIUS.MEDIUM_GRAPH.MAX;
        } else {
            minRadius = this.NODE.RADIUS.LARGE_GRAPH.BASE;
            maxRadius = this.NODE.RADIUS.LARGE_GRAPH.MAX;
        }

        // Create radius steps: breaks.length values (one for each break point)
        // These will be mapped so that low degree values get small radii
        const radiusSteps = Array.from({ length: breaks.length }, (_, i) => {
            const t = i / (breaks.length - 1);
            return minRadius + (maxRadius - minRadius) * t;
        });

        // Create the threshold scale
        // Domain: breaks.slice(1) gives us n thresholds (excluding the minimum break point)
        // Range: radiusSteps gives us n+1 radius values
        // Mapping: values < first threshold → radiusSteps[0] (smallest)
        //          values >= threshold[i] → radiusSteps[i+1]
        //          values >= last threshold → radiusSteps[n] (largest)
        // This ensures low degree values (including 0 for orphans) map to small radii
        this.nodeRadiusScale = d3.scaleThreshold<number, number>()
            .domain(breaks.slice(1)) // Remove the first break point (minimum value)
            .range(radiusSteps);

        // Populate radius cache for hot-path lookups (updateGraph, collision force, recenterGraph)
        this.nodeRadiusCache.clear();
        const baseRadius = this.NODE.RADIUS.SMALL_GRAPH.BASE;
        for (const node of this.nodes) {
            const radius = this.nodeRadiusScale(node.degreeCentrality);
            this.nodeRadiusCache.set(node.id, radius ?? baseRadius);
        }
    }

    /**
     * Calculate node radius based on centrality and other factors
     * Uses cached values when available for performance
     */
    private getNodeRadius(node?: SimulationGraphNode | null): number {
        if (!node) {
            return this.NODE.RADIUS.SMALL_GRAPH.BASE;
        }
        return this.nodeRadiusCache.get(node.id) ?? this.NODE.RADIUS.SMALL_GRAPH.BASE;
    }
    
    public refreshGraphView(): void {
        // Only refresh if the container is visible and connected
        if (!this.container || !this.container.isConnected || !this.isVisible) {
            return;
        }
        
        // Check if the container has valid dimensions before proceeding
        const rect = this.container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        
        this.updateDimensions();
        this.recenterGraph();
    }

    /**
     * Reload vault data and refresh the graph visualization
     * Called when user switches back to the graph view to ensure data is up to date
     */
    public async reloadVaultData(): Promise<void> {
        // Only reload if the container is visible and connected
        if (!this.container || !this.container.isConnected) {
            return;
        }
        
        try {
            this.showLoadingIndicator();
            await this.loadVaultData();
        } catch (err) {
            new Notice(`Error reloading graph data: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.hideLoadingIndicator();
        }
    }
    
    public updateSettings(settings: GraphAnalysisSettings): void {
        this.vaultAnalysisManager.updateSettings(settings);
        void this.reloadVaultData();
    }
    
    public recenterGraph(animate: boolean = true): void {
        // Exit early if we have no nodes
        if (this.nodes.length === 0) return;
        
        // Check if container is visible and has valid dimensions
        if (!this.container || !this.container.isConnected) {
            return;
        }
        
        // Ensure we have valid dimensions before proceeding
        if (!isFinite(this.width) || !isFinite(this.height) || this.width <= 0 || this.height <= 0) {
            return;
        }
        
        // Now calculate the actual bounds including node radii
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        // Use for loop for better performance
        const nodeCount = this.nodes.length;
        for (let i = 0; i < nodeCount; i++) {
            const node = this.nodes[i];
            if (node.x === undefined || node.y === undefined) continue;
            const radius = this.getNodeRadius(node);
            
            minX = Math.min(minX, node.x - radius);
            minY = Math.min(minY, node.y - radius);
            maxX = Math.max(maxX, node.x + radius);
            maxY = Math.max(maxY, node.y + radius);
        }
        
        // Only proceed if we have valid bounds
        if (!isFinite(minX) || !isFinite(minY)) return;
        
        // Calculate graph dimensions
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Safety check for zero dimensions
        if (graphWidth === 0 || graphHeight === 0) return;
        
        // Calculate optimal container scale based on graph characteristics
        const containerScale = this.calculateOptimalContainerScale();
        
        // Calculate scale to make graph take up appropriate percentage of minimum window dimension
        const minDimension = Math.min(this.width, this.height);
        const targetSize = minDimension * containerScale;
        const scale = targetSize / Math.max(graphWidth, graphHeight);
        
        // Validate scale before proceeding
        if (!isFinite(scale) || scale <= 0) {
            return;
        }
        
        // Calculate center point of the graph
        const centerX = minX + graphWidth / 2;
        const centerY = minY + graphHeight / 2;
        
        // Validate center coordinates
        if (!isFinite(centerX) || !isFinite(centerY)) {
            return;
        }
        
        // Apply the transform
        const transform = d3.zoomIdentity
            .translate(-centerX * scale, -centerY * scale)
            .scale(scale);
        
        // Final validation of transform values
        if (!isFinite(transform.x) || !isFinite(transform.y) || !isFinite(transform.k)) {
            return;
        }
        
        if (animate) {
            this.svg.transition()
                .duration(this.ANIMATION.RECENTER_DURATION)
                .call(this.zoom.transform, transform);
        } else {
            this.svg.call(this.zoom.transform, transform);
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
                    this.isVisible = true;
                    // Only recenter if it's been a significant time since the last visibility change
                    // This prevents unnecessary recentering during quick tab switches
                    if (now - this.lastVisibilityChange > 1000) {
                        this.recenterGraph();
                        this.restartSimulationGently();
                    }
                    this.wasInvisible = false;
                } else if (!entry.isIntersecting) {
                    this.isVisible = false;
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

        // Remove document-level click listener to prevent memory leak
        if (this.documentClickHandler) {
            document.removeEventListener('click', this.documentClickHandler);
            this.documentClickHandler = null;
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

        // Close the centrality results view and hide the right sidebar if it's open
        const centralityLeaf = this.app.workspace.getLeavesOfType(CENTRALITY_RESULTS_VIEW_TYPE)[0];
        if (centralityLeaf) {
            // Detach the centrality view
            centralityLeaf.detach();
            
            // Hide the right sidebar by collapsing it
            const rightSplit = this.app.workspace.rightSplit;
            if (rightSplit && rightSplit.collapsed === false) {
                rightSplit.collapse();
            }
        }
        
        // Clear data caches
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
        this.nodeRadiusCache.clear();
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
        
        // Remove control panel and its listeners
        if (this.controlPanel) {
            this.controlPanel.remove();
            this.controlPanel = null;
        }

        // Clear remaining references
        // @ts-ignore - explicitly break circular references
        this.container = null;
        // @ts-ignore - explicitly break circular references
        this.graphDataBuilder = null;
        // @ts-ignore - explicitly break circular references
        this.pluginService = null;
        // @ts-ignore - explicitly break circular references
        this.vaultAnalysisManager = null;
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


    private createControlPanel() {
        // Create control panel container for centrality buttons (right middle)
        this.controlPanel = this.container.createDiv({ cls: 'centrality-control-panel' });
        
        // Create color settings button
        this.createColorSettingsButton();
        
        // Create centrality buttons
        this.centralityTypes.forEach(type => {
            this.createCentralityButton(type);
        });
        
        // Create vault analysis icon positioned at right bottom of canvas
        const vaultAnalysisContainer = this.container.createDiv({ cls: 'vault-analysis-container' });
        this.vaultAnalysisManager.createGraphViewButton(vaultAnalysisContainer);
    }

    private createColorSettingsButton() {
        const settingsButton = this.container.createDiv({ cls: 'color-settings-button' });
        setIcon(settingsButton, 'settings-2');

        const dropdown = this.container.createDiv({ cls: 'color-settings-dropdown' });

        // Display toggles section
        const displaySection = dropdown.createDiv({ cls: 'graph-settings-display-section' });
        displaySection.createDiv({ cls: 'graph-settings-section-title', text: 'Display' });

        const labelsRow = displaySection.createDiv({ cls: 'graph-settings-toggle-row' });
        labelsRow.createDiv({ cls: 'graph-settings-toggle-label', text: 'Labels' });
        const labelsTrack = labelsRow.createDiv({ cls: 'graph-settings-toggle-switch' });
        const labelsToggle = labelsTrack.createDiv({ cls: `toggle-track ${this.showNodeLabels ? 'active' : ''}` });
        labelsToggle.createDiv({ cls: 'toggle-handle' });
        labelsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNodeLabels(!this.showNodeLabels);
            labelsToggle.classList.toggle('active', this.showNodeLabels);
        });

        const arrowsRow = displaySection.createDiv({ cls: 'graph-settings-toggle-row' });
        arrowsRow.createDiv({ cls: 'graph-settings-toggle-label', text: 'Arrows' });
        const arrowsTrack = arrowsRow.createDiv({ cls: 'graph-settings-toggle-switch' });
        const arrowsToggle = arrowsTrack.createDiv({ cls: `toggle-track ${this.showArrows ? 'active' : ''}` });
        arrowsToggle.createDiv({ cls: 'toggle-handle' });
        arrowsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleArrows(!this.showArrows);
            arrowsToggle.classList.toggle('active', this.showArrows);
        });

        // Create gradient selectors for each centrality type
        this.centralityTypes.forEach(type => {
            const section = dropdown.createDiv({ cls: 'gradient-section' });
            
            // Add section title
            section.createDiv({
                cls: 'gradient-section-title',
                text: type
            });

            // Create current gradient preview
            const preview = section.createDiv({ cls: 'gradient-preview' });
            this.updateGradientPreview(preview, this.selectedPalettes[type], type);

            // Create options container for this section
            const optionsContainer = section.createDiv({ cls: 'gradient-options' });

            // Create gradient controls inside options container
            const controls = optionsContainer.createDiv({ cls: 'gradient-controls' });

            // Type selector
            const typeRow = controls.createDiv({ cls: 'gradient-control-row' });
            typeRow.createDiv({ cls: 'gradient-control-label', text: 'Type' });
            const typeSelect = typeRow.createDiv({ cls: 'gradient-control-input' }).createEl('select');
            ['sequential', 'diverging', 'cyclical', 'qualitative'].forEach(t => {
                const option = typeSelect.createEl('option', { value: t, text: t });
                if (t === this.gradientSettings[type].type) {
                    option.selected = true;
                }
            });

            // Distribution selector
            const distributionRow = controls.createDiv({ cls: 'gradient-control-row' });
            distributionRow.createDiv({ cls: 'gradient-control-label', text: 'Scale' });
            const distributionSelect = distributionRow.createDiv({ cls: 'gradient-control-input' }).createEl('select');
            ['linear', 'quantize', 'jenks'].forEach(d => {
                const option = distributionSelect.createEl('option', { value: d, text: d });
                if (d === this.gradientSettings[type].distribution) {
                    option.selected = true;
                }
            });
            distributionSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                const target = e.target as HTMLSelectElement;
                this.gradientSettings[type].distribution = target.value as 'linear' | 'quantize' | 'jenks';
                if (this.centralityState[type]) {
                    void this.calculateAndDisplayCentrality(type);
                }
            });

            typeSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                const target = e.target as HTMLSelectElement;
                const val = target.value;
                if (val === 'sequential' || val === 'diverging' || val === 'cyclical' || val === 'qualitative') {
                    this.gradientSettings[type].type = val;
                }
                
                // Clear existing options
                optionsContainer.querySelectorAll('.gradient-option').forEach(opt => opt.remove());
                
                // Add filtered palettes based on selected type
                this.colorPalettes
                    .filter(palette => {
                        if (target.value === 'qualitative') {
                            return palette.type === 'qualitative';
                        } else if (target.value === 'sequential') {
                            return palette.type === 'sequential';
                        } else if (target.value === 'diverging') {
                            return palette.type === 'diverging';
                        } else if (target.value === 'cyclical') {
                            return palette.type === 'cyclical';
                        }
                        return false;
                    })
                    .forEach(palette => {
                        const option = optionsContainer.createDiv({
                            cls: `gradient-option ${this.selectedPalettes[type] === palette.name ? 'selected' : ''}`
                        });

                        // Create gradient preview with colors
                        this.updateGradientPreview(option, palette.name, type);

                        // Add click handler
                        option.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.selectedPalettes[type] = palette.name;
                            this.updateGradientPreview(preview, palette.name, type);
                            optionsContainer.querySelectorAll('.gradient-option').forEach(opt => 
                                opt.classList.remove('selected')
                            );
                            option.classList.add('selected');
                            if (this.centralityState[type]) {
                                void this.calculateAndDisplayCentrality(type);
                            }
                        });
                    });

                this.updateGradientPreview(preview, this.selectedPalettes[type], type);
                if (this.centralityState[type]) {
                    void this.calculateAndDisplayCentrality(type);
                }
            });

            // Steps input
            const stepsRow = controls.createDiv({ cls: 'gradient-control-row' });
            stepsRow.createDiv({ cls: 'gradient-control-label', text: 'Steps' });
            const stepsSelect = stepsRow.createDiv({ cls: 'gradient-control-input' }).createEl('select');
            // Add options from 2 to 20
            for (let i = 2; i <= 20; i++) {
                const option = stepsSelect.createEl('option', { value: String(i), text: String(i) });
                if (i === this.gradientSettings[type].steps) {
                    option.selected = true;
                }
            }
            stepsSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                const value = parseInt((e.target as HTMLSelectElement).value);
                this.gradientSettings[type].steps = value;
                this.updateGradientPreview(preview, this.selectedPalettes[type], type);
                if (this.centralityState[type]) {
                    void this.calculateAndDisplayCentrality(type);
                }
            });

            // Reversed button
            const reversedRow = controls.createDiv({ cls: 'gradient-control-row' });
            reversedRow.createDiv({ cls: 'gradient-control-label', text: 'Reverse' });
            const reversedButton = reversedRow.createDiv({ cls: 'gradient-control-input' })
                .createEl('button', { 
                    cls: `gradient-control-button ${this.gradientSettings[type].reversed ? 'active' : ''}`,
                    text: this.gradientSettings[type].reversed ? 'on' : 'off'
                });
            reversedButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event from bubbling up
                this.gradientSettings[type].reversed = !this.gradientSettings[type].reversed;
                reversedButton.classList.toggle('active', this.gradientSettings[type].reversed);
                reversedButton.setText(this.gradientSettings[type].reversed ? 'on' : 'off');
                this.updateGradientPreview(preview, this.selectedPalettes[type], type);
                if (this.centralityState[type]) {
                    void this.calculateAndDisplayCentrality(type);
                }
            });

            // Add all available palettes as options, filtered by current type
            this.colorPalettes
                .filter(palette => {
                    const currentType = this.gradientSettings[type].type;
                    if (currentType === 'qualitative') {
                        return palette.type === 'qualitative';
                    } else if (currentType === 'sequential') {
                        return palette.type === 'sequential';
                    } else if (currentType === 'diverging') {
                        return palette.type === 'diverging';
                    } else if (currentType === 'cyclical') {
                        return palette.type === 'cyclical';
                    }
                    return false;
                })
                .forEach(palette => {
                    const option = optionsContainer.createDiv({
                        cls: `gradient-option ${this.selectedPalettes[type] === palette.name ? 'selected' : ''}`
                    });

                    // Create gradient preview with colors
                    this.updateGradientPreview(option, palette.name, type);

                    // Add click handler
                    option.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.selectedPalettes[type] = palette.name;
                        this.updateGradientPreview(preview, palette.name, type);
                        optionsContainer.querySelectorAll('.gradient-option').forEach(opt => 
                            opt.classList.remove('selected')
                        );
                        option.classList.add('selected');
                        if (this.centralityState[type]) {
                            void this.calculateAndDisplayCentrality(type);
                        }
                    });
                });

            // Handle preview click to toggle options
            preview.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Close other expanded sections
                dropdown.querySelectorAll('.gradient-options.expanded').forEach(opt => {
                    if (opt !== optionsContainer) {
                        opt.classList.remove('expanded');
                    }
                });

                // Toggle this section's options
                optionsContainer.classList.toggle('expanded');
            });

            // Prevent clicks inside the options container from closing it
            optionsContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });

        // Toggle dropdown on button click
        settingsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('color-settings-dropdown-visible');
        });

        // Prevent clicks inside the dropdown from closing it
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Close dropdown only when clicking outside
        this.documentClickHandler = () => {
            dropdown.classList.remove('color-settings-dropdown-visible');
        };
        document.addEventListener('click', this.documentClickHandler);
    }

    private toggleNodeLabels(enabled: boolean): void {
        this.showNodeLabels = enabled;
        if (this.labelsSelection && !this.labelsSelection.empty()) {
            if (enabled) {
                this.labelsSelection.style('display', null);
            } else {
                this.labelsSelection.style('display', 'none');
            }
        }
    }

    private toggleArrows(enabled: boolean): void {
        this.showArrows = enabled;
        if (this.linksSelection && !this.linksSelection.empty()) {
            this.linksSelection.attr('marker-end', enabled ? `url(#${this.markerIdDefault})` : null);
        }
        this.updateGraph();
    }

    private updateGradientPreview(element: HTMLElement, paletteName: string, type?: typeof this.centralityTypes[number]) {
        element.empty();
        const palette = this.colorPalettes.find(p => p.name === paletteName);
        if (palette) {
            const settings = type ? this.gradientSettings[type] : { steps: 6, reversed: false };
            const colorRange = colorPaletteToColorRange(palette, {
                steps: settings.steps,
                reversed: settings.reversed
            });
            colorRange.colors.forEach(color => {
                const colorBox = element.createDiv({ cls: 'color-box' });
                colorBox.style.setProperty('background-color', color);
            });
        }
    }

    private createCentralityButton(type: typeof this.centralityTypes[number]): HTMLElement {
        if (!this.controlPanel) throw new Error('Control panel not initialized');
        const button = this.controlPanel.createDiv({ cls: 'centrality-button' });
        
        // Set button label based on type
        const label = type.charAt(0).toUpperCase(); // First letter capitalized
        button.setText(label);
        
        // Create tooltip with title and description
        const tooltipEl = button.createDiv({ cls: 'centrality-button-tooltip' });
        
        // Add title (capitalize first letter and add "Centrality")
        tooltipEl.createDiv({ 
            cls: 'tooltip-title',
            text: `${type.charAt(0).toUpperCase() + type.slice(1)} Centrality`
        });
        
        // Add description based on centrality type
        const description = tooltipEl.createDiv({ cls: 'tooltip-description' });
        switch (type) {
            case 'betweenness':
                description.setText('Measures how often a node acts as a bridge along the shortest path between two other nodes. Higher values indicate more important bridge nodes.');
                break;
            case 'closeness':
                description.setText('Measures how close a node is to all other nodes in the network. Higher values indicate nodes that can quickly reach or communicate with other nodes.');
                break;
            case 'eigenvector':
                description.setText('Measures node importance based on the importance of its neighbors. Higher values indicate nodes connected to other important nodes.');
                break;
        }
        
        // Add click handler
        button.addEventListener('click', () => {
            void (async () => {
                const isActive = this.centralityState[type];
                if (isActive) {
                // If already active, deactivate it
                button.removeClass('active');
                this.centralityState[type] = false;
                this.activeButton = null;
                
                // Reset node colors to default
                this.nodesSelection
                    .transition()
                    .duration(this.ANIMATION.DURATION)
                    .style('fill', 'var(--graph-node-color-default)')
                    .style('opacity', 'var(--graph-node-opacity-default)');
                
                // Clear the last centrality scores
                this.lastCentralityScores = {};

                // Hide the centrality results view and collapse the right sidebar
                const leaf = this.app.workspace.getLeavesOfType(CENTRALITY_RESULTS_VIEW_TYPE)[0];
                if (leaf) {
                    leaf.detach();
                    
                    // Collapse the right sidebar
                    const rightSplit = this.app.workspace.rightSplit;
                    if (rightSplit && rightSplit.collapsed === false) {
                        rightSplit.collapse();
                    }
                }
                } else {
                // Deactivate other buttons and states
                this.centralityTypes.forEach(t => {
                    this.centralityState[t] = false;
                    const otherButton = this.controlPanel?.querySelector(`[data-centrality-type="${t}"]`);
                    if (t !== type && otherButton instanceof HTMLElement) {
                        otherButton.removeClass('active');
                    }
                });
                
                // Activate this button and state
                button.addClass('active');
                this.centralityState[type] = true;
                this.activeButton = button;
                
                // Calculate and display the selected centrality
                await this.calculateAndDisplayCentrality(type);
                }
            })();
        });
        
        // Add data attribute for type identification
        button.setAttribute('data-centrality-type', type);
        
        return button;
    }

    private calculateAndDisplayCentrality(type: typeof this.centralityTypes[number]): Promise<void> {
        try {
            // Get centrality scores based on type
            let results: GraphNode[];
            const pluginInstance = this.pluginService.getPlugin();

            switch (type) {
                case 'betweenness':
                    results = pluginInstance.calculateBetweennessCentralityCached();
                    break;
                case 'closeness':
                    results = pluginInstance.calculateClosenessCentralityCached();
                    break;
                case 'eigenvector':
                    results = pluginInstance.calculateEigenvectorCentralityCached();
                    break;
            }

            // DEBUG: rawScores available for logging if needed
            // const rawScores = results.map(n => n.centrality[type]);

            // Store the scores for later use - use for loop for better performance
            this.lastCentralityScores = {};
            const resultCount = results.length;
            for (let i = 0; i < resultCount; i++) {
                const node = results[i];
                this.lastCentralityScores[node.node_id] = node.centrality[type] || 0;
            }

            // Find min and max scores for normalization
            const scores = Object.values(this.lastCentralityScores);
            const minScore = scores.reduce((min, v) => Math.min(min, v), Infinity);
            const maxScore = scores.reduce((max, v) => Math.max(max, v), -Infinity);

            // DEBUG: scores available for logging if needed
            
            // Get the color palette
            const palette = this.colorPalettes.find(p => p.name === this.selectedPalettes[type]);
            if (!palette) return Promise.resolve();

            // Create color range with current settings
            const colorRange = colorPaletteToColorRange(palette, {
                steps: this.gradientSettings[type].steps,
                reversed: this.gradientSettings[type].reversed
            });

            // Create color scale based on distribution method
            let colorScale: (score: number) => string;
            const colors = colorRange.colors;

            switch (this.gradientSettings[type].distribution) {
                case 'linear':
                    colorScale = d3.scaleLinear<string>()
                        .domain([minScore, maxScore])
                        .range([colors[0], colors[colors.length - 1]]);
                    break;

                case 'quantize':
                    colorScale = d3.scaleQuantize<string>()
                        .domain([minScore, maxScore])
                        .range(colors);
                    break;

                case 'jenks': {
                    // Calculate Jenks natural breaks
                    const breaks = this.calculateJenksBreaks(scores, colors.length);
                    const domain = breaks.length > 2 ? breaks.slice(1, -1) : [];
                    const range = colors.slice(0, domain.length + 1);
                    colorScale = d3.scaleThreshold<number, string>()
                        .domain(domain)
                        .range(range.length > 0 ? range : [colors[0]]);
                    break;
                }

                default:
                    colorScale = d3.scaleLinear<string>()
                        .domain([minScore, maxScore])
                        .range([colors[0], colors[colors.length - 1]]);
            }

            // Save current highlighted node ID before applying colors
            const currentHighlightedNodeId = this.highlightedNodeId;
            
            // Apply gradient colors to nodes with enhanced transition
            this.nodesSelection
                .transition()
                .duration(this.ANIMATION.DURATION)
                .style('fill', d => {
                    const score = this.lastCentralityScores[parseInt(d.id)];
                    // Handle edge cases
                    if (score === undefined || score === null) {
                        return this.NODE.COLORS.DEFAULT;
                    }
                    return colorScale(score);
                })
                .style('opacity', 'var(--graph-node-opacity-default)');

            // If a node was highlighted, restore highlighting
            if (currentHighlightedNodeId) {
                // Find the node element by ID
                const highlightedNode = this.nodesSelection.filter(d => d.id === currentHighlightedNodeId).node();
                if (highlightedNode) {
                    // Re-apply highlighting
                    setTimeout(() => {
                        this.highlightNode(highlightedNode, true);
                        this.highlightConnections(currentHighlightedNodeId, true);
                    }, this.ANIMATION.DURATION);
                }
            }

            // Display results in the right sidebar
            pluginInstance.displayResults(results, `${type.charAt(0).toUpperCase() + type.slice(1)} Centrality`);
            return Promise.resolve();
        } catch (err) {
            new Notice(`Failed to calculate ${type} centrality: ${err instanceof Error ? err.message : String(err)}`);
            return Promise.resolve();
        }
    }

    /**
     * Calculates the optimal container scale based on node count.
     * Uses a logarithmic scale to create smooth transitions between different graph sizes.
     * Small graphs (few nodes) will use less space, while larger graphs will use more.
     */
    private calculateOptimalContainerScale(): number {
        if (!this.nodes.length) return this.ZOOM.CONTAINER_SCALE.MIN;

        // Use logarithmic scaling for smooth transitions
        const normalizedCount = Math.log(this.nodes.length + 1) / Math.log(this.ZOOM.CONTAINER_SCALE.NODE_SCALE_FACTOR + 1);
        
        // Calculate scale between MIN and MAX
        const scaleRange = this.ZOOM.CONTAINER_SCALE.MAX - this.ZOOM.CONTAINER_SCALE.MIN;
        const scale = this.ZOOM.CONTAINER_SCALE.MIN + (scaleRange * Math.min(normalizedCount, 1));
        
        return scale;
    }

    /**
     * Calculate Jenks natural breaks for a dataset
     * @param data Array of numbers to classify
     * @param numClasses Number of classes to create
     * @returns Array of break points including min and max values
     */
    private calculateJenksBreaks(data: number[], numClasses: number): number[] {
        if (data.length === 0) return [];
        if (data.length === 1) return [data[0], data[0]];

        const sorted = [...data].sort((a, b) => a - b);
        const minVal = sorted[0];
        const maxVal = sorted[sorted.length - 1];
        const uniqueCount = new Set(sorted).size;

        if (uniqueCount === 1) return [minVal, minVal];

        const effectiveClasses = Math.min(Math.max(1, Math.floor(numClasses)), uniqueCount, data.length);

        if (effectiveClasses >= data.length) {
            return [...new Set(sorted)].sort((a, b) => a - b);
        }

        let breaks: number[] | null = null;
        try {
            breaks = ss.jenks(sorted, effectiveClasses);
        } catch {
            // Jenks failed; quantile fallback used below
        }

        if (!breaks || !Array.isArray(breaks) || breaks.length < 2) {
            // Quantile-based fallback
            breaks = [];
            for (let i = 0; i <= effectiveClasses; i++) {
                const pos = (sorted.length - 1) * (i / effectiveClasses);
                breaks.push(sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(pos)))]);
            }
        }

        const result = [...new Set([...breaks, minVal, maxVal])]
            .filter(v => Number.isFinite(v))
            .sort((a, b) => a - b);

        return result.length < 2 ? [minVal, maxVal] : result;
    }

    private updateNodeColors(results: GraphNode[], type: 'betweenness' | 'closeness' | 'eigenvector' | 'degree') {
        // Find min and max values for normalization
        const values = results.map(r => r.centrality[type] || 0);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        
        // Update node colors based on normalized centrality values
        this.nodesSelection.each(function(d: SimulationGraphNode) {
            const node = results.find(r => r.node_id.toString() === d.id);
            if (node && node.centrality[type] !== undefined) {
                const normalizedValue = (node.centrality[type] - minValue) / (maxValue - minValue);
                const color = d3.interpolateRdYlBu(1 - normalizedValue); // Using a color scale that works well for both light and dark themes
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style('fill', color);
            }
        });
    }
}
/* eslint-enable @typescript-eslint/unbound-method */ 