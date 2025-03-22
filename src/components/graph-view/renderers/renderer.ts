import * as d3 from 'd3';
import { GraphNode, GraphLink } from '../types';
import { NodeStyler } from './node-styles';

export class Renderer {
    private svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodes: GraphNode[] = [];
    private links: GraphLink[] = [];
    private nodesSelection: d3.Selection<SVGCircleElement, GraphNode, SVGGElement, unknown>;
    private linksSelection: d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>;
    private labelsSelection: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown>;
    private nodeStyler: NodeStyler;
    private isDragging: boolean = false;
    
    constructor(svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>, nodeStyler: NodeStyler) {
        this.svgGroup = svgGroup;
        this.nodeStyler = nodeStyler;
    }

    public setData(nodes: GraphNode[], links: GraphLink[]) {
        this.nodes = nodes;
        this.links = links;
    }

    public setDraggingState(isDragging: boolean) {
        this.isDragging = isDragging;
    }

    public updateGraph() {
        // Check if nodes and links exist
        if (this.nodes.length === 0) {
            return;
        }
        
        // Force an initial position for nodes if not set
        this.nodes.forEach(node => {
            if (node.x === undefined || node.y === undefined) {
                const width = 800; // Default width
                const height = 600; // Default height
                node.x = width / 2 + (Math.random() - 0.5) * 100;
                node.y = height / 2 + (Math.random() - 0.5) * 100;
            }
        });
        
        // Skip style updates during drag operations to prevent flashing
        const shouldUpdateStyles = !this.isDragging;
        
        // Update links positions
        this.linksSelection = this.svgGroup.selectAll<SVGLineElement, GraphLink>('line')
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
        this.nodesSelection = this.svgGroup.selectAll<SVGCircleElement, GraphNode>('circle')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('circle')
                    .attr('r', d => this.nodeStyler.getNodeRadius(d))
                    .attr('fill', 'var(--interactive-accent)')
                    .attr('opacity', 1.0)
                    .attr('class', 'graph-node'),
                update => update,
                exit => exit.remove()
            )
            .attr('cx', d => (d as any).x)
            .attr('cy', d => (d as any).y);

        // Calculate label positions to minimize overlap
        const labelVisibility = this.calculateLabelPositions();
        
        // Get current zoom level to adjust label visibility
        // Default zoom level of 1 if we can't get the actual zoom
        const zoomLevel = 1;
        
        // Update labels positions with improved collision detection
        this.labelsSelection = this.svgGroup.selectAll<SVGTextElement, GraphNode>('text')
            .data(this.nodes, d => d.id)
            .join(
                enter => enter.append('text')
                    .attr('dy', d => this.nodeStyler.getNodeRadius(d) + 15)
                    .attr('text-anchor', 'middle')
                    .style('fill', 'var(--text-normal)')
                    .style('font-size', '12px')
                    .style('opacity', 0) // Start with opacity 0
                    .attr('class', 'graph-label')
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
                return this.nodeStyler.getNodeRadius(d) + ((visibility?.shift || 0) * 15) + 15;
            });
    }

    public highlightConnections(nodeId: string, highlight: boolean, useTransition: boolean = true) {
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
                .style('r', d => this.nodeStyler.getNodeRadius(d))
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
            .style('r', d => this.nodeStyler.getNodeRadius(d) * 1.2)
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
                    y: (node as any).y + this.nodeStyler.getNodeRadius(node) + 15, // Label Y position (below node)
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
                y: (node as any).y + this.nodeStyler.getNodeRadius(node) + 15,
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
                            const newY = (node as any).y + this.nodeStyler.getNodeRadius(node) + 15 + (shift * 15);
                            
                            // Check if the new position would avoid collisions
                            const wouldCollide = collisions.some(id => {
                                const collidedNode = this.nodes.find(n => n.id === id);
                                if (!collidedNode) return false;
                                
                                const collidedIndex = labelPositions.findIndex(p => p.id === id);
                                if (collidedIndex === -1) return false;
                                
                                const otherY = (collidedNode as any).y + this.nodeStyler.getNodeRadius(collidedNode) + 15 + 
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

    public updateDuringDrag(draggedNode: GraphNode | null) {
        if (!draggedNode) return;
        
        // Only update positions during drag without changing styles
        // This prevents constant style updates that can cause flickering
        
        // Use more efficient selectors during drag - select all at once and minimize DOM operations
        const nodes = this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node');
        const links = this.svgGroup.selectAll<SVGLineElement, GraphLink>('.graph-link');
        const labels = this.svgGroup.selectAll<SVGTextElement, GraphNode>('.graph-label');
        
        // Batch update link positions
        links.attr('x1', d => (d.source as unknown as GraphNode).x || 0)
             .attr('y1', d => (d.source as unknown as GraphNode).y || 0)
             .attr('x2', d => (d.target as unknown as GraphNode).x || 0)
             .attr('y2', d => (d.target as unknown as GraphNode).y || 0);
        
        // Batch update node positions
        nodes.attr('cx', d => (d as any).x)
             .attr('cy', d => (d as any).y);
        
        // Batch update label positions without changing any visibility properties
        labels.attr('x', d => (d as any).x)
              .attr('y', d => (d as any).y);
    }

    public resetGraphStyles() {
        // Use consistent colors
        const primaryNodeColor = 'var(--interactive-accent)';
        const defaultLinkColor = 'var(--graph-line)';
        
        // Reset all nodes to default state
        this.svgGroup.selectAll<SVGCircleElement, GraphNode>('.graph-node')
            .transition()
            .duration(200)
            .attr('fill', primaryNodeColor)
            .attr('opacity', 1.0)
            .attr('r', d => this.nodeStyler.getNodeRadius(d))
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
}