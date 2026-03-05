import { App } from 'obsidian';
import { GraphAnalysisSettings, HierarchicalDomain, DomainConnection } from '../../types/types';
import * as d3 from 'd3';

export interface DomainData {
    domain: string;
    noteCount: number;
    avgCentrality: number;
    keywords: string[];
}

export interface DomainDistributionData {
    // Hierarchical domain structure for sunburst visualization (2 layers: Domains, Subdivisions)
    // Built by MasterAnalysisManager using subdivision-based classification
    domainHierarchy: HierarchicalDomain[];
    
    // Cross-domain connections
    domainConnections?: DomainConnection[];
}

export interface DomainChartOptions {
    chartType?: 'sunburst';
    width?: number;
    height?: number;
    showTooltips?: boolean;
    showLabels?: boolean;
}

// Define interface for D3 data structure
interface D3HierarchyNode {
    name: string;
    value?: number;
    children?: D3HierarchyNode[];
    ddcCode?: string;
    avgCentrality?: number;
    keywords?: string[];
    noteCount?: number;
    level?: number;
}

// Add type alias for typed hierarchy node (may be used in future)
// type TypedHierarchyNode = d3.HierarchyRectangularNode<D3HierarchyNode>;

export class DomainDistributionChart {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: DomainDistributionData | null = null;
    private options: DomainChartOptions;

