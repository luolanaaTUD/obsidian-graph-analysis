import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';
import * as d3 from 'd3';

export interface DomainData {
    domain: string;
    noteCount: number;
    avgCentrality: number;
    keywords: string[];
}

export interface HierarchicalDomain {
    name: string;
    noteCount: number;
    avgCentrality?: number;
    children?: HierarchicalDomain[];
    keywords?: string[];
    level?: number;
    parent?: string;
    ddcCode?: string; // DDC (Dewey Decimal Classification) code
}

export interface DomainConnection {
    source: string;
    target: string;
    strength: number;
}

export interface DomainDistributionData {
    // Hierarchical domain structure for sunburst visualization (4 layers: Main Classes, Divisions, Sections, User Domains)
    domainHierarchy: HierarchicalDomain[];
    
    // Cross-domain connections
    domainConnections?: DomainConnection[];
}

export interface DomainChartOptions {
    chartType?: 'sunburst' | 'table';
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

// Add type alias for typed hierarchy node
type TypedHierarchyNode = d3.HierarchyRectangularNode<D3HierarchyNode>;

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
    }

    public async loadCachedData(): Promise<DomainDistributionData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const masterData = JSON.parse(content);
            
            if (masterData?.knowledgeStructure?.domainHierarchy) {
                return {
                    domainHierarchy: masterData.knowledgeStructure.domainHierarchy,
                    domainConnections: masterData.knowledgeStructure.domainConnections
                };
            }
            return null;
        } catch (error) {
            console.warn('No cached domain distribution data found:', error);
            return null;
        }
    }

    public async render(): Promise<void> {
        this.container.empty();
        
        if (!this.data) {
            await this.loadData();
        }
        
        if (!this.data || !this.data.domainHierarchy || this.data.domainHierarchy.length === 0) {
            this.renderPlaceholder();
            return;
        }

        // Create chart container with proper CSS class for responsive sizing
        const chartContainer = this.container.createEl('div', { cls: 'domain-chart-container' });

        switch (this.options.chartType) {
            case 'table':
                this.renderTable(chartContainer);
                break;
            case 'sunburst':
            default:
                this.renderSunburstChart(chartContainer);
                break;
        }
    }

    private async loadData(): Promise<void> {
        this.data = await this.loadCachedData();
    }

    private renderPlaceholder(): void {
        const placeholder = this.container.createEl('div', { cls: 'domain-chart-placeholder' });
        placeholder.innerHTML = `
            <div class="placeholder-content">
                <div class="placeholder-icon">📊</div>
                <div class="placeholder-title">No Domain Hierarchy Available</div>
                <div class="placeholder-text">
                    Please generate vault analysis with DDC hierarchy to see four-layer domain distribution.
                </div>
            </div>
        `;
    }

    private renderTable(container: HTMLElement = this.container): void {
        const tableContainer = container.createEl('div', { cls: 'domain-table-container' });
        
        const table = tableContainer.createEl('table', { cls: 'domain-table' });
        const thead = table.createEl('thead');
        const tbody = table.createEl('tbody');

        // Create header
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: 'DDC Code' });
        headerRow.createEl('th', { text: 'Domain' });
        headerRow.createEl('th', { text: 'Level' });
        headerRow.createEl('th', { text: 'Notes' });
        headerRow.createEl('th', { text: 'Centrality' });

        // Flatten hierarchy for table display
        const flattenHierarchy = (nodes: HierarchicalDomain[], level: number = 1): Array<HierarchicalDomain & {level: number}> => {
            const result: Array<HierarchicalDomain & {level: number}> = [];
            for (const node of nodes) {
                result.push({ ...node, level });
                if (node.children) {
                    result.push(...flattenHierarchy(node.children, level + 1));
                }
            }
            return result;
        };

        const flatDomains = flattenHierarchy(this.data!.domainHierarchy);

        // Create rows
        flatDomains
            .filter(domain => domain.noteCount > 0)
            .forEach(domain => {
                const row = tbody.createEl('tr');
                row.addClass(`level-${domain.level}`);
                
                // DDC Code
                row.createEl('td', { 
                    text: domain.ddcCode || '-',
                    cls: 'ddc-code'
                });
                
                // Domain name with indentation
                const domainCell = row.createEl('td');
                const indent = '  '.repeat(domain.level - 1);
                domainCell.createEl('span', { 
                    text: `${indent}${domain.name}`,
                    cls: 'domain-name'
                });
                
                // Level
                const levelNames = { 1: 'Class', 2: 'Division', 3: 'Section', 4: 'User Domain' };
                row.createEl('td', { 
                    text: levelNames[domain.level as keyof typeof levelNames] || `Level ${domain.level}`,
                    cls: 'level-name'
                });
                
                // Note count
                row.createEl('td', { 
                    text: domain.noteCount.toString(),
                    cls: 'note-count'
                });
                
                // Centrality
                row.createEl('td', { 
                    text: domain.avgCentrality?.toFixed(3) || '-',
                    cls: 'centrality-score'
                });
            });
    }

    private renderSunburstChart(container: HTMLElement = this.container): void {
        // Get container dimensions for responsive sizing
        const containerWidth = container.clientWidth || 500;
        
        // Responsive: always use 80% of container width, maintain square aspect ratio
        const width = containerWidth * 0.8;
        const height = width; // Keep square aspect ratio

        // Create container for chart
        const sunburstContainer = d3.select(container)
            .style('position', 'relative');

        // Prepare data for four-layer DDC structure
        const hierarchyData = this.prepareFourLayerHierarchy();
        console.log('📊 Four-layer DDC hierarchy data:', JSON.stringify(hierarchyData, null, 2));
        
        // Compute the layout to get actual hierarchy depth (should be 4 for full DDC + user domains)
        const hierarchy = d3.hierarchy<D3HierarchyNode>(hierarchyData)
            .sum((d: D3HierarchyNode) => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));
        
        const root = d3.partition<D3HierarchyNode>()
            .size([2 * Math.PI, hierarchy.height + 1])
            (hierarchy);

        // Calculate radius for four layers (Main Classes, Divisions, Sections, User Domains)
        const maxRadialExtent = hierarchy.height + 1; // Should be 5 (root + 4 layers)
        const availableRadius = Math.min(width, height) / 2 - 40; // Leave margin for labels
        const radius = availableRadius / maxRadialExtent;
        
        console.log(`📊 DDC Sunburst: container=${containerWidth}px, chart=${width}px, layers=${hierarchy.height}, radius=${radius.toFixed(1)}px`);

        // Create SVG
        const svg = sunburstContainer
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', [-width / 2, -height / 2, width, height])
            .attr('class', 'domain-sunburst-chart')
            .style('display', 'block')
            .style('margin', '0 auto')
            .style('font', '10px sans-serif');

        const g = svg.append('g');

        // Create color scale for four layers
        const layerColors = {
            1: d3.scaleOrdinal(d3.schemeCategory10),     // Main Classes
            2: d3.scaleOrdinal(d3.schemePastel1),       // Divisions
            3: d3.scaleOrdinal(d3.schemeSet3),          // Sections
            4: d3.scaleOrdinal(d3.schemeAccent)         // User Domains
        };
        
        // Create the arc generator
        const arc = d3.arc<TypedHierarchyNode>()
            .startAngle((d: TypedHierarchyNode) => d.x0)
            .endAngle((d: TypedHierarchyNode) => d.x1)
            .padAngle((d: TypedHierarchyNode) => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(radius * 1.5)
            .innerRadius((d: TypedHierarchyNode) => d.y0 * radius)
            .outerRadius((d: TypedHierarchyNode) => Math.max(d.y0 * radius, d.y1 * radius - 1));

        // Filter out root node but include all four layers
        const visibleNodes = root.descendants().filter((d: TypedHierarchyNode) => d.depth > 0 && d.depth <= 4);

        // Create arcs with layer-specific coloring
        const arcs = g.selectAll('path')
            .data(visibleNodes)
            .enter().append('path')
            .attr('d', (d: TypedHierarchyNode) => arc(d))
            .attr('fill', (d: TypedHierarchyNode) => {
                const layer = Math.min(d.depth, 4) as 1 | 2 | 3 | 4;
                const colorScale = layerColors[layer];
                
                // Use ancestor path for consistent coloring within branches
                let colorKey = d.data.name;
                if (d.depth > 1 && d.parent) {
                    colorKey = d.parent.data.name;
                    if (d.depth > 2 && d.parent.parent) {
                        colorKey = d.parent.parent.data.name;
                        if (d.depth > 3 && d.parent.parent.parent) {
                            colorKey = d.parent.parent.parent.data.name;
                        }
                    }
                }
                
                return colorScale(colorKey);
            })
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .style('opacity', 0.85)
            .style('transition', 'all 0.2s ease');

        // Create enlarged center circle for info panel
        const centerRadius = Math.max(radius * 1.2, 60);
        const centerCircle = g.append('circle')
            .attr('r', centerRadius)
            .attr('fill', 'var(--background-secondary)')
            .attr('stroke', 'var(--background-modifier-border)')
            .attr('stroke-width', 2)
            .style('opacity', 0.95);

        // Create center info panel group
        const centerInfo = g.append('g')
            .attr('class', 'center-info-panel');

        // Function to update center info panel
        const updateCenterInfo = (data: any = null) => {
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

            if (data) {
                // Show detailed segment information
                const percentage = ((data.value || 0) / (root.value || 1) * 100).toFixed(1);
                const layerNames = { 1: 'Main Class', 2: 'Division', 3: 'Section', 4: 'User Domain' };
                const layerName = layerNames[data.depth as keyof typeof layerNames] || `Layer ${data.depth}`;
                
                // Domain name with text wrapping for long names
                const domainName = data.data.name;
                const maxLineLength = 16; // Characters per line
                
                // Split long domain names into multiple lines
                const nameLines = [];
                if (domainName.length <= maxLineLength) {
                    nameLines.push(domainName);
                } else {
                    // Try to break at word boundaries
                    const words = domainName.split(' ');
                    let currentLine = '';
                    
                    for (const word of words) {
                        if ((currentLine + ' ' + word).length <= maxLineLength) {
                            currentLine = currentLine ? currentLine + ' ' + word : word;
                        } else {
                            if (currentLine) {
                                nameLines.push(currentLine);
                                currentLine = word;
                            } else {
                                // Single word too long, truncate
                                nameLines.push(word.slice(0, maxLineLength - 3) + '...');
                                currentLine = '';
                            }
                        }
                    }
                    if (currentLine) {
                        nameLines.push(currentLine);
                    }
                    
                    // Limit to 2 lines maximum
                    if (nameLines.length > 2) {
                        nameLines[1] = nameLines[1].slice(0, maxLineLength - 3) + '...';
                        nameLines.splice(2);
                    }
                }

                // Build all text content as tspan elements
                const lineHeight = '1.2em';
                let currentLine = 0;
                
                // Domain name lines
                nameLines.forEach((line, index) => {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', index === 0 ? '0em' : lineHeight)
                        .style('font-size', Math.max(centerRadius * 0.14, 10) + 'px')
                        .style('font-weight', '600')
                        .style('fill', 'var(--text-accent)')
                        .text(line);
                    currentLine++;
                });

                // Extra spacing after domain title
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '1.8em')
                    .style('font-size', '1px')
                    .text('');

                // DDC Code (if available)
                if (data.data.ddcCode) {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.09, 8) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`DDC: ${data.data.ddcCode}`);
                    currentLine++;
                }

                // Layer level
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.09, 7) + 'px')
                    .style('fill', 'var(--text-muted)')
                    .text(layerName);
                currentLine++;

                // Notes count
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.22, 14) + 'px')
                    .style('font-weight', '700')
                    .style('fill', 'var(--text-normal)')
                    .text(data.data.noteCount || data.value || 0);
                currentLine++;

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.09, 7) + 'px')
                    .style('fill', 'var(--text-muted)')
                    .text('notes');
                currentLine++;

                // Percentage
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.11, 9) + 'px')
                    .style('font-weight', '500')
                    .style('fill', 'var(--text-accent)')
                    .text(`${percentage}%`);
                currentLine++;

                // Centrality (if available)
                if (data.data.avgCentrality !== undefined) {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', lineHeight)
                        .style('font-size', Math.max(centerRadius * 0.08, 7) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`Centrality: ${data.data.avgCentrality.toFixed(3)}`);
                    currentLine++;
                }

                // Center the entire text block vertically
                const totalHeight = currentLine * 1.2;
                textContainer.attr('y', -(totalHeight / 2) + 'em');

            } else {
                // Show default DDC hierarchy information
                const totalNotes = root.value || 0;
                const layerCount = hierarchy.height;
                
                // Build default content
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '0em')
                    .style('font-size', Math.max(centerRadius * 0.13, 11) + 'px')
                    .style('font-weight', '600')
                    .style('fill', 'var(--text-accent)')
                    .text('DDC Hierarchy');

                if (totalNotes > 0) {
                    // Empty line for spacing
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.4em')
                        .style('font-size', '1px')
                        .text('');
                        
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.25, 16) + 'px')
                        .style('font-weight', '700')
                        .style('fill', 'var(--text-normal)')
                        .text(totalNotes.toString());

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.11, 9) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text('total notes');

                    // Empty line for spacing
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.4em')
                        .style('font-size', '1px')
                        .text('');

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.09, 7) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`${layerCount} layers`);

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.07, 6) + 'px')
                        .style('fill', 'var(--text-faint)')
                        .text('hover for details');
                }

                // Center the default text block vertically
                textContainer.attr('y', '-2.5em');
            }

            // Fade in the complete text container
            textContainer
                .transition()
                .duration(300)
                .style('opacity', 1);
        };

        // Initialize with default info
        updateCenterInfo();

        // Enhanced hover effects with center info panel updates
        if (this.options.showTooltips) {
            arcs
                .on('mouseover', (event, d: TypedHierarchyNode) => {
                    // Highlight the arc
                    d3.select(event.currentTarget)
                        .style('opacity', 1)
                        .style('filter', 'brightness(1.1)');

                    // Update center info panel with segment data
                    updateCenterInfo(d);
                })
                .on('mouseout', (event) => {
                    // Restore original styling
                    d3.select(event.currentTarget)
                        .style('opacity', 0.85)
                        .style('filter', 'none');

                    // Restore default center info
                    updateCenterInfo();
                });
        }
    }

    // Prepare four-layer DDC hierarchy (Main Classes -> Divisions -> Sections -> User Domains)
    private prepareFourLayerHierarchy(): D3HierarchyNode {
        if (!this.data!.domainHierarchy || this.data!.domainHierarchy.length === 0) {
            return { name: "root", children: [] };
        }

        // Validate that we have a proper four-layer structure
        const validateAndStructure = (nodes: HierarchicalDomain[]): D3HierarchyNode[] => {
            return nodes
                .filter(node => node.noteCount > 0)
                .map(node => {
                    const d3Node: D3HierarchyNode = {
                        name: node.name,
                        ddcCode: node.ddcCode,
                        avgCentrality: node.avgCentrality,
                        keywords: node.keywords,
                        level: node.level,
                        noteCount: node.noteCount
                    };

                    if (node.children && node.children.length > 0) {
                        // This is a parent node - validate children
                        const validChildren = validateAndStructure(node.children);
                        if (validChildren.length > 0) {
                            d3Node.children = validChildren;
                        } else {
                            // If no valid children, this becomes a leaf node
                            d3Node.value = node.noteCount;
                        }
                    } else {
                        // This is a leaf node
                        d3Node.value = node.noteCount;
                    }

                    return d3Node;
                });
        };

        const structuredHierarchy = validateAndStructure(this.data!.domainHierarchy);
        
        console.log(`📊 DDC Four-Layer Structure: ${structuredHierarchy.length} main classes prepared`);
        
        return {
            name: "root",
            children: structuredHierarchy
        };
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
        this.data = null;
        await this.render();
    }
}