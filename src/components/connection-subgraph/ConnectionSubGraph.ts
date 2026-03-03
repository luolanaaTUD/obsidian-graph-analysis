import { App, Notice, TFile, setIcon } from 'obsidian';
import * as d3 from 'd3';
import type { ActionsAnalysisData } from '../../ai/MasterAnalysisManager';
import { ConnectionSuggestion, KnowledgeActionsManager } from '../../ai/visualization/KnowledgeActionsManager';
import { NoteResolver } from '../../utils/NoteResolver';

interface SubGraphNode extends d3.SimulationNodeDatum {
    id: string;
    title: string;
    path: string;
    degree: number;  // Number of suggestions this node participates in
    removed: boolean;
}

interface SubGraphLink extends d3.SimulationLinkDatum<SubGraphNode> {
    source: string | SubGraphNode;
    target: string | SubGraphNode;
    reason: string;
    confidence: number;
    removed: boolean;
}

interface ConnectionSubGraphOptions {
    width?: number;
    height?: number;
    modal?: { close(): void };
    connectionsAddedAt?: string;
    actionsAnalysisData?: ActionsAnalysisData;
    saveCacheFn?: (data: ActionsAnalysisData) => Promise<void>;
}

/**
 * A lightweight D3 force-directed sub-graph that displays only AI-suggested
 * connection nodes and links. Users can delete nodes/links and then commit
 * the remaining suggestions to their vault via the "Add to Main Graph" button.
 */
export class ConnectionSubGraph {
    private app: App;
    private container: HTMLElement;
    private connections: ConnectionSuggestion[];
    private options: ConnectionSubGraphOptions;

    // D3 state
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private svgGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private simulation!: d3.Simulation<SubGraphNode, SubGraphLink>;
    private nodes: SubGraphNode[] = [];
    private links: SubGraphLink[] = [];
    private nodesSelection!: d3.Selection<SVGGElement, SubGraphNode, d3.BaseType, unknown>;
    private linksSelection!: d3.Selection<SVGLineElement, SubGraphLink, d3.BaseType, unknown>;

    // Tooltip
    private tooltip!: HTMLElement;

    // Dimensions
    private width: number;
    private height: number;
    private markerId: string = '';

    constructor(
        app: App,
        container: HTMLElement,
        connections: ConnectionSuggestion[],
        options: ConnectionSubGraphOptions = {}
    ) {
        this.app = app;
        this.container = container;
        this.connections = connections;
        this.options = options;
        this.width = options.width || 700;
        this.height = options.height || 450;
    }

    /**
     * Build the node/link data from ConnectionSuggestion[], then render
     * the D3 force graph and the "Add to Main Graph" button.
     */
    public render(): void {
        this.buildGraphData();
        this.createSVG();
        this.createTooltip();
        this.initSimulation();
        this.drawLinks();
        this.drawNodes();
        this.createLegend();
        this.createAddToGraphButton();
    }

    // ─────────────────── Data Construction ───────────────────

    private buildGraphData(): void {
        const nodeMap = new Map<string, SubGraphNode>();

        for (const conn of this.connections) {
            if (!nodeMap.has(conn.sourceId)) {
                nodeMap.set(conn.sourceId, {
                    id: conn.sourceId,
                    title: NoteResolver.resolveToTitle(this.app, conn.sourceId),
                    path: conn.sourceId,
                    degree: 0,
                    removed: false
                });
            }
            if (!nodeMap.has(conn.targetId)) {
                nodeMap.set(conn.targetId, {
                    id: conn.targetId,
                    title: NoteResolver.resolveToTitle(this.app, conn.targetId),
                    path: conn.targetId,
                    degree: 0,
                    removed: false
                });
            }
            nodeMap.get(conn.sourceId)!.degree++;
            nodeMap.get(conn.targetId)!.degree++;
        }

        this.nodes = Array.from(nodeMap.values());
        this.links = this.connections.map(c => ({
            source: c.sourceId,
            target: c.targetId,
            reason: c.reason,
            confidence: c.confidence,
            removed: false
        }));
    }

    // ─────────────────── SVG Setup ───────────────────

