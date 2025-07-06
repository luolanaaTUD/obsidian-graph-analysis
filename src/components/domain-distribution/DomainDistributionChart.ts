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
    // Hierarchical domain structure for sunburst visualization (2 layers: Main Classes, Sections)
    // Built by MasterAnalysisManager using section-based classification
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
                    Please generate vault analysis with optimized DDC section classification to see four-layer domain distribution.
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
        const radius = width / 6; // Use D3 standard radius calculation

        // Create container for chart
        const sunburstContainer = d3.select(container)
            .style('position', 'relative');

        // Prepare data - hierarchy is now pre-built by MasterAnalysisManager
        const hierarchyData = this.prepareOptimizedHierarchy();
        
        // DETAILED DEBUGGING: Let's see what we're actually getting
        console.log('📊 Raw domainHierarchy from MasterAnalysisManager:', this.data?.domainHierarchy);
        console.log('📊 Prepared hierarchyData:', hierarchyData);
        console.log('📊 HierarchyData children count:', hierarchyData.children?.length || 0);
        
        // Debug each level
        if (hierarchyData.children) {
            hierarchyData.children.forEach((child, i) => {
                console.log(`📊 Level 1 [${i}]: ${child.name} (${child.noteCount || child.value} notes, children: ${child.children?.length || 0})`);
                if (child.children) {
                    child.children.forEach((grandChild, j) => {
                        console.log(`📊   Level 2 [${i}.${j}]: ${grandChild.name} (${grandChild.noteCount || grandChild.value} notes, children: ${grandChild.children?.length || 0})`);
                        if (grandChild.children) {
                            grandChild.children.forEach((greatGrandChild, k) => {
                                console.log(`📊     Level 3 [${i}.${j}.${k}]: ${greatGrandChild.name} (${greatGrandChild.noteCount || greatGrandChild.value} notes)`);
                            });
                        }
                    });
                }
            });
        }
        
        // Compute the layout using D3 standard approach
        const hierarchy = d3.hierarchy<D3HierarchyNode>(hierarchyData)
            .sum((d: D3HierarchyNode) => d.value || 0)
            .sort((a, b) => (b.value || 0) - (a.value || 0));
        
        const root = d3.partition<D3HierarchyNode>()
            .size([2 * Math.PI, hierarchy.height + 1])
            (hierarchy);

        console.log(`📊 DDC Sunburst: ${width}px, layers=${hierarchy.height}, total_nodes=${root.descendants().length}`);
        console.log(`📊 Descendants by depth:`, root.descendants().reduce((acc: any, d: any) => {
            acc[d.depth] = (acc[d.depth] || 0) + 1;
            return acc;
        }, {}));

        // Create color scale - simpler approach using D3 standard colors
        const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, (hierarchyData.children?.length || 0) + 1));

        // Create the arc generator following D3 example
        const arc = d3.arc<any>()
            .startAngle((d: any) => d.x0)
            .endAngle((d: any) => d.x1)
            .padAngle((d: any) => Math.min((d.x1 - d.x0) / 2, 0.005))
            .padRadius(radius * 1.5)
            .innerRadius((d: any) => d.y0 * radius)
            .outerRadius((d: any) => Math.max(d.y0 * radius, d.y1 * radius - 1));

        // MODIFIED: Show all layers at once - removed depth filtering
        const arcVisible = (d: any) => {
            return d.y0 >= 1 && d.x1 > d.x0;
        };

        // Label visibility function - show labels for all visible arcs
        const labelVisible = (d: any) => {
            return d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
        };

        // Label transform function
        const labelTransform = (d: any) => {
            const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
            const y = (d.y0 + d.y1) / 2 * radius;
            return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
        };

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

        // Create all arcs (excluding root) - show all layers immediately
        const paths = g.selectAll('path')
            .data(root.descendants().slice(1)) // Standard D3 approach - all descendants except root
            .enter().append('path')
            .attr('d', arc)
            .attr('fill', (d: any) => {
                // Color based on top-level category for consistency
                while (d.depth > 1) d = d.parent;
                return color(d.data.name);
            })
            .attr('fill-opacity', (d: any) => arcVisible(d) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1)
            .attr('pointer-events', (d: any) => arcVisible(d) ? 'auto' : 'none')
            .style('cursor', 'default') // Removed pointer cursor since no click functionality
            .style('transition', 'opacity 0.2s ease, filter 0.2s ease'); // Simplified transitions

        // Add tooltips to paths
        const format = d3.format(',d');
        paths.append('title')
            .text((d: any) => {
                const path = d.ancestors().map((ancestor: any) => ancestor.data.name).reverse().join(' → ');
                const info = [
                    `${path}`,
                    `${format(d.value || d.data.noteCount || 0)} notes`,
                ];
                if (d.data.ddcCode) {
                    info.push(`DDC: ${d.data.ddcCode}`);
                }
                if (d.data.avgCentrality !== undefined) {
                    info.push(`Centrality: ${d.data.avgCentrality.toFixed(3)}`);
                }
                return info.join('\n');
            });

        // Add labels - show all labels for visible arcs
        const labels = g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('text')
            .data(root.descendants().slice(1))
            .enter().append('text')
            .attr('dy', '0.35em')
            .attr('fill-opacity', (d: any) => +labelVisible(d))
            .attr('transform', (d: any) => labelTransform(d))
            .attr('fill', 'var(--text-normal)')
            .style('font-size', (d: any) => {
                // Adjust font size based on depth and arc size
                const baseSize = Math.max(8, radius * 0.08);
                const depthFactor = Math.max(0.6, 1 - (d.depth - 1) * 0.1);
                return `${baseSize * depthFactor}px`;
            })
            .text((d: any) => {
                // Show abbreviated names for smaller arcs
                const arcSize = (d.y1 - d.y0) * (d.x1 - d.x0);
                const name = d.data.name;
                if (arcSize < 0.1 && name.length > 8) {
                    return name.substring(0, 8) + '...';
                }
                return name;
            });

        // Create enlarged center circle for info panel
        const centerRadius = Math.max(radius * 0.9, 40);
        const centerCircle = g.append('circle')
            .datum(root)
            .attr('r', centerRadius)
            .attr('fill', 'var(--background-secondary)')
            .attr('stroke', 'var(--background-modifier-border)')
            .attr('stroke-width', 2)
            .style('opacity', 0.95)
            .style('cursor', 'default'); // Removed pointer cursor since no click functionality

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

            if (data && data !== root) {
                // Show detailed segment information
                const percentage = ((data.value || data.data.noteCount || 0) / (root.value || 1) * 100).toFixed(1);
                const layerNames = ['Root', 'Main Class', 'Division', 'Section', 'User Domain'];
                const layerName = layerNames[data.depth] || `Layer ${data.depth}`;
                
                // Domain name with text wrapping for long names
                const domainName = data.data.name;
                const maxLineLength = 14;
                
                // Split long domain names into multiple lines
                const nameLines = [];
                if (domainName.length <= maxLineLength) {
                    nameLines.push(domainName);
                } else {
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
                                nameLines.push(word.slice(0, maxLineLength - 3) + '...');
                                currentLine = '';
                            }
                        }
                    }
                    if (currentLine) {
                        nameLines.push(currentLine);
                    }
                    
                    if (nameLines.length > 2) {
                        nameLines[1] = nameLines[1].slice(0, maxLineLength - 3) + '...';
                        nameLines.splice(2);
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
                        .style('fill', 'var(--text-accent)')
                        .text(line);
                    currentLine++;
                });

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '1.6em')
                    .style('font-size', '1px')
                    .text('');

                if (data.data.ddcCode) {
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.10, 8) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text(`DDC: ${data.data.ddcCode}`);
                    currentLine++;
                }

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.10, 7) + 'px')
                    .style('fill', 'var(--text-muted)')
                    .text(layerName);
                currentLine++;

                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', lineHeight)
                    .style('font-size', Math.max(centerRadius * 0.24, 14) + 'px')
                    .style('font-weight', '700')
                    .style('fill', 'var(--text-normal)')
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
                const totalNotes = root.value || 0;
                const layerCount = hierarchy.height;
                
                textContainer.append('tspan')
                    .attr('x', 0)
                    .attr('dy', '0em')
                    .style('font-size', Math.max(centerRadius * 0.14, 11) + 'px')
                    .style('font-weight', '600')
                    .style('fill', 'var(--text-accent)')
                    .text('DDC Hierarchy');

                if (totalNotes > 0) {
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
                        .text(totalNotes.toString());

                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '1.2em')
                        .style('font-size', Math.max(centerRadius * 0.12, 9) + 'px')
                        .style('fill', 'var(--text-muted)')
                        .text('total notes');

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
                .on('mouseover', (event, d: any) => {
                    d3.select(event.currentTarget)
                        .style('opacity', 1)
                        .style('filter', 'brightness(1.1)');

                    updateCenterInfo(d);
                })
                .on('mouseout', (event, d: any) => {
                    d3.select(event.currentTarget)
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
                
                // Only add value for leaf nodes (level 2) or nodes without children
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
        this.data = null;
        await this.render();
    }
}