import { App, WorkspaceLeaf } from 'obsidian';

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

    constructor(app: App) {
        this.app = app;
    }

    public async onload(container: HTMLElement) {
        this.container = container;
        
        // Create the main canvas container
        this.canvas = container.createDiv({ cls: 'graph-analysis-canvas' });
        
        // Calculate initial size (80% of app size)
        const appContainer = this.app.workspace.containerEl;
        const width = Math.floor(appContainer.offsetWidth * 0.8);
        const height = Math.floor(appContainer.offsetHeight * 0.8);
        
        // Set initial position and size
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.style.left = `${Math.floor((appContainer.offsetWidth - width) / 2)}px`;
        this.canvas.style.top = `${Math.floor((appContainer.offsetHeight - height) / 2)}px`;

        // Add close button
        const closeButton = this.canvas.createDiv({ cls: 'graph-analysis-close-button' });
        closeButton.addEventListener('click', () => {
            this.onunload();
            this.canvas.remove();
        });

        // Add resize handle
        const resizeHandle = this.canvas.createDiv({ cls: 'graph-analysis-resize-handle' });

        // Setup event listeners for dragging
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));

        // Setup event listeners for resizing
        resizeHandle.addEventListener('mousedown', this.onResizeStart.bind(this));
    }

    private onMouseDown(e: MouseEvent) {
        if (e.target === this.canvas) {
            this.isDragging = true;
            this.startX = e.clientX - this.canvas.offsetLeft;
            this.startY = e.clientY - this.canvas.offsetTop;
            e.preventDefault();
        }
    }

    private onResizeStart(e: MouseEvent) {
        this.isResizing = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWidth = this.canvas.offsetWidth;
        this.startHeight = this.canvas.offsetHeight;
        e.preventDefault();
        e.stopPropagation();
    }

    private onMouseMove(e: MouseEvent) {
        if (this.isDragging) {
            const newX = e.clientX - this.startX;
            const newY = e.clientY - this.startY;
            this.canvas.style.left = `${newX}px`;
            this.canvas.style.top = `${newY}px`;
        } else if (this.isResizing) {
            const newWidth = this.startWidth + (e.clientX - this.startX);
            const newHeight = this.startHeight + (e.clientY - this.startY);
            this.canvas.style.width = `${newWidth}px`;
            this.canvas.style.height = `${newHeight}px`;
        }
    }

    private onMouseUp() {
        this.isDragging = false;
        this.isResizing = false;
    }

    public onunload() {
        // Clean up event listeners
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));
        document.removeEventListener('mouseup', this.onMouseUp.bind(this));
    }
} 