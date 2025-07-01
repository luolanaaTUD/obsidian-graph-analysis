import { App } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';
import * as d3 from 'd3';

// Interfaces for Knowledge Structure data
export interface DomainData {
    domain: string;
    noteCount: number;
    avgCentrality: number;
    keywords: string[];
}

export interface NetworkNode {
    title: string;
    score: number;
    rank?: number;
    connections?: string[];
    reach?: number;
    influence?: number;
}

export interface KnowledgeStructureData {
    domainDistribution: DomainData[];
    knowledgeNetwork: {
        bridges: NetworkNode[];
        foundations: NetworkNode[];
        authorities: NetworkNode[];
    };
    insights: Array<{
        title: string;
        content: string;
        keyPoints: string[];
    }>;
    gaps: string[];
}

export class KnowledgeStructureManager {
    private app: App;
    private settings: GraphAnalysisSettings;
    private container: HTMLElement;
    private data: KnowledgeStructureData | null = null;

    constructor(app: App, settings: GraphAnalysisSettings) {
        this.app = app;
        this.settings = settings;
    }

    public async loadCachedStructureData(): Promise<KnowledgeStructureData | null> {
        try {
            const filePath = `${this.app.vault.configDir}/plugins/obsidian-graph-analysis/master-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const masterData = JSON.parse(content);
            
            if (masterData?.knowledgeStructure) {
                this.data = masterData.knowledgeStructure;
                return this.data;
            }
            return null;
        } catch (error) {
            console.warn('No cached knowledge structure data found:', error);
            return null;
        }
    }

    public async renderStructureAnalysis(container: HTMLElement): Promise<void> {
        this.container = container;
        this.container.empty();

        // Load data if not already loaded
        if (!this.data) {
            await this.loadCachedStructureData();
        }

        if (!this.data) {
            this.renderPlaceholder();
            return;
        }

        // Create main layout
        this.createStructureLayout();
    }

    private renderPlaceholder(): void {
        this.container.innerHTML = `
            <div class="structure-placeholder">
                <div class="placeholder-content">
                    <h3>📊 Knowledge Structure Analysis</h3>
                    <p>Generate vault analysis to see your knowledge structure insights.</p>
                    <div class="placeholder-features">
                        <div class="feature-item">
                            <span class="feature-icon">🎯</span>
                            <span>Domain Distribution</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🌐</span>
                            <span>Knowledge Network</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🔍</span>
                            <span>Knowledge Gaps</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private createStructureLayout(): void {
        // Upper section: Knowledge Structure Analysis
        const upperSection = this.container.createEl('div', { cls: 'structure-upper-section' });
        
        // Create insights panel
        this.createInsightsPanel(upperSection);
        
        // Create domain distribution chart
        this.createDomainDistribution(upperSection);

        // Create knowledge gaps section
        this.createKnowledgeGaps(upperSection);

        // Lower section: Knowledge Network Analysis
        const lowerSection = this.container.createEl('div', { cls: 'structure-lower-section' });
        
        this.createNetworkAnalysis(lowerSection);
    }

    private createInsightsPanel(container: HTMLElement): void {
        const insightsContainer = container.createEl('div', { cls: 'structure-insights' });
        
        insightsContainer.innerHTML = `
            <h3>🧠 Knowledge Structure Insights</h3>
            <div class="insights-content">
                ${this.data!.insights.map(insight => `
                    <div class="insight-item">
                        <h4>${insight.title}</h4>
                        <p>${insight.content}</p>
                        ${insight.keyPoints.length > 0 ? `
                            <ul class="key-points">
                                ${insight.keyPoints.map(point => `<li>${point}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    private createDomainDistribution(container: HTMLElement): void {
        const chartContainer = container.createEl('div', { cls: 'domain-distribution' });
        chartContainer.innerHTML = '<h3>📊 Knowledge Domain Distribution</h3>';
        
        const chartDiv = chartContainer.createEl('div', { cls: 'domain-chart' });
        
        // Create pie chart using D3
        this.renderDomainPieChart(chartDiv);
        
        // Create domain details table
        this.createDomainTable(chartContainer);
    }

    private renderDomainPieChart(container: HTMLElement): void {
        const width = 300;
        const height = 300;
        const radius = Math.min(width, height) / 2;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        const g = svg.append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        const pie = d3.pie<DomainData>()
            .value(d => d.noteCount)
            .sort(null);

        const arc = d3.arc<d3.PieArcDatum<DomainData>>()
            .innerRadius(0)
            .outerRadius(radius);

        const color = d3.scaleOrdinal()
            .domain(this.data!.domainDistribution.map(d => d.domain))
            .range(d3.schemeCategory10);

        const arcs = g.selectAll('.arc')
            .data(pie(this.data!.domainDistribution))
            .enter().append('g')
            .attr('class', 'arc');

        arcs.append('path')
            .attr('d', arc)
            .attr('fill', (d: any) => color(d.data.domain) as string)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);

        // Add labels
        arcs.append('text')
            .attr('transform', (d: any) => `translate(${arc.centroid(d)})`)
            .attr('text-anchor', 'middle')
            .style('font-size', '12px')
            .style('fill', '#fff')
            .text((d: any) => d.data.noteCount > 2 ? d.data.domain.slice(0, 8) : '');
    }

    private createDomainTable(container: HTMLElement): void {
        const tableContainer = container.createEl('div', { cls: 'domain-table-container' });
        
        const table = tableContainer.createEl('table', { cls: 'domain-table' });
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Domain</th>
                    <th>Notes</th>
                    <th>Avg Centrality</th>
                    <th>Key Themes</th>
                </tr>
            </thead>
            <tbody>
                ${this.data!.domainDistribution.map(domain => `
                    <tr>
                        <td><strong>${domain.domain}</strong></td>
                        <td>${domain.noteCount}</td>
                        <td>${domain.avgCentrality.toFixed(3)}</td>
                        <td><span class="domain-keywords">${domain.keywords.slice(0, 3).join(', ')}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        `;
    }

    private createKnowledgeGaps(container: HTMLElement): void {
        if (!this.data!.gaps || this.data!.gaps.length === 0) return;

        const gapsContainer = container.createEl('div', { cls: 'knowledge-gaps' });
        gapsContainer.innerHTML = `
            <h3>🔍 Identified Knowledge Gaps</h3>
            <div class="gaps-content">
                ${this.data!.gaps.map(gap => `
                    <div class="gap-item">
                        <span class="gap-icon">⚠️</span>
                        <span class="gap-text">${gap}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    private createNetworkAnalysis(container: HTMLElement): void {
        container.innerHTML = '<h3>🌐 Knowledge Network Analysis</h3>';
        
        // Create three columns for different centrality types
        const networkGrid = container.createEl('div', { cls: 'network-grid' });
        
        this.createNetworkColumn(networkGrid, 'bridges', '🌉 Knowledge Bridges', 
            'Notes that connect different knowledge domains', this.data!.knowledgeNetwork.bridges);
        
        this.createNetworkColumn(networkGrid, 'foundations', '🏗️ Knowledge Foundations', 
            'Notes with efficient access to the entire network', this.data!.knowledgeNetwork.foundations);
        
        this.createNetworkColumn(networkGrid, 'authorities', '👑 Knowledge Authorities', 
            'Notes that are referenced by other important notes', this.data!.knowledgeNetwork.authorities);
    }

    private createNetworkColumn(container: HTMLElement, type: string, title: string, description: string, nodes: NetworkNode[]): void {
        const column = container.createEl('div', { cls: `network-column ${type}-column` });
        
        column.innerHTML = `
            <h4>${title}</h4>
            <p class="column-description">${description}</p>
            <div class="network-nodes">
                ${nodes.slice(0, 5).map(node => `
                    <div class="network-node">
                        <div class="node-title">${node.title}</div>
                        <div class="node-score">Score: ${node.score.toFixed(3)}</div>
                        ${node.connections ? `<div class="node-connections">${node.connections.length} connections</div>` : ''}
                        ${node.reach ? `<div class="node-reach">Reach: ${node.reach}</div>` : ''}
                        ${node.influence ? `<div class="node-influence">Influence: ${node.influence}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }
} 