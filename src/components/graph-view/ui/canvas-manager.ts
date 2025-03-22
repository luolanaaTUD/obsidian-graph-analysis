import { App } from 'obsidian';

export class CanvasManager {
    private app: App;
    private container: HTMLElement;
    private canvas: HTMLElement;
    private isMoving: boolean = false;
    private isResizing: boolean = false;
    private startX: number = 0;
    private startY: number = 0;
    private startWidth: number = 0;
    private startHeight: number = 0;
    private initialWidth: number = 800;
    private initialHeight: number = 600;
    private onResizeCallback?: (width: number, height: number) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundMouseDown: (e: MouseEvent) => void;
    private boundResizeStart: (e: MouseEvent) => void;

    constructor(app: App, container: HTMLElement, onResize?: (width: number, height: number) => void) {
        this.app = app;
        this.container = container;
        this.onResizeCallback = onResize;
        
        // Create bound event handlers to properly handle 'this'
        this.boundMouseMove = this.onMouseMove.bind(this);
        this.boundMouseUp = this.onMouseUp.bind(this);
        this.boundMouseDown = this.onMouseDown.bind(this);
        this.boundResizeStart = this.onResizeStart.bind(this);
    }

    public createCanvas(): HTMLElement {
        // Create the main canvas container
        this.canvas = this.container.createDiv({ cls: 'graph-analysis-canvas' });
        
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
        this.addHelpIcon();

        return this.canvas;
    }

    private addHelpIcon() {
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
    }

    private onMouseDown(e: MouseEvent) {
        if (e.target instanceof HTMLElement && e.target.closest('.graph-analysis-drag-handle')) {
            this.isMoving = true;
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
        if (this.isMoving) {
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
            
            // Call resize callback if provided
            if (this.onResizeCallback) {
                this.onResizeCallback(width, height);
            }
            
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private onMouseUp(e: MouseEvent) {
        this.isMoving = false;
        
        if (this.isResizing) {
            this.onResizeEnd();
        }
        
        this.isResizing = false;
    }

    private onResizeEnd() {
        // Update based on final size
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight - 32; // Account for title bar
        
        // Call resize callback if provided
        if (this.onResizeCallback) {
            this.onResizeCallback(width, height);
        }
    }

    public getCanvas(): HTMLElement {
        return this.canvas;
    }

    public onunload() {
        // Clean up event listeners
        document.removeEventListener('mousemove', this.boundMouseMove);
        document.removeEventListener('mouseup', this.boundMouseUp);
    }

    public showLoadingIndicator(): HTMLElement {
        const loadingIndicator = this.canvas.createDiv({ cls: 'graph-analysis-loading' });
        loadingIndicator.createSpan({ text: 'Loading graph data...' });
        return loadingIndicator;
    }

    public hideLoadingIndicator(loadingIndicator: HTMLElement) {
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }
}