import { App, TFile, Modal } from 'obsidian';
import * as d3 from 'd3';
import { VaultAnalysisData } from '../../ai/MasterAnalysisManager';

export type ScatterChartMode = 'links' | 'centrality';

export interface ScatterDataPoint {
    path: string;
    title: string;
    xValue: number;  // Generic X value (outboundLinks or betweennessCentrality)
    yValue: number;  // Generic Y value (inboundLinks or eigenvectorCentrality)
    // Additional data for tooltips
    outboundLinks?: number;
    inboundLinks?: number;
    betweennessCentrality?: number;
    eigenvectorCentrality?: number;
}

export interface ScatterChartOptions {
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    mode?: ScatterChartMode;
    analysisData?: VaultAnalysisData;  // Pass in for centrality mode
    modal?: Modal;  // Pass modal reference to close when opening notes
}

export class ConnectivityScatterChart {
    private app: App;
    private container: HTMLElement;
    private options: ScatterChartOptions;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
    private tooltip: HTMLElement | null = null;
    private data: ScatterDataPoint[] = [];
    private currentMode: ScatterChartMode;

    constructor(
        app: App,
        container: HTMLElement,
        options: Partial<ScatterChartOptions> = {}
    ) {
        this.app = app;
        this.container = container;
        this.options = {
            width: 600,
            height: 400,
            margin: { top: 40, right: 40, bottom: 120, left: 60 }, // Increased bottom margin for explanation text with spacing
            mode: 'links',
            ...options
        };
        this.currentMode = this.options.mode || 'links';
    }

    public async render(): Promise<void> {
        // Clear container
        this.container.empty();

        // Compute data based on current mode
        if (this.currentMode === 'links') {
            await this.computeLinkData();
        } else {
            await this.computeCentralityData();
        }

        if (this.data.length === 0) {
            const isCentralityMode = this.currentMode === 'centrality';
            const message = isCentralityMode 
                ? 'No centrality data available. Please generate vault analysis first to view centrality metrics.'
                : 'No connectivity data available for scatter plot analysis.';
            const noDataMsg = this.container.createEl('p', {
                text: message,
                cls: 'scatter-chart-no-data'
            });
            noDataMsg.style.textAlign = 'center';
            noDataMsg.style.color = 'var(--text-muted)';
            noDataMsg.style.padding = '40px 20px';
            noDataMsg.style.width = '100%';
            return;
        }

        const { width, height, margin } = this.options;
        const innerWidth = width! - margin!.left - margin!.right;
        const innerHeight = height! - margin!.top - margin!.bottom;

        // Create SVG - center aligned with auto-fit height
        // The SVG height already accounts for margins, so use the configured height
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', width!)
            .attr('height', height!)
            .attr('viewBox', `0 0 ${width!} ${height!}`)
            .attr('style', 'max-width: 100%; height: auto; display: block; margin: 0 auto;');

        const g = this.svg.append('g')
            .attr('transform', `translate(${margin!.left},${margin!.top})`);

        // Create scales with proper bounds handling
        const xValues = this.data.map(d => d.xValue);
        const yValues = this.data.map(d => d.yValue);
        const maxX = Math.max(...xValues, 0);
        const maxY = Math.max(...yValues, 0);

        // Ensure minimum domain range for better visualization
        // If max is 0, show at least 0-1 range; otherwise add 10% padding
        const xDomainMax = maxX === 0 ? 1 : maxX * 1.1;
        const yDomainMax = maxY === 0 ? 1 : maxY * 1.1;

        const xScale = d3.scaleLinear()
            .domain([0, xDomainMax])
            .nice()
            .range([0, innerWidth]);

        const yScale = d3.scaleLinear()
            .domain([0, yDomainMax])
            .nice()
            .range([innerHeight, 0]);

        // Use a single color for all data points (accent color)
        const dotColor = 'var(--text-accent)';

        // Draw data points
        const dots = g.append('g').attr('class', 'scatter-dots');

        dots.selectAll('.scatter-dot')
            .data(this.data)
            .enter()
            .append('circle')
            .attr('class', 'scatter-dot')
            .attr('cx', d => xScale(d.xValue))
            .attr('cy', d => yScale(d.yValue))
            .attr('r', 4)
            .attr('fill', dotColor)
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1)
            .style('opacity', 0.7)
            .on('mouseover', (event: MouseEvent, d: ScatterDataPoint) => {
                d3.select(event.currentTarget as SVGCircleElement)
                    .attr('r', 6)
                    .style('opacity', 1);
                this.showTooltip(event, d);
            })
            .on('mousemove', (event: MouseEvent) => {
                this.updateTooltipPosition(event);
            })
            .on('mouseout', (event: MouseEvent) => {
                d3.select(event.currentTarget as SVGCircleElement)
                    .attr('r', 4)
                    .style('opacity', 0.7);
                this.hideTooltip();
            });

