import { App, Notice, TFile, setIcon } from 'obsidian';
import * as d3 from 'd3';
import * as ss from 'simple-statistics';
import { 
    SimulationGraphLink, 
    SimulationGraphNode,
    GraphData,
    Node as GraphNode,
    GraphMetadata
} from '../../types/types';
import { GraphDataBuilder } from './data/graph-builder';
import { PluginService } from '../../services/PluginService';
import { CENTRALITY_RESULTS_VIEW_TYPE } from '../../views/CentralityResultsView';
import {
    KEPLER_COLOR_PALETTES,
    colorPaletteToColorRange,
    // buildCustomPalette,
    // CATEGORIES
} from '../../utils/color-palette';

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
    private graphMetadata: GraphMetadata | null = null;
    private width: number;
    private height: number;
    
    // Core components
    private graphDataBuilder: GraphDataBuilder;
    private pluginService: PluginService;
    
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
            BASE: 4,
            MAX: 12,
            SCALE_FACTOR: 0.69
        },
        COLORS: {
            DEFAULT: 'var(--graph-node-color-default)',
            HIGHLIGHTED: 'var(--graph-node-color-highlighted)'
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
    private cachedNeighbors: Set<number> | null = null;
    private cachedNodeId: number | null = null;
    
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

    // Control panel elements
    private controlPanel: HTMLElement;
    private activeButton: HTMLElement | null = null;

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

    // Add a new property to track the current zoom scale
    private currentZoomScale: number = 1;

    // Add a label visibility constant to control when labels appear
    private readonly LABEL = {
        VISIBILITY: {
            SHOW_THRESHOLD: 0.7  // Only show labels when zoomed in beyond this scale
        }
    } as const;

    constructor(app: App) {
        this.app = app;
        
        // Initialize core modules
        this.pluginService = new PluginService(app);
        this.graphDataBuilder = new GraphDataBuilder(app);
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Initialize D3 components
        this.initializeD3();
        
        // Setup zoom behavior
        this.setupZoomBehavior();
        
        // Create control panel
        this.createControlPanel();
        
        // Setup visibility detection
        this.setupVisibilityObserver();
        
        // Setup vault event handlers
        this.setupVaultEventHandlers();
        
        // Mark container as initialized
        this.container.addClass('graph-initialized');
        
        // Load vault data
        this.showLoadingIndicator();
        try {
            // Ensure WASM is initialized first
            await this.pluginService.ensureWasmLoaded();
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
                
                // Store current zoom scale for label visibility calculation
                this.currentZoomScale = event.transform.k;
                
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
                this.restartSimulationGently();
                
                // Update label visibility after zoom ends
                this.updateLabelVisibility();
            });
            
        // Enable zoom and pan
        this.svg.call(this.zoom);
        
        // Initial transform to show the entire graph
        this.recenterGraph();
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
                .distance(250)) // link distance: 250
            // Charge force creates repulsion between nodes (repel force: 10)
            .force('charge', d3.forceManyBody()
                .strength(-1000)) // Stronger repulsion to match Obsidian's repel force of 10
            // Center forces to keep the graph roughly centered (center force: 0.52)
            .force('x', d3.forceX().strength(0.052)) // Scaled down by factor of 10 to match D3's scale
            .force('y', d3.forceY().strength(0.052)) // Scaled down by factor of 10 to match D3's scale
            // Simple collision detection to prevent overlap
            .force('collision', d3.forceCollide<SimulationGraphNode>()
                .radius(d => this.getNodeRadius(d) + 1)
                .strength(0.7))
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
        } catch (e) {
            console.error("Error restarting simulation:", e);
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

        // For performance, only update visible labels and use a cached margin value
        // First, get all visible labels as an array to avoid repeated filtering
        const visibleLabels = labelsSelection.filter(function() { 
            return d3.select(this).style('display') !== 'none';
        });
        
        // Use a fixed margin value to avoid expensive DOM access on every node
        const labelMargin = 8;
        
        // Only update position of visible labels
        visibleLabels
            .attr('x', d => (d.x || 0))
            .attr('y', d => {
                const radius = this.getNodeRadius(d);
                return (d.y || 0) + radius + labelMargin;
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
                    console.error('Unexpected result format from WASM neighbor function', neighborResult);
                    throw new Error('Unexpected result format from WASM');
                }
            } catch (error) {
                console.error('Error in highlightConnections with WASM:', error);
                this.cachedNodeId = null;
                this.cachedNeighbors = null;
                return;
            }
        }
        
        // Check if any centrality analysis is active
        const isCentralityActive = Object.values(this.centralityState).some(state => state);
        
        // Dim all nodes and links not connected
        this.nodesSelection.each(function(d) {
            const isSelected = d.id === nodeId;
            const isConnected = isSelected || connectedNodeIds.has(parseInt(d.id));
            const selection = d3.select(this);
            
            selection.transition()
                .duration(animationDuration)
                .style('opacity', isConnected ? 'var(--graph-node-opacity-default)' : 'var(--graph-node-opacity-dimmed)');
            
            // Only change the fill color if centrality analysis is not active
            if (!isCentralityActive) {
                selection.transition()
                    .duration(animationDuration)
                    .style('fill', isSelected ? 'var(--graph-node-color-highlighted)' : 'var(--graph-node-color-default)');
            }
            
            // For highlighted nodes in centrality mode, add a stroke for visual feedback
            if (isCentralityActive && isSelected) {
                selection.transition()
                    .duration(animationDuration)
                    .style('stroke', 'var(--graph-node-color-highlighted)')
                    .style('stroke-width', '2px');
            }
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

        // Update label styles without limiting which ones are visible
        if (this.labelsSelection) {
            // Only manipulate labels if they're visible (based on zoom level)
            const isZoomedIn = this.currentZoomScale >= this.LABEL.VISIBILITY.SHOW_THRESHOLD;
            
            if (isZoomedIn) {
                // Update styles without changing visibility
                this.labelsSelection.each(function(d) {
                    const isSelected = d.id === nodeId;
                    const isConnected = isSelected || connectedNodeIds.has(parseInt(d.id));
                    
                    d3.select(this)
                        .style('opacity', isConnected ? 'var(--graph-label-opacity-highlighted)' : 'var(--graph-label-opacity-dimmed)')
                        .style('fill', isSelected ? 'var(--graph-label-color-highlighted)' : 'var(--graph-label-color)');
                });
            }
        }
    }
    
    private resetHighlights() {
        // Clear the neighbors cache when resetting highlights
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
        
        // Store animation duration in a local variable for consistency with other methods
        const animationDuration = this.ANIMATION.DURATION;
        
        // Check if any centrality analysis is active
        const isCentralityActive = Object.values(this.centralityState).some(state => state);
        
        // Reset all nodes, links, and labels to default state
        this.nodesSelection
            .transition()
            .duration(animationDuration)
            .style('opacity', 'var(--graph-node-opacity-default)')
            .style('stroke', 'var(--graph-node-color-default)')
            .style('stroke-width', 'var(--graph-node-stroke-width)');
        
        // Only reset fill color if no centrality analysis is active
        if (!isCentralityActive) {
            this.nodesSelection
                .transition()
                .duration(animationDuration)
                .style('fill', 'var(--graph-node-color-default)');
        }
            
        // Reset links to default style
        this.linksSelection
            .transition()
            .duration(animationDuration)
            .style('stroke-opacity', 'var(--graph-link-opacity-default)')
            .style('stroke-width', 'var(--graph-link-width-default)')
            .style('stroke', 'var(--graph-link-color-default)');

        // Reset label visibility based on zoom level
        this.updateLabelVisibility();
    }
    
    private setupDragBehavior() {
        return d3.drag<SVGCircleElement, SimulationGraphNode>()
            .on('start', (event, d) => {
                // Reheat simulation when drag starts
                if (!event.active && this.simulation) {
                    this.simulation.alphaTarget(0.3).restart();
                }
                
                // Fix the position of the dragged node
                d.fx = d.x;
                d.fy = d.y;
                
                // Set drag state and remove tooltip
                this.isDraggingNode = true;
                this.clearTooltipTimeout();
                this.removeNodeTooltip();
                
                // Apply highlighting
                this.highlightedNodeId = d.id;
                this.highlightNode(event.sourceEvent.currentTarget, true);
                this.highlightConnections(d.id, true);
            })
            .on('drag', (event, d) => {
                // Update the fixed position of the dragged node
                d.fx = event.x;
                d.fy = event.y;
                
                // Maintain highlighting during drag
                if (this.highlightedNodeId !== d.id) {
                    this.highlightedNodeId = d.id;
                    this.highlightNode(event.sourceEvent.currentTarget, true);
                    this.highlightConnections(d.id, true);
                }
            })
            .on('end', (event, d) => {
                // Cool down the simulation
                if (!event.active && this.simulation) {
                    this.simulation.alphaTarget(0);
                }
                
                // Release the fixed position if shift is not pressed
                if (!event.sourceEvent.shiftKey) {
                    d.fx = null;
                    d.fy = null;
                }

                // Reset drag state
                this.isDraggingNode = false;

                // Check if mouse is still over the node
                const element = event.sourceEvent.target;
                const bounds = element.getBoundingClientRect();
                const mouseX = event.sourceEvent.clientX;
                const mouseY = event.sourceEvent.clientY;
                
                const isMouseOver = mouseX >= bounds.left && mouseX <= bounds.right && 
                                  mouseY >= bounds.top && mouseY <= bounds.bottom;

                if (!isMouseOver) {
                    // Reset highlights if mouse is not over the node
                    setTimeout(() => {
                        if (!this.isDraggingNode && this.highlightedNodeId === d.id) {
                            this.highlightNode(element, false);
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
        const nodeData = node.datum() as SimulationGraphNode;
        
        // Get the current node fill color, which could be a gradient if centrality analysis is active
        const currentFill = node.style('fill');
        
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
            // Get graph data, degree centrality and metadata from builder
            const { graphData, degreeCentrality, metadata } = await this.graphDataBuilder.buildGraphData();
            
            // Store metadata for later use
            this.graphMetadata = metadata;
            
            // Log additional details about the graph structure
            console.log('Graph structure summary:');
            console.log(`  Nodes: ${metadata.node_count}`);
            console.log(`  Edges: ${metadata.edge_count}`);
            console.log(`  Max degree: ${metadata.max_degree}`);
            console.log(`  Avg degree: ${metadata.avg_degree.toFixed(2)}`);
            console.log(`  Directed: ${metadata.is_directed}`);
            console.log(`  Avg connections per node: ${(metadata.edge_count / metadata.node_count).toFixed(2)}`);
            
            // Convert edges to links format
            const nodes: SimulationGraphNode[] = graphData.nodes.map((nodePath: string, index: number) => {
                const fileName = nodePath.split('/').pop() || nodePath;
                const displayName = fileName.replace('.md', '');
                
                // Find degree centrality for this node
                const nodeData = degreeCentrality?.find(r => r?.node_id === index);
                // Safely access centrality.degree with multiple null checks
                const degreeCentralityScore = nodeData && nodeData.centrality && nodeData.centrality.degree !== undefined
                    ? nodeData.centrality.degree 
                    : 0;
                
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
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
        
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

        // Apply initial label visibility based on zoom level
        this.updateLabelVisibility();

        // Setup event handlers
        this.setupNodeEventHandlers();
        
        // Update simulation with new data
        if (this.simulation) {
            // Assign random initial positions to prevent all nodes starting at (0,0)
            // which can cause the slow central collapse
            this.nodes.forEach(node => {
                if (!node.x && !node.y) {
                    // Use circle packing algorithm to distribute nodes
                    const angle = Math.random() * 2 * Math.PI;
                    const radius = 100 + Math.random() * 200; // Distribute within a larger radius
                    node.x = Math.cos(angle) * radius;
                    node.y = Math.sin(angle) * radius;
                }
            });

            // Update the simulation with our nodes and links
            this.simulation.nodes(this.nodes);
            const linkForce = this.simulation.force('link') as d3.ForceLink<SimulationGraphNode, SimulationGraphLink>;
            if (linkForce) {
                linkForce.links(this.links);
            }

            // Start the simulation with a higher alpha for better initial layout
            this.simulation.alpha(1).restart();
            
            // Automatically cool down the simulation after a short time
            setTimeout(() => {
                if (this.simulation) {
                    this.simulation.alphaTarget(0);
                }
            }, 3000);
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
        
        // Track if we've handled orphan nodes specially
        let orphanNodesHandled = false;
        
        // First pass - find the bounds
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
        
        // Handle the special case where all nodes are at the center
        if (Math.abs(maxX - minX) < 20 && Math.abs(maxY - minY) < 20) {
            // We have identified a collapsed graph with very small bounds
            orphanNodesHandled = true;
            
            // Redistribute nodes in a circle to create some initial space
            const nodeCount = this.nodes.length;
            const radius = Math.sqrt(nodeCount) * 15; // Scale radius based on node count
            
            this.nodes.forEach((node, i) => {
                // Place nodes in a circle or grid formation
                if (nodeCount <= 50) { 
                    // Circle layout for small graphs
                    const angle = (i / nodeCount) * 2 * Math.PI;
                    node.x = Math.cos(angle) * radius;
                    node.y = Math.sin(angle) * radius;
                } else {
                    // Grid layout for larger graphs
                    const gridSize = Math.ceil(Math.sqrt(nodeCount));
                    const col = i % gridSize;
                    const row = Math.floor(i / gridSize);
                    const gridSpacing = radius / 2;
                    
                    node.x = (col - gridSize/2) * gridSpacing;
                    node.y = (row - gridSize/2) * gridSpacing;
                }
                
                // Calculate new bounds with the rearranged nodes
                const nodeRadius = this.getNodeRadius(node);
                minX = Math.min(minX, node.x - nodeRadius);
                minY = Math.min(minY, node.y - nodeRadius);
                maxX = Math.max(maxX, node.x + nodeRadius);
                maxY = Math.max(maxY, node.y + nodeRadius);
            });
            
            // Restart simulation to apply new positions
            if (this.simulation) {
                this.simulation.alpha(1).restart();
            }
        }
        
        // Only proceed if we have valid bounds
        if (minX === Infinity || minY === Infinity) return;
        
        // Calculate width and height of the graph
        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;
        
        // Safety check for zero dimensions
        if (graphWidth === 0 || graphHeight === 0) return;
        
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
        // Fix: translate relative to center of container's viewBox (which is centered at 0,0)
        const transform = d3.zoomIdentity
            .translate(-centerX * scale, -centerY * scale)
            .scale(scale);
        
        if (animate && !orphanNodesHandled) {
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
        this.cachedNodeId = null;
        this.cachedNeighbors = null;
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
            // @ts-ignore - explicitly break circular references
            this.svg = null;
        }
        
        // Clear remaining references
        // @ts-ignore - explicitly break circular references
        this.container = null;
        // @ts-ignore - explicitly break circular references
        this.graphDataBuilder = null;
        // @ts-ignore - explicitly break circular references
        this.pluginService = null;
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

    private createControlPanel() {
        // Create control panel container
        this.controlPanel = this.container.createDiv({ cls: 'centrality-control-panel' });
        
        // Create color settings button
        this.createColorSettingsButton();
        
        // Create centrality buttons
        this.centralityTypes.forEach(type => {
            this.createCentralityButton(type);
        });
    }

    private createColorSettingsButton() {
        const settingsButton = this.container.createDiv({ cls: 'color-settings-button' });
        setIcon(settingsButton, 'settings-2');

        const dropdown = this.container.createDiv({ cls: 'color-settings-dropdown' });
        dropdown.style.display = 'none';

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
                    this.calculateAndDisplayCentrality(type);
                }
            });

            typeSelect.addEventListener('change', (e) => {
                e.stopPropagation(); // Prevent event from bubbling up
                const target = e.target as HTMLSelectElement;
                this.gradientSettings[type].type = target.value as any;
                
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
                                this.calculateAndDisplayCentrality(type);
                            }
                        });
                    });

                this.updateGradientPreview(preview, this.selectedPalettes[type], type);
                if (this.centralityState[type]) {
                    this.calculateAndDisplayCentrality(type);
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
                    this.calculateAndDisplayCentrality(type);
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
                    this.calculateAndDisplayCentrality(type);
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
                            this.calculateAndDisplayCentrality(type);
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
            const isVisible = dropdown.style.display !== 'none';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });

        // Prevent clicks inside the dropdown from closing it
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Close dropdown only when clicking outside
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });
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
                colorBox.style.backgroundColor = color;
                colorBox.style.flex = '1';
            });
        }
    }

    private createCentralityButton(type: typeof this.centralityTypes[number]): HTMLElement {
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
        button.addEventListener('click', async () => {
            const isActive = this.centralityState[type];
            const plugin = this.pluginService.getPlugin();

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

                // Hide the centrality results view
                const leaf = this.app.workspace.getLeavesOfType(CENTRALITY_RESULTS_VIEW_TYPE)[0];
                if (leaf) {
                    leaf.detach();
                }
            } else {
                // Deactivate other buttons and states
                this.centralityTypes.forEach(t => {
                    this.centralityState[t] = false;
                    const otherButton = this.controlPanel.querySelector(`[data-centrality-type="${t}"]`);
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
        });
        
        // Add data attribute for type identification
        button.setAttribute('data-centrality-type', type);
        
        return button;
    }

    private async calculateAndDisplayCentrality(type: typeof this.centralityTypes[number]) {
        try {
            // Get centrality scores based on type
            let results: GraphNode[];
            const plugin = this.pluginService.getPlugin();
            
            switch (type) {
                case 'betweenness':
                    results = plugin.calculateBetweennessCentralityCached();
                    break;
                case 'closeness':
                    results = plugin.calculateClosenessCentralityCached();
                    break;
                case 'eigenvector':
                    results = plugin.calculateEigenvectorCentralityCached();
                    break;
            }

            // Store the scores for later use
            this.lastCentralityScores = {};
            results.forEach(node => {
                this.lastCentralityScores[node.node_id] = node.centrality[type] || 0;
            });

            // Find min and max scores for normalization
            const scores = Object.values(this.lastCentralityScores);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);
            
            // Get the color palette
            const palette = this.colorPalettes.find(p => p.name === this.selectedPalettes[type]);
            if (!palette) return;

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

                case 'jenks':
                    // Calculate Jenks natural breaks
                    const breaks = this.calculateJenksBreaks(scores, colors.length);
                    colorScale = d3.scaleThreshold<number, string>()
                        .domain(breaks.slice(1, -1)) // Remove first and last break points
                        .range(colors);
                    break;

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
            plugin.displayResults(results, `${type.charAt(0).toUpperCase() + type.slice(1)} Centrality`);

        } catch (error) {
            console.error(`Failed to calculate ${type} centrality:`, error);
            new Notice(`Failed to calculate ${type} centrality: ${(error as Error).message}`);
        }
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
        if (numClasses >= data.length) return [...new Set(data)].sort((a: number, b: number) => a - b);

        // Use simple-statistics for Jenks Natural Breaks calculation
        const breaks = ss.jenks(data, numClasses);
        
        // Ensure we include both min and max values
        if (!breaks.includes(Math.min(...data))) {
            breaks.unshift(Math.min(...data));
        }
        if (!breaks.includes(Math.max(...data))) {
            breaks.push(Math.max(...data));
        }
        
        return breaks.sort((a: number, b: number) => a - b);
    }

    // private async resetToDegree() {
    //     try {
    //         const plugin = this.pluginService.getPlugin();
    //         const results = plugin.calculateDegreeCentralityCached();
    //         this.updateNodeColors(results, 'degree');
    //     } catch (error) {
    //         console.error('Failed to reset to degree centrality:', error);
    //         new Notice('Failed to reset to degree centrality');
    //     }
    // }

    private updateNodeColors(results: GraphNode[], type: 'betweenness' | 'closeness' | 'eigenvector' | 'degree') {
        // Find min and max values for normalization
        const values = results.map(r => r.centrality[type] || 0);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        
        // Update node colors based on normalized centrality values
        this.nodesSelection.each(function(d: SimulationGraphNode) {
            const node = results.find(r => r.node_id.toString() === d.id);
            if (node && node.centrality[type] !== undefined) {
                const normalizedValue = (node.centrality[type]! - minValue) / (maxValue - minValue);
                const color = d3.interpolateRdYlBu(1 - normalizedValue); // Using a color scale that works well for both light and dark themes
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style('fill', color);
            }
        });
    }

    // Add a new method to manage label visibility based on zoom level
    private updateLabelVisibility() {
        if (!this.labelsSelection) return;
        
        // Only show labels when zoomed in beyond the threshold
        const showLabels = this.currentZoomScale >= this.LABEL.VISIBILITY.SHOW_THRESHOLD;
        
        // Simply toggle all labels based on zoom level
        this.labelsSelection.style('display', showLabels ? 'inline' : 'none');
    }
} 