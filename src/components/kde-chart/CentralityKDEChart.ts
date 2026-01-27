import * as d3 from 'd3';
import { CentralityHistogramResult } from '../../utils/KDECalculationService';

export interface HistogramChartOptions {
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
}

export class CentralityKDEChart {
    private container: HTMLElement;
    private data: CentralityHistogramResult;
    private options: HistogramChartOptions;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
    private tooltip: HTMLElement | null = null;

    constructor(container: HTMLElement, data: CentralityHistogramResult, options: Partial<HistogramChartOptions> = {}) {
        this.container = container;
        this.data = data;
        this.options = {
            width: 800,
            height: 400,
            margin: { top: 20, right: 80, bottom: 70, left: 60 },
            ...options
        };
    }

    public render(): void {
        // Clear container
        this.container.empty();

        // Check if we have any data
        const hasData = this.data.totals.betweenness > 0 || 
                       this.data.totals.closeness > 0 || 
                       this.data.totals.eigenvector > 0;

        if (!hasData) {
            const noDataMsg = this.container.createEl('p', {
                text: 'No centrality data available for distribution analysis.',
                cls: 'kde-chart-no-data'
            });
            noDataMsg.style.textAlign = 'center';
            noDataMsg.style.color = 'var(--text-muted)';
            noDataMsg.style.padding = '40px 20px';
            return;
        }

        const { width, height, margin } = this.options;
        const innerWidth = width! - margin!.left - margin!.right;
        const innerHeight = height! - margin!.top - margin!.bottom;

        // Create SVG
        this.svg = d3.select(this.container)
            .append('svg')
            .attr('width', width!)
            .attr('height', height!)
            .attr('viewBox', `0 0 ${width!} ${height!}`)
            .attr('style', 'max-width: 100%; height: auto;');

        const g = this.svg.append('g')
            .attr('transform', `translate(${margin!.left},${margin!.top})`);

        // Find max count across all bins and centrality types for y-axis scaling
        let maxCount = 0;
        this.data.bins.forEach(bin => {
            maxCount = Math.max(maxCount, bin.betweenness, bin.closeness, bin.eigenvector);
        });

        // Create scales
        const xScale = d3.scaleBand()
            .domain(this.data.bins.map(bin => bin.range))
            .range([0, innerWidth])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, maxCount])
            .nice()
            .range([innerHeight, 0]);

        // Generate theme-based color variants with more distinct differences
        // Create three distinct color variants from accent color without transparency
        const generateAccentColorVariant = (index: number): string => {
            // Use different mix strategies for each centrality type to maximize distinction
            const mixStrategies = [
                // Betweenness: High accent ratio with light background (bright, vibrant)
                { ratio: 85, mixColor: 'var(--background-secondary)' },
                // Closeness: Medium accent ratio with muted background (moderate)
                { ratio: 55, mixColor: 'var(--text-muted)' },
                // Eigenvector: Lower accent ratio with border color (softer)
                { ratio: 35, mixColor: 'var(--background-modifier-border)' }
            ];
            
            const strategy = mixStrategies[index];
            return `color-mix(in srgb, var(--text-accent) ${strategy.ratio}%, ${strategy.mixColor})`;
        };

        const colors = {
            betweenness: generateAccentColorVariant(0), // Bright, vibrant variant
            closeness: generateAccentColorVariant(1),   // Moderate variant
            eigenvector: generateAccentColorVariant(2)  // Softer variant
        };

        // Bar width for grouped bars (3 bars per bin)
        const barWidth = xScale.bandwidth() / 3;
        const barOffset = barWidth * 0.1; // Small gap between bars

        // Draw bars for each centrality type
        const centralityTypes = [
            { key: 'betweenness' as const, color: colors.betweenness, offset: -barWidth },
            { key: 'closeness' as const, color: colors.closeness, offset: 0 },
            { key: 'eigenvector' as const, color: colors.eigenvector, offset: barWidth }
        ];

        centralityTypes.forEach(({ key, color, offset }) => {
            this.data.bins.forEach((bin, binIndex) => {
                const count = bin[key];
                if (count > 0) {
                    const x = (xScale(bin.range) || 0) + barWidth + offset;
                    const barHeight = innerHeight - yScale(count);

                    const bar = g.append('rect')
                        .attr('x', x)
                        .attr('y', yScale(count))
                        .attr('width', barWidth - barOffset * 2)
                        .attr('height', barHeight)
                        .attr('fill', color)
                        .attr('rx', 2)
                        .attr('ry', 2)
                        .style('cursor', 'pointer');

                    // Add hover tooltip
                    bar.on('mouseover', (event: MouseEvent) => {
                        this.showTooltip(event, bin.range, key, count);
                    })
                    .on('mousemove', (event: MouseEvent) => {
                        this.updateTooltipPosition(event);
                    })
                    .on('mouseout', () => {
                        this.hideTooltip();
                    });
                }
            });
        });

        // Add X axis with smart tick spacing for dynamic bins
        // Show approximately 10-12 evenly spaced ticks
        const numBins = this.data.bins.length;
        const desiredTicks = Math.min(12, Math.max(5, Math.floor(numBins / 10)));
        const tickStep = Math.max(1, Math.floor(numBins / desiredTicks));
        const tickValues = this.data.bins
            .filter((_, i) => i % tickStep === 0 || i === numBins - 1)
            .map(bin => bin.range);

        const xAxis = d3.axisBottom(xScale)
            .tickValues(tickValues)
            .tickFormat(d => {
                // Show simplified label (e.g., "0.00" instead of "0.00-0.01")
                const range = d as string;
                return range.split('-')[0];
            });

        const xAxisGroup = g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(xAxis);

        // Rotate x-axis labels for better readability
        xAxisGroup.selectAll('.tick text')
            .attr('transform', 'rotate(-45)')
            .attr('dx', '-0.5em')
            .attr('dy', '0.5em')
            .style('text-anchor', 'end')
            .style('font-size', '10px');

        xAxisGroup.append('text')
            .attr('x', innerWidth / 2)
            .attr('y', 50)
            .attr('fill', 'var(--text-normal)')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .text('Centrality Score Range');

        // Add Y axis
        const yAxis = d3.axisLeft(yScale)
            .ticks(Math.min(10, maxCount))
            .tickFormat(d => d.toString());

        const yAxisGroup = g.append('g')
            .call(yAxis);
        
        // Style y-axis text
        yAxisGroup.selectAll('.tick text')
            .attr('fill', 'var(--text-muted)')
            .style('font-size', '11px');
        
        yAxisGroup.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -40)
            .attr('x', -innerHeight / 2)
            .attr('fill', 'var(--text-normal)')
            .style('text-anchor', 'middle')
            .style('font-size', '12px')
            .text('Number of Notes');

        // Add legend
        const legend = g.append('g')
            .attr('transform', `translate(${innerWidth - 150}, 20)`);

        const legendItems = [
            { label: 'Betweenness', color: colors.betweenness },
            { label: 'Closeness', color: colors.closeness },
            { label: 'Eigenvector', color: colors.eigenvector }
        ];

        legendItems.forEach((item, i) => {
            const legendItem = legend.append('g')
                .attr('transform', `translate(0, ${i * 25})`);

            legendItem.append('rect')
                .attr('x', 0)
                .attr('y', -8)
                .attr('width', 16)
                .attr('height', 16)
                .attr('fill', item.color)
                .attr('rx', 2)
                .attr('ry', 2);

            legendItem.append('text')
                .attr('x', 20)
                .attr('y', 4)
                .attr('fill', 'var(--text-normal)')
                .style('font-size', '12px')
                .text(item.label);
        });

        // Style axes
        g.selectAll('.domain, .tick line')
            .attr('stroke', 'var(--background-modifier-border)');
    }

    private showTooltip(event: MouseEvent, range: string, centralityType: string, count: number): void {
        this.hideTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'histogram-tooltip';
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

        const centralityName = centralityType.charAt(0).toUpperCase() + centralityType.slice(1);
        tooltip.innerHTML = `
            <div style="font-weight: var(--font-medium); margin-bottom: 4px; color: var(--text-normal);">
                ${centralityName} Centrality
            </div>
            <div style="color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: 2px;">
                Range: ${range}
            </div>
            <div style="color: var(--text-muted); font-size: var(--font-ui-smaller);">
                Count: ${count} note${count !== 1 ? 's' : ''}
            </div>
        `;

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

    public destroy(): void {
        this.hideTooltip();
        if (this.svg) {
            this.svg.remove();
            this.svg = null;
        }
        this.container.empty();
    }
}