        // Determine axis labels and formatting based on mode
        const isCentralityMode = this.currentMode === 'centrality';
        const xAxisLabel = isCentralityMode ? 'Betweenness' : 'Outbound Links';
        const yAxisLabel = isCentralityMode ? 'Eigenvector' : 'Inbound Links';
        
        // Format function for ticks - use appropriate formatting based on value size
        const tickFormat = (d: d3.NumberValue, index?: number): string => {
            const value = typeof d === 'number' ? d : d.valueOf();
            
            // For centrality mode with very small values, use scientific notation
            if (isCentralityMode && value < 0.01 && value > 0) {
                return value.toExponential(1);
            }
            
            // For small decimal values, show 3 decimal places
            if (value < 1 && value > 0) {
                return value.toFixed(3);
            }
            
            // For integer values or larger numbers, show as integer
            if (value >= 1) {
                return Math.round(value).toString();
            }
            
            return value.toString();
        };

        // Add X axis with proper tick generation
        // Let d3 automatically determine good tick values, but ensure reasonable count
        const xAxis = d3.axisBottom(xScale)
            .ticks(isCentralityMode ? 8 : 10) // More ticks for centrality (smaller values), fewer for links
            .tickFormat(tickFormat);

        const xAxisGroup = g.append('g')
            .attr('transform', `translate(0,${innerHeight})`);
        xAxisGroup.call(xAxis);

        xAxisGroup.selectAll('.tick text')
            .attr('fill', 'var(--text-muted)')
            .style('font-size', '11px');

        xAxisGroup.append('text')
            .attr('x', innerWidth / 2)
            .attr('y', 45)
            .attr('fill', 'var(--text-normal)')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .text(xAxisLabel);

        // Add explanation text under x-axis with increased spacing
        const explanationGroup = xAxisGroup.append('g')
            .attr('transform', `translate(${innerWidth / 2}, 80)`); // Increased from 60 to 80 for more space
        
        let lineY = 0;
        const lineHeight = 14;
        const fontSize = '11px';
        
        if (isCentralityMode) {
            // Centrality mode explanation
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .style('font-weight', '500')
                .text('Purpose: Compare bridge role vs influence to identify note structural types.');
            
            lineY += lineHeight;
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .text('High Betweenness + Low Eigenvector = Bridges; Low Betweenness + High Eigenvector = Influential;');
            
            lineY += lineHeight;
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .text('High Both = Critical Hubs; Low Both = Peripheral Notes.');
        } else {
            // Links mode explanation
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .style('font-weight', '500')
                .text('Purpose: Reveal connectivity imbalances to identify integration opportunities.');
            
            lineY += lineHeight;
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .text('High Outbound + Low Inbound = Silos; Low Outbound + High Inbound = Hub Candidates;');
            
            lineY += lineHeight;
            explanationGroup.append('text')
                .attr('x', 0)
                .attr('y', lineY)
                .attr('fill', 'var(--text-muted)')
                .style('text-anchor', 'middle')
                .style('font-size', fontSize)
                .text('High Both = Well Connected; Low Both = Orphan Notes.');
        }

        // Add Y axis with proper tick generation
        // Use same tick count as x-axis for consistency
        const yAxis = d3.axisLeft(yScale)
            .ticks(isCentralityMode ? 8 : 10) // More ticks for centrality (smaller values), fewer for links
            .tickFormat(tickFormat);

        const yAxisGroup = g.append('g');
        yAxisGroup.call(yAxis);

        yAxisGroup.selectAll('.tick text')
            .attr('fill', 'var(--text-muted)')
            .style('font-size', '11px');

