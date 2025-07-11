import { App } from 'obsidian';
import { GraphAnalysisSettings, HierarchicalDomain, DomainConnection } from '../../types/types';
import * as d3 from 'd3';
import { VaultAnalysisResult, MasterAnalysisManager, VaultAnalysisData } from '../../ai/MasterAnalysisManager';

export interface DomainData {
    domain: string;
    noteCount: number;
    avgCentrality: number;
    keywords: string[];
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
    private masterAnalysisManager: MasterAnalysisManager;

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
        this.masterAnalysisManager = new MasterAnalysisManager(app, settings);

        // Listen for theme or accent color changes and refresh chart
        // Use multiple methods to detect theme changes
        this._themeChangeHandler = () => {
            // Debounce rapid theme changes
            if (this._themeChangeTimeout) {
                clearTimeout(this._themeChangeTimeout);
            }
            this._themeChangeTimeout = setTimeout(() => {
                this.refresh();
            }, 100);
        };

        // Method 1: Listen for CSS changes on workspace
        const workspace = document.querySelector('.workspace');
        if (workspace) {
            workspace.addEventListener('css-change', this._themeChangeHandler);
        }

                 // Method 2: Listen for theme class changes on body
         this._themeObserver = new MutationObserver((mutations) => {
             for (const mutation of mutations) {
                 if (mutation.type === 'attributes' && 
                     mutation.attributeName === 'class' &&
                     mutation.target === document.body) {
                     this._themeChangeHandler?.();
                     break;
                 }
             }
         });
        this._themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

                 // Method 3: Listen for changes to the document element class/style
         this._documentObserver = new MutationObserver((mutations) => {
             for (const mutation of mutations) {
                 if (mutation.type === 'attributes' && 
                     (mutation.attributeName === 'class' || mutation.attributeName === 'style') &&
                     mutation.target === document.documentElement) {
                     this._themeChangeHandler?.();
                     break;
                 }
             }
         });
        this._documentObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    // Add a destructor to remove the event listener when the chart is destroyed
    private _themeChangeHandler?: () => void;
    private _themeChangeTimeout?: NodeJS.Timeout;
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