    private createSVG(): void {
        // Wrapper for sizing
        const svgWrapper = this.container.createEl('div', { cls: 'subgraph-svg-wrapper' });
        svgWrapper.style.width = '100%';
        svgWrapper.style.height = `${this.height}px`;
        svgWrapper.style.position = 'relative';

        this.svg = d3.select(svgWrapper)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', [
                -this.width / 2,
                -this.height / 2,
                this.width,
                this.height
            ].join(' '))
            .attr('class', 'connection-subgraph-svg');

        // Arrow marker for directional links (source -> target)
        this.markerId = `subgraph-arrow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.svg.append('defs')
            .append('marker')
            .attr('id', this.markerId)
            .attr('markerUnits', 'userSpaceOnUse')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 9)
            .attr('refY', 0)
            .attr('orient', 'auto')
            .attr('viewBox', '0 -4 10 8')
            .append('path')
            .attr('d', 'M0,-4 L10,0 L0,4 Z')
            .attr('fill', 'var(--text-accent)');

        this.svgGroup = this.svg.append('g');

        // Zoom and pan
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.3, 4])
            .on('zoom', (event) => {
                this.svgGroup.attr('transform', event.transform);
            });
        this.svg.call(zoom);
    }

    private createTooltip(): void {
        this.tooltip = this.container.createEl('div', { cls: 'subgraph-tooltip' });
        this.tooltip.style.display = 'none';
    }

    // ─────────────────── Simulation ───────────────────

    private initSimulation(): void {
        this.simulation = d3.forceSimulation<SubGraphNode>(this.nodes)
            .force('link', d3.forceLink<SubGraphNode, SubGraphLink>(this.links)
                .id(d => d.id)
                .distance(100))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('x', d3.forceX().strength(0.1))
            .force('y', d3.forceY().strength(0.1))
            .force('collision', d3.forceCollide<SubGraphNode>()
                .radius(d => this.getNodeRadius(d) + 10)
                .strength(0.8))
            .on('tick', () => this.tick());
    }

    private getNodeRadius(node: SubGraphNode): number {
        // Size by degree within the sub-graph: min 10, max 15 (reduced range)
        return Math.min(15, Math.max(10, 9 + node.degree * 1.5));
    }

    private tick(): void {
        this.linksSelection
            .attr('x1', d => this.linkStartX(d))
            .attr('y1', d => this.linkStartY(d))
            .attr('x2', d => this.linkEndX(d))
            .attr('y2', d => this.linkEndY(d));

        this.nodesSelection
            .attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    }

    /** Shorten link to node edge so arrow sits adjacent to circle, not hidden behind it */
    private linkStartX(d: SubGraphLink): number {
        const s = d.source as SubGraphNode;
        const t = d.target as SubGraphNode;
        const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        return sx + nx * this.getNodeRadius(s);
    }
    private linkStartY(d: SubGraphLink): number {
        const s = d.source as SubGraphNode;
        const t = d.target as SubGraphNode;
        const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        return sy + ny * this.getNodeRadius(s);
    }
    private linkEndX(d: SubGraphLink): number {
        const s = d.source as SubGraphNode;
        const t = d.target as SubGraphNode;
        const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        return tx - nx * this.getNodeRadius(t);
    }
    private linkEndY(d: SubGraphLink): number {
        const s = d.source as SubGraphNode;
        const t = d.target as SubGraphNode;
        const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const ny = dy / len;
        return ty - ny * this.getNodeRadius(t);
    }

    // ─────────────────── Drawing ───────────────────

    private drawLinks(): void {
        const linksGroup = this.svgGroup.append('g').attr('class', 'subgraph-links');

        this.linksSelection = linksGroup.selectAll<SVGLineElement, SubGraphLink>('line')
            .data(this.links.filter(l => !l.removed))
            .join('line')
            .attr('class', 'suggested-link')
            .attr('stroke', 'var(--text-accent)')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', d => 0.3 + d.confidence * 0.5)
            .attr('stroke-dasharray', '6,3')
            .attr('marker-end', 'url(#' + this.markerId + ')')
            .on('mouseover', (event, d) => {
                this.showLinkTooltip(event, d);
                d3.select(event.currentTarget)
                    .attr('stroke-opacity', 1);
            })
            .on('mouseout', (event, d) => {
                this.hideTooltip();
                d3.select(event.currentTarget)
                    .attr('stroke-opacity', 0.3 + d.confidence * 0.5);
            });
    }

    private drawNodes(): void {
        const nodesGroup = this.svgGroup.append('g').attr('class', 'subgraph-nodes');

        const nodeGroups = nodesGroup.selectAll<SVGGElement, SubGraphNode>('g')
            .data(this.nodes.filter(n => !n.removed))
            .join('g')
            .attr('class', 'subgraph-node-group')
            .style('cursor', 'pointer')
            .call(d3.drag<SVGGElement, SubGraphNode>()
                .on('start', (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                })
            );

        // Node circles (no outline)
        nodeGroups.append('circle')
            .attr('r', d => this.getNodeRadius(d))
            .attr('fill', 'var(--interactive-accent)')
            .attr('stroke', 'none')
            .on('mouseover', (event, d) => {
                this.showTooltip(event, d.title);
                d3.select(event.currentTarget)
                    .transition().duration(150)
                    .attr('r', this.getNodeRadius(d) + 3);
            })
            .on('mouseout', (event, d) => {
                this.hideTooltip();
                d3.select(event.currentTarget)
                    .transition().duration(150)
                    .attr('r', this.getNodeRadius(d));
            });

        // Node labels
        nodeGroups.append('text')
            .attr('class', 'subgraph-node-label')
            .attr('dy', d => this.getNodeRadius(d) + 18)
            .attr('text-anchor', 'middle')
            .text(d => d.title.length > 20 ? d.title.slice(0, 18) + '...' : d.title)
            .attr('fill', 'var(--text-muted)')
            .attr('font-size', '11px')
            .style('pointer-events', 'none');

        // Delete button (x) - appears on hover
        const deleteBtn = nodeGroups.append('g')
            .attr('class', 'subgraph-delete-btn')
            .attr('transform', d => `translate(${this.getNodeRadius(d) + 2}, ${-this.getNodeRadius(d) - 2})`)
            .style('opacity', 0)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                this.removeNode(d);
            });

        deleteBtn.append('circle')
            .attr('r', 7)
            .attr('fill', 'var(--background-modifier-error)')
            .attr('stroke', 'var(--background-primary)')
            .attr('stroke-width', 1);

        deleteBtn.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', '10px')
            .attr('fill', 'var(--text-on-accent)')
            .text('×');

        // Show/hide delete button on node group hover
        nodeGroups
            .on('mouseenter', function () {
                d3.select(this).select('.subgraph-delete-btn')
                    .transition().duration(150)
                    .style('opacity', 1);
            })
            .on('mouseleave', function () {
                d3.select(this).select('.subgraph-delete-btn')
                    .transition().duration(150)
                    .style('opacity', 0);
            });

        // Left-click on node circle opens note in new tab
        nodeGroups.select('circle')
            .on('click', (event, d) => {
                // Only open on plain click (not after drag)
                if (event.defaultPrevented) return;
                this.openNoteInNewTab(d.path);
            });

        this.nodesSelection = nodeGroups as any;
    }

    // ─────────────────── Legend ───────────────────

    private createLegend(): void {
        const legend = this.container.createEl('div', { cls: 'subgraph-legend' });

        const items = [
            { label: 'Suggested link (hover for details)', cls: 'legend-link' },
            { label: 'Note node (click to open, hover × to remove)', cls: 'legend-node' }
        ];

        for (const item of items) {
            const row = legend.createEl('div', { cls: 'subgraph-legend-item' });
            const dot = row.createEl('span', { cls: `legend-dot ${item.cls}` });
            row.createEl('span', { text: item.label, cls: 'legend-text' });
        }
    }

    // ─────────────────── Add to Graph Button ───────────────────

    private createAddToGraphButton(): void {
        const buttonSection = this.container.createEl('div', { cls: 'subgraph-button-section' });

        // Counter showing remaining connections
        const counter = buttonSection.createEl('div', { cls: 'subgraph-counter' });
        this.updateCounter(counter);

        const alreadyAdded = !!this.options.connectionsAddedAt;
        const button = buttonSection.createEl('button', {
            cls: alreadyAdded ? 'mod-cta subgraph-add-btn subgraph-btn-done' : 'mod-cta subgraph-add-btn',
            text: alreadyAdded ? 'Connections Added' : 'Add to Main Graph'
        });
        if (alreadyAdded) {
            button.disabled = true;
        } else {
            const iconSpan = button.createEl('span', { cls: 'subgraph-btn-icon' });
            setIcon(iconSpan, 'plus-circle');
        }

        button.addEventListener('click', async () => {
            const remaining = this.getRemainingConnections();
            if (remaining.length === 0) {
                new Notice('No connections remaining to add.');
                return;
            }

            button.disabled = true;
            button.textContent = 'Writing links...';

            try {
                const result = await KnowledgeActionsManager.writeConnectionsToNotes(
                    this.app,
                    remaining
                );

                if (result.written > 0) {
                    new Notice(`Successfully added ${result.written} connection${result.written > 1 ? 's' : ''} to your notes.`);
                }
                if (result.failed > 0) {
                    new Notice(`Failed to write ${result.failed} connection${result.failed > 1 ? 's' : ''}.`);
                }

                // Disable button and persist status to cache
                button.textContent = 'Connections Added';
                button.disabled = true;
                button.classList.add('subgraph-btn-done');

                const { actionsAnalysisData, saveCacheFn } = this.options;
                if (actionsAnalysisData && saveCacheFn) {
                    actionsAnalysisData.connectionsAddedAt = new Date().toISOString();
                    await saveCacheFn(actionsAnalysisData);
                }
            } catch (error) {
                // console.error('Failed to write connections:', error);
                new Notice('Failed to write connections. Check console for details.');
                button.disabled = false;
                button.textContent = 'Add to Main Graph';
            }
        });
    }

    // ─────────────────── Editing: Remove Node / Link ───────────────────

    private removeNode(node: SubGraphNode): void {
        node.removed = true;

        // Collect neighbors (other ends of connections to this node)
        const neighborsToCheck = new Set<string>();
        for (const link of this.links) {
            const sourceId = typeof link.source === 'string' ? link.source : (link.source as SubGraphNode).id;
            const targetId = typeof link.target === 'string' ? link.target : (link.target as SubGraphNode).id;
            if (sourceId === node.id || targetId === node.id) {
                link.removed = true;
                const otherId = sourceId === node.id ? targetId : sourceId;
                neighborsToCheck.add(otherId);
            }
        }

        // If a neighbor is only connected to this node (no other remaining links), remove it too
        for (const neighborId of neighborsToCheck) {
            const hasOtherLinks = this.links.some(l => {
                if (l.removed) return false;
                const sourceId = typeof l.source === 'string' ? l.source : (l.source as SubGraphNode).id;
                const targetId = typeof l.target === 'string' ? l.target : (l.target as SubGraphNode).id;
                return (sourceId === neighborId || targetId === neighborId);
            });
            if (!hasOtherLinks) {
                const neighbor = this.nodes.find(n => n.id === neighborId);
                if (neighbor) neighbor.removed = true;
            }
        }

        this.refreshGraph();
    }

    private removeLink(link: SubGraphLink): void {
        link.removed = true;

        // If a node has no remaining links, also remove it
        for (const node of this.nodes) {
            if (node.removed) continue;
            const hasLinks = this.links.some(l => {
                if (l.removed) return false;
                const sourceId = typeof l.source === 'string' ? l.source : (l.source as SubGraphNode).id;
                const targetId = typeof l.target === 'string' ? l.target : (l.target as SubGraphNode).id;
                return sourceId === node.id || targetId === node.id;
            });
            if (!hasLinks) {
                node.removed = true;
            }
        }

        this.refreshGraph();
    }

    private refreshGraph(): void {
        const activeNodes = this.nodes.filter(n => !n.removed);
        const activeLinks = this.links.filter(l => !l.removed);

        // Recalculate degree for active nodes
        for (const n of activeNodes) {
            n.degree = 0;
        }
        for (const l of activeLinks) {
            const sourceId = typeof l.source === 'string' ? l.source : (l.source as SubGraphNode).id;
            const targetId = typeof l.target === 'string' ? l.target : (l.target as SubGraphNode).id;
            const sn = activeNodes.find(n => n.id === sourceId);
            const tn = activeNodes.find(n => n.id === targetId);
            if (sn) sn.degree++;
            if (tn) tn.degree++;
        }

        // Update simulation data
        this.simulation.nodes(activeNodes);
        (this.simulation.force('link') as d3.ForceLink<SubGraphNode, SubGraphLink>)
            .links(activeLinks);

        // Rebind links
        const linksGroup = this.svgGroup.select('.subgraph-links');
        this.linksSelection = linksGroup.selectAll<SVGLineElement, SubGraphLink>('line')
            .data(activeLinks, (d: any) => {
                const sid = typeof d.source === 'string' ? d.source : d.source.id;
                const tid = typeof d.target === 'string' ? d.target : d.target.id;
                return `${sid}-${tid}`;
            })
            .join(
                enter => enter.append('line')
                    .attr('class', 'suggested-link')
                    .attr('stroke', 'var(--text-accent)')
                    .attr('stroke-width', 2)
                    .attr('stroke-opacity', d => 0.3 + d.confidence * 0.5)
                    .attr('stroke-dasharray', '6,3')
                    .attr('marker-end', 'url(#' + this.markerId + ')')
                    .on('mouseover', (event, d) => {
                        this.showLinkTooltip(event, d);
                        d3.select(event.currentTarget)
                            .attr('stroke-opacity', 1);
                    })
                    .on('mouseout', (event, d) => {
                        this.hideTooltip();
                        d3.select(event.currentTarget)
                            .attr('stroke-opacity', 0.3 + d.confidence * 0.5);
                    }),
                update => update,
                exit => exit.remove()
            );

        // Rebind nodes
        const nodesGroup = this.svgGroup.select('.subgraph-nodes');
        const existingNodeGroups = nodesGroup.selectAll<SVGGElement, SubGraphNode>('g.subgraph-node-group')
            .data(activeNodes, (d: any) => d.id);

        existingNodeGroups.exit().remove();

        // Update remaining node circles sizes
        existingNodeGroups.select('circle')
            .attr('r', d => this.getNodeRadius(d));

        this.nodesSelection = existingNodeGroups as any;

        // Restart simulation
        this.simulation.alpha(0.5).restart();

        // Update counter
        const counter = this.container.querySelector('.subgraph-counter');
        if (counter) this.updateCounter(counter as HTMLElement);
    }

    // ─────────────────── Helpers ───────────────────

    private resolveNodeTitle(nodeRef: string | SubGraphNode): string {
        if (typeof nodeRef === 'string') {
            const node = this.nodes.find(n => n.id === nodeRef);
            return node?.title || nodeRef;
        }
        return nodeRef.title;
    }

    /**
     * Show structured tooltip for a link: Direction, Rationale, Confidence
     */
    private showLinkTooltip(event: MouseEvent, link: SubGraphLink): void {
        const direction = `${this.resolveNodeTitle(link.source)} → ${this.resolveNodeTitle(link.target)}`;
        const rationale = link.reason;
        const confidence = `${Math.round(link.confidence * 100)}%`;
        const text = `Direction:\n${direction}\nRationale:\n${rationale}\nConfidence:\n${confidence}`;
        this.showTooltip(event, text);
    }

    private showTooltip(event: MouseEvent, text: string): void {
        this.tooltip.style.display = 'block';
        this.tooltip.textContent = '';
        // Split by newlines for multi-line tooltip
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (i > 0) this.tooltip.createEl('br');
            this.tooltip.appendText(lines[i]);
        }

        const rect = this.container.getBoundingClientRect();
        this.tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        this.tooltip.style.top = `${event.clientY - rect.top - 10}px`;
    }

    private hideTooltip(): void {
        this.tooltip.style.display = 'none';
    }

    private getRemainingConnections(): ConnectionSuggestion[] {
        return this.links
            .filter(l => !l.removed)
            .map(l => {
                const sourceId = typeof l.source === 'string' ? l.source : (l.source as SubGraphNode).id;
                const targetId = typeof l.target === 'string' ? l.target : (l.target as SubGraphNode).id;
                return {
                    sourceId,
                    targetId,
                    reason: l.reason,
                    confidence: l.confidence
                };
            });
    }

    private updateCounter(counter: HTMLElement): void {
        const remaining = this.links.filter(l => !l.removed).length;
        const total = this.connections.length;
        counter.textContent = `${remaining} of ${total} connections remaining`;
    }

    private async openNoteInNewTab(path: string): Promise<void> {
        if (this.options.modal) {
            this.options.modal.close();
        }
        await this.app.workspace.openLinkText(path, '', 'tab');
    }

    /**
     * Clean up the simulation when the component is destroyed
     */
    public destroy(): void {
        if (this.simulation) {
            this.simulation.stop();
        }
    }
}