        yAxisGroup.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -45)
            .attr('x', -innerHeight / 2)
            .attr('fill', 'var(--text-normal)')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .text(yAxisLabel);

        // Style axes
        g.selectAll('.domain, .tick line')
            .attr('stroke', 'var(--background-modifier-border)');
    }

    private async computeLinkData(): Promise<void> {
        const allFiles = this.app.vault.getMarkdownFiles();
        const dataPoints: ScatterDataPoint[] = [];

        // Build reverse index: count how many files link TO each file
        const inboundLinkCounts = new Map<string, number>();
        
        // First pass: count inbound links by iterating through all files and their links
        for (const file of allFiles) {
            try {
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache) continue;

                // Collect all types of links (links, embeds, frontmatterLinks)
                const allLinks = [
                    ...(cache.links || []),
                    ...(cache.embeds || []),
                    ...(cache.frontmatterLinks || [])
                ];

                // For each link, find the target file and increment its inbound count
                for (const link of allLinks) {
                    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (resolvedFile) {
                        const currentCount = inboundLinkCounts.get(resolvedFile.path) || 0;
                        inboundLinkCounts.set(resolvedFile.path, currentCount + 1);
                    }
                }
            } catch (error) {
                // console.warn(`Error processing links from file ${file.path}:`, error);
            }
        }

        // Second pass: create data points with both outbound and inbound counts
        for (const file of allFiles) {
            try {
                // Get outbound links (links FROM this file)
                const cache = this.app.metadataCache.getFileCache(file);
                const outboundLinks = (cache?.links?.length || 0) + (cache?.embeds?.length || 0) + (cache?.frontmatterLinks?.length || 0);

                // Get inbound links (links TO this file) from our reverse index
                const inboundLinks = inboundLinkCounts.get(file.path) || 0;

                // Only include files with at least one link (inbound or outbound)
                if (outboundLinks > 0 || inboundLinks > 0) {
                    const title = file.basename || file.name.replace('.md', '');
                    dataPoints.push({
                        path: file.path,
                        title: title,
                        xValue: outboundLinks,
                        yValue: inboundLinks,
                        outboundLinks: outboundLinks,
                        inboundLinks: inboundLinks
                    });
                }
            } catch (error) {
                // console.warn(`Error processing file ${file.path}:`, error);
            }
        }

        this.data = dataPoints;
    }

    private async computeCentralityData(): Promise<void> {
        const dataPoints: ScatterDataPoint[] = [];

        if (!this.options.analysisData || !this.options.analysisData.results) {
            // console.warn('No analysis data available for centrality mode');
            this.data = [];
            return;
        }

        // IMPORTANT: Read centrality scores from cached vault-analysis.json
        // Do NOT recalculate - this is time-consuming. The analysisData.results
        // already contains graphMetrics from vault-analysis.json file.
        for (const result of this.options.analysisData.results) {
            const betweenness = result.graphMetrics?.betweennessCentrality ?? 0;
            const eigenvector = result.graphMetrics?.eigenvectorCentrality ?? 0;

            // Only include notes with at least one centrality value
            if (betweenness > 0 || eigenvector > 0) {
                dataPoints.push({
                    path: result.path,
                    title: result.title,
                    xValue: betweenness,
                    yValue: eigenvector,
                    betweennessCentrality: betweenness,
                    eigenvectorCentrality: eigenvector
                });
            }
        }

        this.data = dataPoints;
    }

    private showTooltip(event: MouseEvent, data: ScatterDataPoint): void {
        this.hideTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'scatter-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.background = 'var(--background-primary)';
        tooltip.style.border = '1px solid var(--background-modifier-border)';
        tooltip.style.borderRadius = 'var(--radius-s)';
        tooltip.style.padding = '8px 12px';
        tooltip.style.fontSize = 'var(--font-ui-small)';
        tooltip.style.color = 'var(--text-normal)';
        tooltip.style.boxShadow = 'var(--shadow-s)';
        tooltip.style.zIndex = '1000';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.maxWidth = '300px';

        const isCentralityMode = this.currentMode === 'centrality';
        let content = `
            <div style="font-weight: var(--font-medium); margin-bottom: 4px; color: var(--text-normal);">
                ${data.title}
            </div>
        `;

        if (isCentralityMode) {
            const betweenness = data.betweennessCentrality ?? 0;
            const eigenvector = data.eigenvectorCentrality ?? 0;
            const formatValue = (val: number): string => {
                if (val < 0.01 && val > 0) return val.toExponential(3);
                return val.toFixed(4);
            };
            content += `
                <div style="color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: 2px;">
                    Betweenness: ${formatValue(betweenness)}
                </div>
                <div style="color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: 2px;">
                    Eigenvector: ${formatValue(eigenvector)}
                </div>
            `;
        } else {
            const outbound = data.outboundLinks ?? 0;
            const inbound = data.inboundLinks ?? 0;
            content += `
                <div style="color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: 2px;">
                    Outbound: ${outbound} link${outbound !== 1 ? 's' : ''}
                </div>
                <div style="color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: 2px;">
                    Inbound: ${inbound} link${inbound !== 1 ? 's' : ''}
                </div>
            `;
        }

        tooltip.innerHTML = content;

        document.body.appendChild(tooltip);
        this.tooltip = tooltip;
        this.updateTooltipPosition(event);
    }

    private updateTooltipPosition(event: MouseEvent): void {
        if (!this.tooltip) return;

        const rect = this.tooltip.getBoundingClientRect();
        const x = event.pageX - rect.width / 2;
        const y = event.pageY - rect.height - 10;

        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }

    private hideTooltip(): void {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }

    private async openNote(path: string): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(path) as TFile;
            if (file) {
                // Close modal first to show note completely
                if (this.options.modal) {
                    this.options.modal.close();
                }
                // Small delay to ensure modal closes before opening note
                setTimeout(async () => {
                    await this.app.workspace.openLinkText(path, '', false);
                }, 100);
            }
        } catch (error) {
            // console.error(`Error opening note ${path}:`, error);
        }
    }

    public async setMode(mode: ScatterChartMode): Promise<void> {
        this.currentMode = mode;
        await this.render();
    }

    public destroy(): void {
        this.hideTooltip();
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        this.container.empty();
    }
}