    constructor(
        app: App, 
        settings: GraphAnalysisSettings,
        container: HTMLElement,
        options: Partial<DomainChartOptions> = {}
    ) {
        this.app = app;
        this.settings = settings;
        this.container = container;
        this.options = {
            chartType: 'sunburst',
            showTooltips: true,
            showLabels: true,
            ...options
        };

        // Listen for theme or accent color changes and refresh chart
        // Use multiple methods to detect theme changes
        this._themeChangeHandler = () => {
            // Debounce rapid theme changes and prevent unnecessary refreshes
            if (this._themeChangeTimeout) {
                clearTimeout(this._themeChangeTimeout);
            }
            this._themeChangeTimeout = setTimeout(() => {
                // Only refresh if the chart is actually rendered
                if (this.container.children.length > 0) {
                    void this.refresh();
                }
            }, 150); // Slightly longer debounce for smoother experience
        };

        // Method 1: Listen for CSS changes on workspace
        const workspace = document.querySelector('.workspace');
        if (workspace) {
            workspace.addEventListener('css-change', this._themeChangeHandler);
        }

        // Method 2: Listen for theme class changes on body (only theme-related changes)
        this._themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && 
                    mutation.attributeName === 'class' &&
                    mutation.target === document.body) {
                    const classList = (mutation.target as HTMLElement).className;
                    // Only trigger on actual theme changes
                    if (classList.includes('theme-') || classList.includes('color-scheme-')) {
                        this._themeChangeHandler?.();
                    }
                    break;
                }
            }
        });
        this._themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        // Method 3: Listen for changes to the document element (only style changes that affect CSS variables)
        this._documentObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && 
                    mutation.attributeName === 'style' &&
                    mutation.target === document.documentElement) {
                    const style = (mutation.target as HTMLElement).getAttribute('style') || '';
                    // Only trigger on style changes that might affect accent colors
                    if (style.includes('--accent') || style.includes('--text-accent') || style.includes('--interactive-accent')) {
                        this._themeChangeHandler?.();
                    }
                    break;
                }
            }
        });
        this._documentObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['style']
        });
    }

    // Add a destructor to remove the event listener when the chart is destroyed
    private _themeChangeHandler?: () => void;
    private _themeChangeTimeout?: ReturnType<typeof setTimeout>;
    private _themeObserver?: MutationObserver;
    private _documentObserver?: MutationObserver;
    public destroy(): void {
        // Clean up theme change listeners
        const workspace = document.querySelector('.workspace');
        if (workspace && this._themeChangeHandler) {
            workspace.removeEventListener('css-change', this._themeChangeHandler);
        }

        // Clean up mutation observers
        if (this._themeObserver) {
            this._themeObserver.disconnect();
        }
        if (this._documentObserver) {
            this._documentObserver.disconnect();
        }

        // Clean up timeout
        if (this._themeChangeTimeout) {
            clearTimeout(this._themeChangeTimeout);
        }
    }
    
    public async render(): Promise<void> {
        this.container.empty();
        
        if (!this.data || !this.data.domainHierarchy || this.data.domainHierarchy.length === 0) {
            this.renderPlaceholder();
            return;
        }

        // Create chart container with proper CSS class for responsive sizing
        const chartContainer = this.container.createEl('div', { cls: 'domain-chart-container' });

        // Render sunburst chart
        this.renderSunburstChart(chartContainer);
    }

    private renderPlaceholder(): void {
        const placeholder = this.container.createEl('div', { cls: 'domain-chart-placeholder' });
        const content = placeholder.createEl('div', { cls: 'placeholder-content' });
        content.createEl('div', { cls: 'placeholder-icon', text: '📊' });
        content.createEl('div', { cls: 'placeholder-title', text: 'No domain hierarchy available' });
        content.createEl('div', { cls: 'placeholder-text', text: 'Please generate vault analysis with knowledge domain classification to see domain distribution.' });
    }

    private renderSunburstChart(container: HTMLElement = this.container): void {
         
        // Use extracted color generation method
        const getVividAccentColor = (i: number, total: number): string => {
            return this.generateAccentColor(i, total);
        };

        // Get container dimensions for responsive sizing
        const containerWidth = container.clientWidth || 500;
        
        // Responsive: always use 80% of container width, maintain square aspect ratio
        const width = containerWidth * 0.8;
        const height = width; // Keep square aspect ratio
        const radius = width / 6; // Use D3 standard radius calculation

        // Create container for chart (use DOM API for SVG to avoid D3 selection typing issues)
        // Container already has position:relative via .domain-chart-container CSS
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        container.appendChild(svgEl);

        // Prepare data - hierarchy is now pre-built by MasterAnalysisManager
        const hierarchyData = this.prepareOptimizedHierarchy();
        
        // Compute the layout using D3 standard approach
        type PartitionNode = d3.HierarchyRectangularNode<D3HierarchyNode>;
        const hierarchy = d3.hierarchy<D3HierarchyNode>(hierarchyData)
            .sum((d: D3HierarchyNode) => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));
        
        const root = d3.partition<D3HierarchyNode>()
            .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);

        // Remove color palette generation. We'll use CSS variables for fill and filter for distinction.

        // Create the arc generator following D3 example
        const arc = d3.arc<PartitionNode>()
            .startAngle((d) => d.x0)
            .endAngle((d) => d.x1)
            .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(radius * 1.5)
            .innerRadius((d) => d.y0 * radius)
            .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1));

        // MODIFIED: Show all layers at once - removed depth filtering
        const arcVisible = (d: PartitionNode) => {
            return d.y0 >= 1 && d.x1 > d.x0;
        };

        // Label visibility function - show labels for all visible arcs
        const labelVisible = (d: PartitionNode) => {
            return d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
        };

        // Label transform function
        const labelTransform = (d: PartitionNode) => {
            const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
            const y = (d.y0 + d.y1) / 2 * radius;
            return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
        };

        // Create SVG (@types/d3 Selection has narrow typing for node selection)
        const svg = d3.select(svgEl) as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
        svg.attr('width', width)
            .attr('height', height)
            .attr('viewBox', [-width / 2, -height / 2, width, height])
            .attr('class', 'domain-sunburst-chart')
            .style('display', 'block')
            .style('margin', '0 auto')
            .style('font', '10px sans-serif');

        const g = svg.append('g');

        // Create all arcs (excluding root) - show all layers immediately
        const descendants = root.descendants().slice(1);
        const totalTopLevel = hierarchyData.children?.length || 1;
        const paths = g.selectAll('path')
            .data(descendants)
            .enter().append('path')
            .attr('d', arc)
            .attr('data-index', (d: PartitionNode) => {
                // Store the color index for in-place updates
                let topIndex = 0;
                let ancestor: PartitionNode = d;
                while (ancestor.depth > 1 && ancestor.parent) ancestor = ancestor.parent;
                if (ancestor.parent?.children) {
                    topIndex = ancestor.parent.children.indexOf(ancestor);
                } else if (ancestor.depth === 1) {
                    topIndex = descendants.filter(x => x.depth === 1).indexOf(ancestor);
                }
                return topIndex;
            })
            .attr('fill', (d: PartitionNode) => {
                // Use vivid accent color for top-level sections, inherit for children
                let topIndex = 0;
                let ancestor: PartitionNode = d;
                while (ancestor.depth > 1 && ancestor.parent) ancestor = ancestor.parent;
                if (ancestor.parent?.children) {
                    topIndex = ancestor.parent.children.indexOf(ancestor);
                } else if (ancestor.depth === 1) {
                    topIndex = descendants.filter(x => x.depth === 1).indexOf(ancestor);
                }
                return getVividAccentColor(topIndex, totalTopLevel);
            })
            .attr('fill-opacity', (d: PartitionNode) => arcVisible(d) ? (d.children ? 0.8 : 0.9) : 0)
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1)
            .attr('pointer-events', (d: PartitionNode) => arcVisible(d) ? 'auto' : 'none')
            .style('cursor', 'default')
            .style('transition', 'fill 0.3s ease, opacity 0.2s ease, filter 0.2s ease');

        // Add tooltips to paths
        const format = d3.format(',d');
        paths.append('title')
            .text((d: PartitionNode) => {
                const path = d.ancestors().map((ancestor: PartitionNode) => ancestor.data.name).reverse().join(' → ');
                const info = [
                    `${path}`,
                    `${format(d.value || d.data.noteCount || 0)} notes`,
                ];
                if (d.data.ddcCode) {
                    info.push(`Domain: ${d.data.ddcCode}`);
                }
                if (d.data.avgCentrality !== undefined) {
                    info.push(`Centrality: ${d.data.avgCentrality.toFixed(3)}`);
                }
                return info.join('\n');
            });

        // Add labels with text wrapping for long labels
        const labelGroups = g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('g')
            .data(root.descendants().slice(1))
            .enter().append('g')
            .attr('transform', (d: PartitionNode) => labelTransform(d))
            .style('opacity', (d: PartitionNode) => +labelVisible(d));

        labelGroups.each(function(this: SVGGElement, d: PartitionNode) {
            const group = d3.select(this) as unknown as d3.Selection<SVGGElement, PartitionNode, SVGGElement, unknown>;
            const arcSize = (d.y1 - d.y0) * (d.x1 - d.x0);
            const name = d.data.name;
            
            // Calculate available width for text based on arc size
            const availableWidth = Math.max(10, (d.y1 - d.y0) * radius * 0.8);
            const fontSize = Math.max(8, radius * 0.08 * Math.max(0.6, 1 - (d.depth - 1) * 0.1));
            
            // Skip tiny arcs
            if (arcSize < 0.02) return;
            
            // For very small arcs, just show abbreviated text
                if (arcSize < 0.1) {
                    group.append('text')
                        .attr('dy', '0.35em')
                        .attr('fill', 'var(--chart-text, var(--text-normal))')
                        .style('font-size', `${fontSize}px`)
                        .style('transition', 'fill 0.3s ease')
                        .text(name.length > 8 ? name.substring(0, 8) + '...' : name);
                    return;
                }
            
            // For larger arcs, implement text wrapping
            const words = name.split(/\s+/);
            let lineNumber = 0;
            group.append('text')
                .attr('dy', 0)
                .attr('fill', 'var(--chart-text, var(--text-normal))')
                .style('font-size', `${fontSize}px`)
                .style('transition', 'fill 0.3s ease')
                .append('tspan')
                .attr('x', 0)
                .attr('y', 0);
            
            // Simple text wrapping algorithm
            let currentLine = '';
            words.forEach((word: string) => {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                // Estimate text width (rough approximation)
                const estimatedWidth = testLine.length * (fontSize * 0.6);
                
                if (estimatedWidth > availableWidth && currentLine) {
                    // Add current line and start a new one
                    group.select('text').append('tspan')
                        .attr('x', 0)
                        .attr('y', 0)
                        .attr('dy', `${++lineNumber * 1.1}em`)
                        .text(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            });
            
            // Add the last line
            if (currentLine) {
                group.select('text').append('tspan')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('dy', `${lineNumber * 1.1}em`)
                    .text(currentLine);
            }
            
            // Center the text vertically
            const textElement = group.select('text');
            const tspanSelection = textElement.selectAll('tspan');
            const numLines = (tspanSelection as unknown as d3.Selection<SVGTSpanElement, unknown, SVGTextElement, unknown>).size();
            if (numLines > 1) {
                const offset = -(numLines - 1) * 0.5 * 1.1;
                (tspanSelection as unknown as d3.Selection<SVGTSpanElement, unknown, SVGTextElement, unknown>).each(function(this: Element, _d: unknown, i: number) {
                    d3.select(this).attr('dy', `${offset + i * 1.1}em`);
                });
            } else {
                textElement.attr('dy', '0.35em');
            }
        });

        // Create enlarged center circle for info panel
        const centerRadius = Math.max(radius * 0.9, 40);
        g.append('circle')
            .datum(root)
            .attr('r', centerRadius)
            .attr('fill', 'var(--chart-background, var(--background-secondary))')
            .attr('stroke', 'var(--background-modifier-border)')
            .attr('stroke-width', 2)
            .style('opacity', 0.95)
            .style('cursor', 'default')
            .style('transition', 'fill 0.3s ease, stroke 0.3s ease'); // Smooth theme transitions

        // Create center info panel group
        const centerInfo = g.append('g')
            .attr('class', 'center-info-panel');

        // Function to update center info panel
        const updateCenterInfo = (data: PartitionNode | null = null) => {
            // Fade out existing content
            centerInfo.selectAll('text')
                .transition()
                .duration(150)
                .style('opacity', 0)
                .remove();

            // Create single text element that will contain all lines
            const textContainer = centerInfo.append('text')
                .attr('text-anchor', 'middle')
                .attr('x', 0)
                .attr('y', 0)
                .style('opacity', 0);

            if (data && data !== root) {
                // Show detailed segment information
                const percentage = ((data.value || data.data.noteCount || 0) / (root.value || 1) * 100).toFixed(1);
                const layerNames = ['Root', 'Domain', 'Subdivision', 'User Domain'];
                const layerName = layerNames[data.depth] || `Layer ${data.depth}`;
                
                // Domain name with text wrapping for long names
                const domainName = data.data.name;
                const maxLineLength = 14;
                // Split long domain names into multiple lines (no trimming, just wrap)
                const nameLines = [];
                if (domainName.length <= maxLineLength) {
                    nameLines.push(domainName);
                } else {
                    const words = domainName.split(' ');
                    let currentLine = '';
                    for (const word of words) {
                        if ((currentLine + ' ' + word).trim().length <= maxLineLength) {
                            currentLine = currentLine ? currentLine + ' ' + word : word;
                        } else {
                            if (currentLine) {
                                nameLines.push(currentLine);
                            }
                            currentLine = word;
                        }
                    }
                    if (currentLine) {
                        nameLines.push(currentLine);
                    }
                }
                const lineHeight = '1.2em';
                let currentLine = 0;
                // Domain name lines
                nameLines.forEach((line, index) => {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', index === 0 ? '0em' : lineHeight)
                        .style('font-size', Math.max(centerRadius * 0.16, 10) + 'px')
                        .style('font-weight', '600')
                        .style('fill', 'var(--chart-accent-color, var(--text-accent))')
                        .style('transition', 'fill 0.3s ease')
                        .text(line);
                    currentLine++;
                });
                // Vertically center the block of lines
                const nameBlockHeight = currentLine * 1.2;
                textContainer.attr('y', -(nameBlockHeight / 2) + 'em');

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '1.6em')
                    .style('font-size', '1px')
                    .text('');

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '1.2em')
                    .style('font-size', Math.max(centerRadius * 0.10, 8) + 'px')
                    .style('fill', 'var(--chart-muted, var(--text-muted))')
                    .style('transition', 'fill 0.3s ease')
                    .text(layerName);
                currentLine++;

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.24, 14) + 'px')
                    .style('font-weight', '700')
                    .style('fill', 'var(--chart-text, var(--text-normal))')
                    .style('transition', 'fill 0.3s ease')
                    .text(data.value || data.data.noteCount || 0);
                currentLine++;

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.10, 7) + 'px')
                    .style('fill', 'var(--text-muted)')
                    .text('notes');
                currentLine++;

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.12, 9) + 'px')
                    .style('font-weight', '500')
                    .style('fill', 'var(--text-accent)')
                    .text(`${percentage}%`);
                currentLine++;

                if (data.data.avgCentrality !== undefined) {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', lineHeight)
                        .style('font-size', Math.max(centerRadius * 0.09, 7) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`Centrality: ${data.data.avgCentrality.toFixed(3)}`);
                    currentLine++;
                }

                const totalHeight = currentLine * 1.2;
                textContainer.attr('y', -(totalHeight / 2) + 'em');

            } else {
                // Show default hierarchy information
                const totalDomainSections = root.descendants().filter(d => d.depth > 0).length;
                const layerCount = hierarchy.height;
                
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '0em')
                    .style('font-size', Math.max(centerRadius * 0.14, 11) + 'px')
                    .style('font-weight', '600')
                    .style('fill', 'var(--text-accent)')
                    .text('Knowledge Domains');

                if (totalDomainSections > 0) {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.4em')
                        .style('font-size', '1px')
                        .text('');
                        
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.26, 16) + 'px')
                        .style('font-weight', '700')
                        .style('fill', 'var(--text-normal)')
                        .text(totalDomainSections.toString());

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.12, 9) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text('subdivisions');

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.4em')
                        .style('font-size', '1px')
                        .text('');

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.10, 7) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`${layerCount} layers`);

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.08, 6) + 'px')
                        .style('fill', 'var(--text-faint)')
                        .text('hover to explore');
                }

                textContainer.attr('y', '-2.5em');
            }

            textContainer
                .transition()
                .duration(300)
                .style('opacity', 1);
        };

        // Initialize with default info
        updateCenterInfo();

        // Enhanced hover effects - REMOVED all click functionality
        if (this.options.showTooltips) {
            paths
                .on('mouseover', (event: MouseEvent, d: PartitionNode) => {
                    d3.select(event.currentTarget as SVGPathElement)
                        .style('opacity', 1)
                        .style('filter', 'brightness(1.1)');

                    updateCenterInfo(d);
                })
                .on('mouseout', (event: MouseEvent) => {
                    d3.select(event.currentTarget as SVGPathElement)
                        .style('opacity', null)
                        .style('filter', 'none');

                    // Return to default info when mouse leaves
                    updateCenterInfo();
                });
        }
         
    }

    // Prepare optimized hierarchy - data is now pre-built by MasterAnalysisManager
    private prepareOptimizedHierarchy(): D3HierarchyNode {
        // Create root node for hierarchy
        const root: D3HierarchyNode = { name: "Knowledge Domains", children: [] };
        
        // Convert hierarchical domain structure to D3 format
        const convertHierarchy = (nodes: HierarchicalDomain[]): D3HierarchyNode[] => {
            return nodes.map(node => {
                const d3Node: D3HierarchyNode = {
                    name: node.name,
                    ddcCode: node.ddcCode,
                    noteCount: node.noteCount,
                    keywords: node.keywords,
                    level: node.level
                };
                
                // Only add value for leaf nodes or nodes without children
                if ((node.level === 2 || !node.children || node.children.length === 0) && node.noteCount) {
                    d3Node.value = node.noteCount;
                }
                
                // Add children if they exist
                if (node.children && node.children.length > 0) {
                    d3Node.children = convertHierarchy(node.children);
                }
                
                return d3Node;
            });
        };
        
        if (this.data?.domainHierarchy) {
            root.children = convertHierarchy(this.data.domainHierarchy);
        }
        
        return root;
    }

    public async renderWithData(data: DomainDistributionData): Promise<void> {
        this.data = data;
        await this.render();
    }

    public setOptions(options: Partial<DomainChartOptions>): void {
        this.options = { ...this.options, ...options };
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }



    public async refresh(): Promise<void> {
        // Try to update colors in-place first (faster, no blink)
        if (this.updateColorsInPlace()) {
            return;
        }
        
        // Fall back to full re-render if in-place update isn't possible
        this.container.empty();
        this.data = null;
        await this.render();
    }

    private updateColorsInPlace(): boolean {
        // Check if we have an existing SVG to update
        const svg = this.container.querySelector('.domain-sunburst-chart');
        if (!svg || !this.data?.domainHierarchy) {
            return false;
        }

        try {
            // Update path colors without full re-render
            const paths = svg.querySelectorAll('path');
            const totalTopLevel = this.data.domainHierarchy.length;
            
            paths.forEach((path) => {
                const pathElement = path;
                const dataIndex = parseInt(pathElement.getAttribute('data-index') || '0');
                const newColor = this.generateAccentColor(dataIndex, totalTopLevel);
                // Transition is handled by CSS (.domain-sunburst-chart path)
                pathElement.setAttribute('fill', newColor);
            });

            // Update center circle background (transition handled by CSS)
            const centerCircle = svg.querySelector('circle');
            if (centerCircle) {
                centerCircle.setAttribute('fill', 'var(--chart-background, var(--background-secondary))');
            }

            return true;
        } catch {
            // If in-place update fails, fall back to full re-render
            return false;
        }
    }

    // Extract color generation logic for reuse
    private generateAccentColor(i: number, total: number): string {
        if (total <= 1) {
            return `var(--text-accent)`;
        } else if (total <= 3) {
            const opacity = 0.5 + 0.5 * (i / (total - 1));
            return `color-mix(in srgb, var(--text-accent) ${Math.round(opacity * 100)}%, transparent)`;
        } else {
            const mixRatio = 60 + 30 * (i / (total - 1));
            const mixIndex = i % 4;
            const mixColors = ['var(--background-secondary)', 'var(--text-muted)', 'var(--background-modifier-border)', 'var(--background-primary-alt)'];
            return `color-mix(in srgb, var(--text-accent) ${Math.round(mixRatio)}%, ${mixColors[mixIndex]})`;
        }
    }
}