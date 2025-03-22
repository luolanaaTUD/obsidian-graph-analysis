import * as d3 from 'd3';
import { GraphNode } from '../types';
import { Renderer } from '../renderers/renderer';

export class DragBehavior {
    private simulation: d3.Simulation<GraphNode, any>;
    private renderer: Renderer;
    private isDragging: boolean = false;
    private draggedNode: GraphNode | null = null;
    private onDragStartCallback?: (node: GraphNode) => void;
    private onDragEndCallback?: (node: GraphNode) => void;
    private lastDragUpdate: number = 0;
    private throttleDelay: number = 20; // Minimum ms between updates during drag

    constructor(
        simulation: d3.Simulation<GraphNode, any>, 
        renderer: Renderer,
        onDragStart?: (node: GraphNode) => void,
        onDragEnd?: (node: GraphNode) => void
    ) {
        this.simulation = simulation;
        this.renderer = renderer;
        this.onDragStartCallback = onDragStart;
        this.onDragEndCallback = onDragEnd;
    }

    public setupDrag() {
        return d3.drag<SVGCircleElement, GraphNode>()
            .on('start', this.onDragStart.bind(this))
            .on('drag', this.onDragging.bind(this))
            .on('end', this.onDragEnd.bind(this));
    }

    private onDragStart(event: d3.D3DragEvent<SVGCircleElement, GraphNode, any>, d: GraphNode) {
        // Set dragging state first
        this.isDragging = true;
        
        if (!event.active) {
            // Reduce alpha target to make movement smoother
            this.simulation.alphaTarget(0.1).restart();
        }
        (d as any).fx = (d as any).x;
        (d as any).fy = (d as any).y;
        
        // Store the dragged node ID
        this.draggedNode = d;
        
        // Call the callback if provided
        if (this.onDragStartCallback) {
            this.onDragStartCallback(d);
        }
    }

    private onDragging(event: d3.D3DragEvent<SVGCircleElement, GraphNode, any>, d: GraphNode) {
        // Set position immediately
        (d as any).fx = event.x;
        (d as any).fy = event.y;
        
        // Throttle rendering updates based on time elapsed
        const now = Date.now();
        if (now - this.lastDragUpdate >= this.throttleDelay) {
            this.lastDragUpdate = now;
            
            // Update renderer
            this.renderer.updateDuringDrag(this.draggedNode);
        }
    }

    private onDragEnd(event: d3.D3DragEvent<SVGCircleElement, GraphNode, any>, d: GraphNode) {
        if (!event.active) this.simulation.alphaTarget(0);
        (d as any).fx = null;
        (d as any).fy = null;
        
        // Reset dragging states
        this.isDragging = false;
        
        // Call the callback if provided
        if (this.onDragEndCallback) {
            this.onDragEndCallback(d);
        }
        
        this.draggedNode = null;
    }

    public getDraggingState(): boolean {
        return this.isDragging;
    }

    public getDraggedNode(): GraphNode | null {
        return this.draggedNode;
    }
}