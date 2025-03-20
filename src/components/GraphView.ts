import { App, TFile, Notice } from 'obsidian';
import * as d3 from 'd3';

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
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
    private isDragging: boolean = false;
    private isResizing: boolean = false;
    private startX: number = 0;
    private startY: number = 0;
    private startWidth: number = 0;
    private startHeight: number = 0;
    
    // D3 related properties
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private graphContainer: d3.Selection<SVGGElement, unknown, null, undefined>;
    private simulation: d3.Simulation<GraphNode, GraphLink>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private initialWidth: number;
    private initialHeight: number;
    private loadingIndicator: HTMLElement | null = null;
    private nodeSizeScale: d3.ScaleLinear<number, number>;
    private calculateDegreeCentrality: CentralityCalculator | null = null;

    // Bound event handlers
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundMouseDown: (e: MouseEvent) => void;
    private boundResizeStart: (e: MouseEvent) => void;

    constructor(app: App, calculateDegreeCentrality?: CentralityCalculator) {
        this.app = app;
        this.calculateDegreeCentrality = calculateDegreeCentrality || null;
        
        // Bind event handlers once
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundResizeStart = this.onResizeStart.bind(this);
        
        // Initialize node size scale (will be updated later with actual data)
        this.nodeSizeScale = d3.scaleLinear().range([10, 30]);
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

    private async initializeD3() {
        // Create SVG container
        this.svg = d3.select(this.canvas)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .style('position', 'absolute')
            .style('top', 0)
            .style('left', 0);

        // Add zoom behavior
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.graphContainer.attr('transform', event.transform);
            });

        // Add a group for the graph that will be transformed
        this.graphContainer = this.svg.append('g');

        // Enable zoom and pan
        this.svg.call(this.zoom);

        // Get the available height (accounting for title bar)
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar

        // Initialize force simulation
        this.simulation = d3.forceSimulation<GraphNode>()
            .force('charge', d3.forceManyBody().strength(-100))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide<GraphNode>().radius(d => this.getNodeRadius(d) + 5))
            .force('link', d3.forceLink<GraphNode, GraphLink>()
                .id(d => d.id)
                .distance(d => this.getLinkDistance(d)))
            .on('tick', () => this.updateGraph());
            
        // Set the initial transform to center the graph properly
        this.updateGraphTransform();
    }

    private getNodeRadius(node: GraphNode): number {
        // Default size if no centrality score is available
        if (node.centralityScore === undefined) {
            return 8;
        }
        
        // Get max centrality score
        const maxScore = this.getMaxCentralityScore();
        if (maxScore === 0) return 8; // Avoid division by zero
        
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
        
        // Base size range
        const minRadius = 9;
        const maxRadius = minRadius * scaleFactor;
        
        // Normalized score (0-1)
        const normalizedScore = node.centralityScore / maxScore;
        
        // Apply the scale factor to determine the final radius
        const radius = minRadius + normalizedScore * (maxRadius - minRadius);
        
        return radius;
    }
    
    private getMaxCentralityScore(): number {
        if (!this.nodes || this.nodes.length === 0) return 1;
        
        let maxScore = 0;
        for (const node of this.nodes) {
            if (node.centralityScore !== undefined && node.centralityScore > maxScore) {
                maxScore = node.centralityScore;
            }
        }
        return maxScore > 0 ? maxScore : 1; // Avoid returning 0
    }

    private getLinkDistance(link: GraphLink): number {
        // Get source and target nodes
        const source = this.nodes.find(n => n.id === (typeof link.source === 'string' ? link.source : (link.source as any).id));
        const target = this.nodes.find(n => n.id === (typeof link.target === 'string' ? link.target : (link.target as any).id));
        
        if (!source || !target) return 100;
        
        // Base distance plus the sum of the node radii
        return 50 + this.getNodeRadius(source) + this.getNodeRadius(target);
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
        this.graphContainer.attr('transform', 
            `translate(${centerX}, ${centerY}) scale(${scale}) translate(${-this.initialWidth/2}, ${-(this.initialHeight-32)/2})`);
    }

    private updateGraph() {
        // Update links
        this.graphContainer.selectAll<SVGLineElement, GraphLink>('line')
            .data(this.links)
            .join(
                enter => enter.append('line')
                    .attr('stroke-width', 2)
                    .attr('class', 'graph-link'),
                update => update,
                exit => exit.remove()
            )
            .attr('x1', d => (d.source as unknown as GraphNode).x!)
            .attr('y1', d => (d.source as unknown as GraphNode).y!)
            .attr('x2', d => (d.target as unknown as GraphNode).x!)
            .attr('y2', d => (d.target as unknown as GraphNode).y!);

        // Update nodes
        const nodes = this.graphContainer.selectAll<SVGCircleElement, GraphNode>('circle')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('circle')
                    .attr('r', d => this.getNodeRadius(d))
                    .attr('fill', 'var(--text-accent)')
                    .attr('opacity', 0.6)
                    .attr('class', 'graph-node')
                    .call(this.drag())
                    .on('click', (event, d) => this.handleNodeClick(d)),
                update => update.attr('r', d => this.getNodeRadius(d)),
                exit => exit.remove()
            )
            .attr('cx', d => (d as any).x)
            .attr('cy', d => (d as any).y);

        // Add hover effect
        nodes
            .on('mouseover', (event, d) => {
                this.highlightConnections(d.id, true);
            })
            .on('mouseout', (event, d) => {
                this.highlightConnections(d.id, false);
            });

        // Add labels
        this.graphContainer.selectAll<SVGTextElement, GraphNode>('text')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('text')
                    .attr('dy', d => this.getNodeRadius(d) + 15)
                    .attr('text-anchor', 'middle')
                    .style('fill', 'var(--text-normal)')
                    .style('font-size', '12px')
                    .attr('class', 'graph-label')
                    .text(d => d.name),
                update => update.attr('dy', d => this.getNodeRadius(d) + 15),
                exit => exit.remove()
            )
            .attr('x', d => (d as any).x)
            .attr('y', d => (d as any).y);
    }

    private highlightConnections(nodeId: string, highlight: boolean) {
        // Find all connected links
        const connectedLinks = this.links.filter(link => 
            link.source === nodeId || (link.source as any).id === nodeId || 
            link.target === nodeId || (link.target as any).id === nodeId
        );
        
        // Get connected node IDs (both source and target)
        const connectedNodeIds = new Set<string>();
        connectedLinks.forEach(link => {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as any).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as any).id;
            connectedNodeIds.add(sourceId);
            connectedNodeIds.add(targetId);
        });
        
        // Highlight the selected node
        this.graphContainer.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .filter(d => d.id === nodeId)
            .transition()
            .duration(200)
            .attr('r', d => highlight ? this.getNodeRadius(d) * 1.2 : this.getNodeRadius(d))
            .attr('opacity', highlight ? 1 : 0.6);
            
        // Highlight connected nodes
        this.graphContainer.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .filter(d => d.id !== nodeId && connectedNodeIds.has(d.id))
            .transition()
            .duration(200)
            .attr('opacity', highlight ? 0.9 : 0.6);
            
        // Define the colors explicitly
        const accentColor = '#705dcf'; // Purple color similar to default Obsidian accent
            
        // Highlight connected links with direct color
        this.graphContainer.selectAll<SVGLineElement, GraphLink>('.graph-link')
            .filter(d => {
                const sourceId = typeof d.source === 'string' ? d.source : (d.source as any).id;
                const targetId = typeof d.target === 'string' ? d.target : (d.target as any).id;
                return sourceId === nodeId || targetId === nodeId;
            })
            .style('stroke', highlight ? accentColor : '')
            .style('stroke-opacity', highlight ? '1' : '')
            .style('stroke-width', highlight ? '3px' : '2px');
            
        // Also highlight the labels of connected nodes
        this.graphContainer.selectAll<SVGTextElement, GraphNode>('.graph-label')
            .filter(d => connectedNodeIds.has(d.id))
            .transition()
            .duration(200)
            .style('font-weight', highlight ? 'bold' : 'normal')
            .style('opacity', highlight ? 1 : 0.8);
    }

    private handleNodeClick(node: GraphNode) {
        if (node.path) {
            // Open the note when the node is clicked
            const file = this.app.vault.getAbstractFileByPath(node.path);
            if (file instanceof TFile) {
                this.app.workspace.getLeaf().openFile(file);
            }
        }
    }

    private drag() {
        return d3.drag<SVGCircleElement, GraphNode>()
            .on('start', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0.3).restart();
                (d as any).fx = (d as any).x;
                (d as any).fy = (d as any).y;
                
                // Highlight connections when dragging starts
                this.highlightConnections(d.id, true);
            })
            .on('drag', (event, d) => {
                (d as any).fx = event.x;
                (d as any).fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) this.simulation.alphaTarget(0);
                (d as any).fx = null;
                (d as any).fy = null;
                
                // Remove highlighting when dragging ends
                this.highlightConnections(d.id, false);
            });
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
            
            return results;
        } catch (error) {
            console.error('Error calculating centrality:', error);
            return [];
        }
    }

    private async loadVaultData() {
        // Build graph data from vault
        const graphData = await this.buildGraphData();
        
        // Calculate degree centrality using WASM
        const centralityResults = this.calculateCentrality(graphData);
        
        // Convert to D3 format
        this.nodes = [];
        this.links = [];
        
        // Create nodes
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
                centralityScore: centralityScore
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
        collisionForce.radius(d => this.getNodeRadius(d) + 5);
        
        // Restart simulation
        this.simulation.alpha(1).restart();
    }

    private async buildGraphData(): Promise<GraphData> {
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

    // Return the canvas element for external access
    public getCanvas(): HTMLElement {
        return this.canvas;
    }

    public onunload() {
        // Clean up event listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
        
        // Clean up D3
        if (this.simulation) {
            this.simulation.stop();
        }
    }
} 