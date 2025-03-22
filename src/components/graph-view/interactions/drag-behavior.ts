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
    private throttleDelay: number = 16; // Reduced to ~60fps for smoother experience
    private rafId: number | null = null;
    private pendingDragUpdate: boolean = false;

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
        
        // Reset the timer to ensure first drag gets rendered immediately
        this.lastDragUpdate = 0;
        
        // Call the callback if provided
        if (this.onDragStartCallback) {
            this.onDragStartCallback(d);
        }
    }

    private onDragging(event: d3.D3DragEvent<SVGCircleElement, GraphNode, any>, d: GraphNode) {
        // Set position immediately
        (d as any).fx = event.x;
        (d as any).fy = event.y;
        
        // Advanced adaptive throttling strategy based on device performance
        const now = performance.now();
        const elapsed = now - this.lastDragUpdate;
        
        // If we're already below our target framerate, increase the throttle delay
        // to prevent too many stacked frames
        if (elapsed > 32) { // Less than 30fps
            // We're already slow, so let's be more conservative with updates
            if (!this.pendingDragUpdate) {
                this.requestDragUpdate();
            }
        } else if (elapsed >= this.throttleDelay) {
            // We're within our target framerate, update normally
            this.lastDragUpdate = now;
            this.requestDragUpdate();
        }
    }
    
    private requestDragUpdate() {
        // Cancel any existing animation frame
        this.cancelPendingAnimationFrame();
        
        // Mark that we have a pending update
        this.pendingDragUpdate = true;
        
        // Use double requestAnimationFrame for smoother rendering
        this.rafId = requestAnimationFrame(() => {
            this.rafId = requestAnimationFrame(() => {
                // Update renderer
                this.renderer.updateDuringDrag(this.draggedNode);
                this.rafId = null;
                this.pendingDragUpdate = false;
                this.lastDragUpdate = performance.now();
            });
        });
    }
    
    private cancelPendingAnimationFrame() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private onDragEnd(event: d3.D3DragEvent<SVGCircleElement, GraphNode, any>, d: GraphNode) {
        if (!event.active) this.simulation.alphaTarget(0);
        (d as any).fx = null;
        (d as any).fy = null;
        
        // Reset dragging states
        this.isDragging = false;
        
        // Clean up any pending animation frames
        this.cancelPendingAnimationFrame();
        this.pendingDragUpdate = false;
        
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