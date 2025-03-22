import { App, TFile, Notice } from 'obsidian';
import { GraphNode } from '../types';
import * as d3 from 'd3';

export class NodeInteractions {
    private app: App;
    private canvas: HTMLElement;
    private hoverNode: GraphNode | null = null;
    private hoverTimeout: number | null = null;
    private tooltipVisible: boolean = false;
    private nodeTooltip: HTMLElement | null = null;
    private tooltipMouseEnterHandler: ((e: MouseEvent) => void) | null = null;
    private tooltipMouseLeaveHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButton: HTMLElement | null = null;
    private openNoteButtonMouseEnterHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButtonMouseLeaveHandler: ((e: MouseEvent) => void) | null = null;
    private openNoteButtonClickHandler: ((e: MouseEvent) => void) | null = null;
    private isDragging: boolean = false;
    private svgElement: SVGSVGElement | null = null;

    constructor(app: App, canvas: HTMLElement) {
        this.app = app;
        this.canvas = canvas;
    }

    /**
     * Sets the SVG element reference for tooltip positioning
     * @param svgElement The SVG element
     */
    public setSvgNode(svgElement: SVGSVGElement | null) {
        this.svgElement = svgElement;
    }

    public setDraggingState(isDragging: boolean) {
        this.isDragging = isDragging;
    }

    public onNodeMouseOver(event: MouseEvent, node: GraphNode) {
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
    
    public onNodeMouseOut(node: GraphNode) {
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

    public removeNodeTooltip() {
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

    public openNoteAndCloseGraph(node: GraphNode) {
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
                
                // Clean up and remove canvas
                // Find the cleanup method
                if (plugin && typeof plugin.onunload === 'function') {
                    plugin.onunload();
                }
                this.canvas.remove();
            } else {
                new Notice(`Could not find file at path: ${node.path}`);
            }
        } else {
            new Notice('This node has no associated file path.');
        }
    }
    
    // Check if mouse buttons are pressed (used during mousemove event)
    private isMouseButtonPressed(event: MouseEvent): boolean {
        return event && event.buttons !== 0;
    }

    private showNodeMetadata(node: GraphNode) {
        // If we're already showing a tooltip for this node, don't create another one
        if (this.tooltipVisible && this.nodeTooltip) {
            return;
        }
        
        // Do not show tooltip if drag operations are active
        if (this.isDragging) {
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
        let screenX = nodeX;
        let screenY = nodeY;
        
        // Apply transform if we have the SVG element
        if (this.svgElement) {
            try {
                const transform = d3.zoomTransform(this.svgElement);
                screenX = transform.applyX(nodeX);
                screenY = transform.applyY(nodeY);
            } catch (e) {
                console.error('Error applying transform:', e);
            }
        }
        
        // Estimate node radius (10px is a reasonable default)
        const nodeRadius = 10;
        
        // Calculate tooltip position - we want to position it to the right of the node
        // with a small offset to prevent it from covering the node
        const tooltipX = screenX + nodeRadius + 20; // Position to the right with some padding
        const tooltipY = screenY - 10; // Position slightly above to center it vertically
        
        // Position the tooltip
        this.nodeTooltip.style.left = `${tooltipX}px`;
        this.nodeTooltip.style.top = `${tooltipY}px`;
        
        // Ensure the tooltip stays within viewport bounds
        setTimeout(() => {
            if (!this.nodeTooltip) return;
            
            const bounds = this.nodeTooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Adjust horizontal position if off-screen
            if (bounds.right > viewportWidth) {
                // Position to the left of the node instead
                this.nodeTooltip.style.left = `${screenX - nodeRadius - bounds.width - 20}px`;
            }
            
            // Adjust vertical position if off-screen
            if (bounds.bottom > viewportHeight) {
                // Move up to fit within viewport
                this.nodeTooltip.style.top = `${viewportHeight - bounds.height - 10}px`;
            }
            
            if (bounds.top < 0) {
                // Move down to fit within viewport
                this.nodeTooltip.style.top = '10px';
            }
        }, 0);
        
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
        
        // Clear SVG reference
        this.svgElement = null;
    }
}