    public async loadCachedData(): Promise<DomainDistributionData | null> {
        try {
            // First try to load from the new structure-specific analysis file
            try {
                const structureFilePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/responses/structure-analysis.json`;
                const structureContent = await this.app.vault.adapter.read(structureFilePath);
                const structureData = JSON.parse(structureContent);
                
                if (structureData?.knowledgeStructure?.domainHierarchy) {
                    console.log('Using structure-specific analysis for domain distribution chart');
                    return {
                        domainHierarchy: structureData.knowledgeStructure.domainHierarchy,
                        domainConnections: structureData.knowledgeStructure.domainConnections
                    };
                }
            } catch (structureError) {
                console.log('No structure-specific analysis found, will try other methods');
            }
            
            // Then try to load from the master analysis file (legacy approach)
            try {
                const masterFilePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
                const masterContent = await this.app.vault.adapter.read(masterFilePath);
                const masterData = JSON.parse(masterContent);
                
                if (masterData?.knowledgeStructure?.domainHierarchy) {
                    console.log('Using master analysis for domain distribution chart');
                    return {
                        domainHierarchy: masterData.knowledgeStructure.domainHierarchy,
                        domainConnections: masterData.knowledgeStructure.domainConnections
                    };
                }
            } catch (masterError) {
                console.log('No master analysis found, will try building from vault analysis');
            }
            
            // Finally, try to build directly from vault analysis data (new approach)
            return await this.buildHierarchyFromVaultAnalysis();
        } catch (error) {
            console.warn('No cached domain distribution data found:', error);
            return null;
        }
    }
    
    /**
     * Build domain hierarchy directly from vault analysis data
     * This is the new approach that doesn't rely on AI to build the hierarchy
     */
    private async buildHierarchyFromVaultAnalysis(): Promise<DomainDistributionData | null> {
        try {
            // Load vault analysis data
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/vault-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const vaultData = JSON.parse(content) as VaultAnalysisData;
            
            if (!vaultData?.results || vaultData.results.length === 0) {
                console.log('No vault analysis data found or empty results');
                return null;
            }
            
            console.log(`Building domain hierarchy from ${vaultData.results.length} notes using MasterAnalysisManager`);
            
            // Ensure DDC template is loaded in MasterAnalysisManager
            await this.masterAnalysisManager.ensureDDCTemplateLoaded();
            
            // Use MasterAnalysisManager's implementation to build the hierarchy
            const domainHierarchy = this.masterAnalysisManager.buildHierarchyFromVaultData(vaultData);
            
            return {
                domainHierarchy,
                domainConnections: []
            };
        } catch (error) {
            console.error('Failed to build hierarchy from vault analysis:', error);
            return null;
        }
    }
    
    // Remove the redundant helper methods as they're now in MasterAnalysisManager
    
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
                const levelNames = { 1: 'Class', 2: 'Section' };
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
        // Helper function for vivid HSL color palette based on accent color
        const getVividAccentColor = (i: number, total: number): string => {
            // Try to get accent color from Obsidian's CSS variables
            const accentColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--text-accent')
                .trim();
            
            // If we have the accent color, use it as the base
            if (accentColor && accentColor !== '') {
                // Try to parse the accent color to extract HSL values
                // First check if it's already an HSL color
                const hslMatch = accentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
                if (hslMatch) {
                    const hue = parseInt(hslMatch[1]);
                    const saturation = parseInt(hslMatch[2]);
                    const lightness = parseInt(hslMatch[3]);
                    
                    // Vary lightness for each section, keep saturation high for vividness
                    const adjustedLightness = Math.max(35, Math.min(65, 
                        lightness + (i / Math.max(1, total - 1)) * 25 - 12.5
                    ));
                    const adjustedSaturation = Math.max(70, saturation);
                    
                    return `hsl(${hue}, ${adjustedSaturation}%, ${adjustedLightness}%)`;
                }
                
                // If not HSL, try to convert RGB to HSL
                const rgbMatch = accentColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgbMatch) {
                    const r = parseInt(rgbMatch[1]) / 255;
                    const g = parseInt(rgbMatch[2]) / 255;
                    const b = parseInt(rgbMatch[3]) / 255;
                    
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const diff = max - min;
                    
                    // Calculate HSL values
                    let hue = 0;
                    if (diff !== 0) {
                        if (max === r) hue = ((g - b) / diff) % 6;
                        else if (max === g) hue = (b - r) / diff + 2;
                        else hue = (r - g) / diff + 4;
                    }
                    hue = Math.round(hue * 60);
                    if (hue < 0) hue += 360;
                    
                    const lightness = (max + min) / 2;
                    const saturation = diff === 0 ? 0 : diff / (1 - Math.abs(2 * lightness - 1));
                    
                    // Vary lightness for each section, keep saturation high for vividness
                    const adjustedLightness = Math.max(35, Math.min(65, 
                        lightness * 100 + (i / Math.max(1, total - 1)) * 25 - 12.5
                    ));
                    const adjustedSaturation = Math.max(70, saturation * 100);
                    
                    return `hsl(${hue}, ${adjustedSaturation}%, ${adjustedLightness}%)`;
                }
                
                // If all else fails, use the accent color directly with opacity variations
                const opacity = 0.6 + 0.4 * (i / Math.max(1, total - 1));
                return `color-mix(in srgb, ${accentColor} ${Math.round(opacity * 100)}%, transparent)`;
            }
            
            // Ultimate fallback: use a neutral color scheme that works with any theme
            const isDarkTheme = document.body.classList.contains('theme-dark');
            const baseHue = 220; // Blue-gray, works well in both themes
            const baseSaturation = 30;
            const baseLightness = isDarkTheme ? 60 : 40;
            
            // Vary lightness for each section
            const adjustedLightness = Math.max(
                isDarkTheme ? 40 : 25, 
                Math.min(
                    isDarkTheme ? 80 : 65, 
                    baseLightness + (i / Math.max(1, total - 1)) * 30 - 15
                )
            );
            
            return `hsl(${baseHue}, ${baseSaturation}%, ${adjustedLightness}%)`;
        };

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
                        console.log(`📊   Level 2 [${i}.${j}]: ${grandChild.name} (${grandChild.noteCount || grandChild.value} notes)`);
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

        // Remove color palette generation. We'll use CSS variables for fill and filter for distinction.

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
        const descendants = root.descendants().slice(1);
        const totalTopLevel = hierarchyData.children?.length || 1;
        const paths = g.selectAll('path')
            .data(descendants)
            .enter().append('path')
            .attr('d', arc)
            .attr('fill', (d: any) => {
                // Use vivid accent color for top-level sections, inherit for children
                let topIndex = 0;
                let ancestor = d;
                while (ancestor.depth > 1) ancestor = ancestor.parent;
                if (ancestor.parent) {
                    topIndex = ancestor.parent.children.indexOf(ancestor);
                } else if (ancestor.depth === 1 && ancestor.parent) {
                    topIndex = ancestor.parent.children.indexOf(ancestor);
                } else if (ancestor.depth === 1) {
                    topIndex = descendants.filter(x => x.depth === 1).indexOf(ancestor);
                }
                const total = totalTopLevel;
                return getVividAccentColor(topIndex, total);
            })
            .attr('fill-opacity', (d: any) => arcVisible(d) ? (d.children ? 0.6 : 0.4) : 0)
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1)
            .attr('pointer-events', (d: any) => arcVisible(d) ? 'auto' : 'none')
            .style('cursor', 'default')
            .style('transition', 'opacity 0.2s ease, filter 0.2s ease');

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

        // Add labels with text wrapping for long labels
        const labelGroups = g.append('g')
            .attr('pointer-events', 'none')
            .attr('text-anchor', 'middle')
            .style('user-select', 'none')
            .selectAll('g')
            .data(root.descendants().slice(1))
            .enter().append('g')
            .attr('transform', (d: any) => labelTransform(d))
            .style('opacity', (d: any) => +labelVisible(d));

        labelGroups.each(function(d: any) {
            const group = d3.select(this);
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
            let line: string[] = [];
            let lineNumber = 0;
            let tspan = group.append('text')
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
                    tspan = group.select('text')
                        .append('tspan')
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
                tspan = group.select('text')
                    .append('tspan')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('dy', `${lineNumber * 1.1}em`)
                    .text(currentLine);
            }
            
            // Center the text vertically
            const textElement = group.select('text');
            const numLines = textElement.selectAll('tspan').size();
            if (numLines > 1) {
                const offset = -(numLines - 1) * 0.5 * 1.1;
                textElement.selectAll('tspan').each(function(d: any, i: number) {
                    d3.select(this).attr('dy', `${offset + i * 1.1}em`);
                });
            } else {
                textElement.attr('dy', '0.35em');
            }
        });

        // Create enlarged center circle for info panel
        const centerRadius = Math.max(radius * 0.9, 40);
        const centerCircle = g.append('circle')
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
                    .text('DDC Hierarchy');

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
                        .text('domain sections');

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
        this.data = null;
        await this.render();
    }
}