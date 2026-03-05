import { App, setIcon } from 'obsidian';
import { GraphAnalysisSettings } from '../../types/types';
import type { VaultAnalysisResult } from '../MasterAnalysisManager';
import { NoteResolver } from '../../utils/NoteResolver';

// Interfaces for Knowledge Actions data
export interface MaintenanceAction {
    noteId: string;
    title: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    action: string;
}

/**
 * A review candidate combines rule-based urgency scoring with AI insights.
 * Used to populate the review cards grid on the Recommended Actions page.
 */
export interface ReviewCandidate {
    noteId: string;
    title: string;
    path: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    action: string;
    lastModified: string;           // ISO date string
    urgencyScore: number;           // Composite score (0-1)
    centralityRole: 'hub' | 'bridge' | 'authority' | 'normal';
    centralityScore: number;        // Max centrality value for display
    fromAI: boolean;                // Whether this was also identified by AI
}

export interface ConnectionSuggestion {
    sourceId: string;
    targetId: string;
    reason: string;
    confidence: number;
}

export interface LearningPath {
    title: string;
    description: string;
    noteIds: string[];
    rationale: string;
}

export interface OrganizationSuggestion {
    type: 'tag' | 'folder' | 'structure';
    suggestion: string;
    affectedNotes: string[];
}

export interface KnowledgeActionsData {
    maintenance: MaintenanceAction[];
    connections: ConnectionSuggestion[];
    learningPaths: LearningPath[];
    organization: OrganizationSuggestion[];
}

export class KnowledgeActionsManager {
    private app: App;
    private container!: HTMLElement;
    private settings: GraphAnalysisSettings;
    private data: KnowledgeActionsData | null = null;
    private createEmptyStateFn: (container: HTMLElement, message: string) => void;

    constructor(app: App, settings: GraphAnalysisSettings, createEmptyStateFn?: (container: HTMLElement, message: string) => void) {
        this.app = app;
        this.settings = settings;
        this.createEmptyStateFn = createEmptyStateFn || this.defaultCreateEmptyState.bind(this);
    }

    /**
     * Default empty state implementation for when no callback is provided
     */
    private defaultCreateEmptyState(container: HTMLElement, message: string): void {
        const emptyState = document.createElement('div');
        emptyState.className = 'network-empty-state';
        container.appendChild(emptyState);

        const iconEl = document.createElement('div');
        iconEl.className = 'network-empty-state-icon';
        emptyState.appendChild(iconEl);
        setIcon(iconEl, 'target');

        const textEl = document.createElement('p');
        textEl.className = 'network-empty-state-text';
        textEl.textContent = message;
        emptyState.appendChild(textEl);
    }

    public async loadCachedActionsData(): Promise<KnowledgeActionsData | null> {
        try {
            // Use the tab-specific analysis file instead of master-analysis.json
            const filePath = `${this.app.vault.configDir}/plugins/knowledge-graph-analysis/responses/actions-analysis.json`;
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content) as unknown;

            if (data && typeof data === 'object' && 'recommendedActions' in data) {
                const actions = (data as { recommendedActions: KnowledgeActionsData }).recommendedActions;
                if (actions && typeof actions === 'object') {
                    this.data = actions;
                    return this.data;
                }
            }
            return null;
        } catch {
            // console.warn('No cached knowledge actions data found');
            return null;
        }
    }

    public async renderActionsAnalysis(container: HTMLElement): Promise<void> {
        this.container = container;
        this.container.empty();

        // Load data if not already loaded
        if (!this.data) {
            await this.loadCachedActionsData();
        }

        if (!this.data) {
            this.createEmptyStateFn(this.container, 'Generate AI analysis to get personalized action recommendations for your vault.');
            return;
        }

        // Create main layout with action categories
        this.createActionsLayout();
    }

    private renderPlaceholder(): void {
        const placeholder = this.container.createEl('div', { cls: 'actions-placeholder' });
        const content = placeholder.createEl('div', { cls: 'placeholder-content' });
        content.createEl('h3', { text: '🎯 recommended actions' });
        content.createEl('p', { text: 'Generate vault analysis to see personalized action recommendations.' });
        const features = content.createEl('div', { cls: 'placeholder-features' });
        [{ icon: '🔧', text: 'Knowledge Maintenance' }, { icon: '🔗', text: 'Connection Opportunities' }, { icon: '🗺️', text: 'Learning Paths' }, { icon: '📁', text: 'Organization Tips' }].forEach(({ icon, text }) => {
            const item = features.createEl('div', { cls: 'feature-item' });
            item.createEl('span', { cls: 'feature-icon', text: icon });
            item.createEl('span', { text });
        });
    }

    private createActionsLayout(): void {
        // Create summary dashboard
        this.createActionsSummary(this.container);

        // Create action grid
        const actionsGrid = this.container.createEl('div', { cls: 'actions-grid' });
        
        // Four quadrants for different action types
        this.createMaintenanceSection(actionsGrid);
        this.createConnectionsSection(actionsGrid);
        this.createLearningPathsSection(actionsGrid);
        this.createOrganizationSection(actionsGrid);
    }

    private createActionsSummary(container: HTMLElement): void {
        const summaryContainer = container.createEl('div', { cls: 'actions-summary' });
        summaryContainer.createEl('h3', { text: '📊 action summary' });
        const stats = summaryContainer.createEl('div', { cls: 'summary-stats' });
        const totalActions = this.getTotalActionCount();
        const priorityBreakdown = this.getPriorityBreakdown();
        [
            { num: totalActions, cls: '' },
            { num: priorityBreakdown.high, cls: 'priority-high' },
            { num: priorityBreakdown.medium, cls: 'priority-medium' },
            { num: priorityBreakdown.low, cls: 'priority-low' }
        ].forEach(({ num, cls }, i) => {
            const stat = stats.createEl('div', { cls: `summary-stat ${cls}`.trim() });
            stat.createEl('span', { cls: 'stat-number', text: String(num) });
            stat.createEl('span', { cls: 'stat-label', text: ['Total Actions', 'High Priority', 'Medium Priority', 'Low Priority'][i] });
        });
    }

    private createMaintenanceSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section maintenance-section' });
        section.createEl('h4', { text: '🔧 knowledge maintenance' });
        section.createEl('p', { cls: 'section-description', text: 'Notes that need review, updates, or improvements' });
        const list = section.createEl('div', { cls: 'actions-list' });
        this.data!.maintenance.slice(0, 10).forEach(action => {
            const item = list.createEl('div', { cls: `action-item priority-${action.priority}` });
            item.dataset.noteId = action.noteId;
            const header = item.createEl('div', { cls: 'action-header' });
            header.createEl('span', { cls: 'action-title', text: action.title });
            header.createEl('span', { cls: `action-priority priority-${action.priority}`, text: action.priority.toUpperCase() });
            item.createEl('div', { cls: 'action-reason', text: action.reason });
            item.createEl('div', { cls: 'action-content', text: action.action });
            const buttons = item.createEl('div', { cls: 'action-buttons' });
            buttons.createEl('button', { cls: 'action-btn primary', text: '📝 open note' });
            buttons.createEl('button', { cls: 'action-btn secondary', text: '✓ mark done' });
        });
        if (this.data!.maintenance.length > 10) {
            const showMore = section.createEl('div', { cls: 'show-more' });
            showMore.createEl('button', { cls: 'show-more-btn', text: `Show ${this.data!.maintenance.length - 10} More Actions` });
        }
        this.attachMaintenanceHandlers(section);
    }

    private createConnectionsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section connections-section' });
        section.createEl('h4', { text: '🔗 connection opportunities' });
        section.createEl('p', { cls: 'section-description', text: 'Suggested links between your notes' });
        const list = section.createEl('div', { cls: 'connections-list' });
        this.data!.connections.slice(0, 8).forEach(connection => {
            const item = list.createEl('div', { cls: 'connection-item' });
            item.dataset.source = connection.sourceId;
            item.dataset.target = connection.targetId;
            const header = item.createEl('div', { cls: 'connection-header' });
            const flow = header.createEl('div', { cls: 'connection-flow' });
            flow.createEl('span', { cls: 'source-note', text: NoteResolver.resolveToTitle(this.app, connection.sourceId) });
            flow.createEl('span', { cls: 'connection-arrow', text: '→' });
            flow.createEl('span', { cls: 'target-note', text: NoteResolver.resolveToTitle(this.app, connection.targetId) });
            header.createEl('span', { cls: 'confidence-score', text: `${Math.round(connection.confidence * 100)}% confidence` });
            item.createEl('div', { cls: 'connection-reason', text: connection.reason });
            const buttons = item.createEl('div', { cls: 'connection-buttons' });
            buttons.createEl('button', { cls: 'action-btn primary', text: '🔗 create link' });
            buttons.createEl('button', { cls: 'action-btn secondary', text: '👁️ preview' });
            buttons.createEl('button', { cls: 'action-btn tertiary', text: '✗ dismiss' });
        });
        this.attachConnectionHandlers(section);
    }

    private createLearningPathsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section learning-paths-section' });
        section.createEl('h4', { text: '🗺️ learning paths' });
        section.createEl('p', { cls: 'section-description', text: 'Recommended sequences for learning and exploration' });
        const list = section.createEl('div', { cls: 'learning-paths-list' });
        this.data!.learningPaths.forEach(path => {
            const item = list.createEl('div', { cls: 'learning-path-item' });
            const header = item.createEl('div', { cls: 'path-header' });
            header.createEl('h5', { cls: 'path-title', text: path.title });
            header.createEl('span', { cls: 'path-length', text: `${path.noteIds.length} notes` });
            item.createEl('div', { cls: 'path-description', text: path.description });
            item.createEl('div', { cls: 'path-rationale', text: path.rationale });
            const sequence = item.createEl('div', { cls: 'path-sequence' });
            path.noteIds.forEach((noteId, index) => {
                const step = sequence.createEl('div', { cls: 'path-step' });
                step.createEl('span', { cls: 'step-number', text: String(index + 1) });
                step.createEl('span', { cls: 'step-note', text: NoteResolver.resolveToTitle(this.app, noteId) });
            });
            const buttons = item.createEl('div', { cls: 'path-buttons' });
            buttons.createEl('button', { cls: 'action-btn primary', text: '🚀 start path' });
            buttons.createEl('button', { cls: 'action-btn secondary', text: '📌 bookmark' });
        });
        this.attachLearningPathHandlers(section);
    }

    private createOrganizationSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section organization-section' });
        const groupedSuggestions = this.groupOrganizationSuggestions();
        section.createEl('h4', { text: '📁 organization suggestions' });
        section.createEl('p', { cls: 'section-description', text: 'Improvements for your knowledge structure' });
        const tabs = section.createEl('div', { cls: 'organization-tabs' });
        const headers = tabs.createEl('div', { cls: 'tab-headers' });
        ['tag', 'folder', 'structure'].forEach((type, i) => {
            const labels: Record<string, string> = { tag: '🏷️ Tags', folder: '📁 Folders', structure: '🏗️ Structure' };
            const btn = headers.createEl('button', { cls: `org-tab-header ${i === 0 ? 'active' : ''}`, text: labels[type] });
            btn.dataset.type = type;
        });
        const tabContent = tabs.createEl('div', { cls: 'tab-content' });
        this.renderOrganizationTabInto(tabContent, 'tag', groupedSuggestions.tag);
        this.attachOrganizationHandlers(section, groupedSuggestions);
    }

    private renderOrganizationTabInto(container: HTMLElement, type: string, suggestions: OrganizationSuggestion[]): void {
        container.empty();
        const icons: Record<string, string> = { tag: '🏷️', folder: '📁', structure: '🏗️' };
        const suggestionsEl = container.createEl('div', { cls: 'organization-suggestions' });
        suggestionsEl.dataset.type = type;
        suggestions.forEach(suggestion => {
            const item = suggestionsEl.createEl('div', { cls: 'organization-item' });
            const header = item.createEl('div', { cls: 'suggestion-header' });
            header.createEl('span', { cls: 'suggestion-icon', text: icons[type] || '📁' });
            header.createEl('span', { cls: 'suggestion-text', text: suggestion.suggestion });
            const affected = item.createEl('div', { cls: 'affected-notes' });
            affected.createEl('span', { cls: 'affected-count', text: `${suggestion.affectedNotes.length} notes affected` });
            const list = affected.createEl('div', { cls: 'affected-list' });
            suggestion.affectedNotes.slice(0, 3).forEach(noteId => {
                list.createEl('span', { cls: 'affected-note', text: NoteResolver.resolveToTitle(this.app, noteId) });
            });
            if (suggestion.affectedNotes.length > 3) {
                list.createEl('span', { cls: 'more-notes', text: `+${suggestion.affectedNotes.length - 3} more` });
            }
            const buttons = item.createEl('div', { cls: 'suggestion-buttons' });
            buttons.createEl('button', { cls: 'action-btn primary', text: '✓ apply' });
            buttons.createEl('button', { cls: 'action-btn secondary', text: '👁️ preview' });
            buttons.createEl('button', { cls: 'action-btn tertiary', text: '✗ dismiss' });
        });
    }

    // Helper methods
    private getTotalActionCount(): number {
        if (!this.data) return 0;
        return this.data.maintenance.length + 
               this.data.connections.length + 
               this.data.learningPaths.length + 
               this.data.organization.length;
    }

    private getPriorityBreakdown(): { high: number; medium: number; low: number } {
        if (!this.data) return { high: 0, medium: 0, low: 0 };
        
        const counts = { high: 0, medium: 0, low: 0 };
        this.data.maintenance.forEach(action => {
            counts[action.priority]++;
        });
        return counts;
    }

    private groupOrganizationSuggestions(): Record<string, OrganizationSuggestion[]> {
        const grouped: Record<string, OrganizationSuggestion[]> = {
            tag: [],
            folder: [],
            structure: []
        };

        this.data!.organization.forEach(suggestion => {
            grouped[suggestion.type].push(suggestion);
        });

        return grouped;
    }

    // Event handlers
    private attachMaintenanceHandlers(section: HTMLElement): void {
        // Attach event listeners for maintenance actions
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const actionItem = target.closest('.action-item') as HTMLElement;
                const noteId = actionItem.dataset.noteId;
                
                if (target.textContent?.includes('Open Note')) {
                    void this.openNote(noteId || '');
                } else if (target.textContent?.includes('Mark Done')) {
                    this.dismissAction(actionItem);
                }
            }
        });
    }

    private attachConnectionHandlers(section: HTMLElement): void {
        // Attach event listeners for connection suggestions
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const connectionItem = target.closest('.connection-item') as HTMLElement;
                
                if (target.textContent?.includes('Create Link')) {
                    this.createConnection(connectionItem);
                } else if (target.textContent?.includes('Preview')) {
                    this.previewConnection(connectionItem);
                } else if (target.textContent?.includes('Dismiss')) {
                    this.dismissConnection(connectionItem);
                }
            }
        });
    }

    private attachLearningPathHandlers(section: HTMLElement): void {
        // Attach event listeners for learning paths
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('action-btn')) {
                const pathItem = target.closest('.learning-path-item') as HTMLElement;
                
                if (target.textContent?.includes('Start Path')) {
                    this.startLearningPath(pathItem);
                } else if (target.textContent?.includes('Bookmark')) {
                    this.bookmarkPath(pathItem);
                }
            }
        });
    }

    private attachOrganizationHandlers(section: HTMLElement, groupedSuggestions: Record<string, OrganizationSuggestion[]>): void {
        // Tab switching
        section.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('org-tab-header')) {
                const type = target.dataset.type;
                if (type) {
                    // Update active tab
                    section.querySelectorAll('.org-tab-header').forEach(tab => tab.removeClass('active'));
                    target.addClass('active');
                    
                    // Update content
                    const tabContent = section.querySelector('.tab-content') as HTMLElement;
                    if (tabContent) {
                        this.renderOrganizationTabInto(tabContent, type, groupedSuggestions[type]);
                    }
                }
            }
        });
    }

    // Action implementations
    private async openNote(noteId: string): Promise<void> {
        const file = NoteResolver.resolveToFile(this.app, noteId);
        if (file) {
            await this.app.workspace.openLinkText(file.path, '', false);
        }
    }

    private dismissAction(actionItem: HTMLElement): void {
        actionItem.addClass('actions-item-dismissed');
        // Could save dismissed actions to prevent them from reappearing
    }

    private createConnection(connectionItem: HTMLElement): void {
        // Implementation for creating links between notes
        // console.log('Creating connection:', connectionItem.dataset);
    }

    private previewConnection(connectionItem: HTMLElement): void {
        // Implementation for previewing the connection
        // console.log('Previewing connection:', connectionItem.dataset);
    }

    private dismissConnection(connectionItem: HTMLElement): void {
        connectionItem.addClass('actions-item-dismissed');
    }

    private startLearningPath(pathItem: HTMLElement): void {
        // Implementation for starting a learning path
        // console.log('Starting learning path:', pathItem);
    }

    private bookmarkPath(pathItem: HTMLElement): void {
        // Implementation for bookmarking a path
        // console.log('Bookmarking path:', pathItem);
    }

    public updateSettings(settings: GraphAnalysisSettings): void {
        this.settings = settings;
    }

    /**
     * Compute hybrid urgency-scored review candidates by combining:
     * - Rule-based signals: centrality (hub/bridge/authority importance) + staleness (time since modified)
     * - AI signals: maintenance priority, reason, and action from AI analysis
     * 
     * Returns up to `limit` candidates sorted by descending urgency score.
     */
    public static computeReviewCandidates(
        maintenance: MaintenanceAction[],
        analysisResults: VaultAnalysisResult[],
        limit: number = 9
    ): ReviewCandidate[] {
        const CENTRALITY_WEIGHT = 0.4;
        const STALENESS_WEIGHT = 0.3;
        const AI_PRIORITY_WEIGHT = 0.3;

        // Build a lookup from noteId/path -> VaultAnalysisResult
        const resultsByPath = new Map<string, VaultAnalysisResult>();
        for (const r of analysisResults) {
            resultsByPath.set(r.path, r);
            // Also index by id in case noteId doesn't match path exactly
            resultsByPath.set(r.id, r);
        }

        // Build AI maintenance lookup by noteId
        const aiByNoteId = new Map<string, MaintenanceAction>();
        for (const m of maintenance) {
            aiByNoteId.set(m.noteId, m);
        }

        // Collect all candidate note paths (union of AI maintenance + high-centrality notes)
        const candidatePaths = new Set<string>();
        for (const m of maintenance) {
            candidatePaths.add(m.noteId);
        }
        // Add top centrality notes that might not be in AI list
        const centralityScored = analysisResults
            .filter(r => r.graphMetrics)
            .map(r => ({
                path: r.path,
                maxCentrality: Math.max(
                    r.graphMetrics?.betweennessCentrality ?? 0,
                    r.graphMetrics?.eigenvectorCentrality ?? 0,
                    r.graphMetrics?.degreeCentrality ?? 0
                )
            }))
            .sort((a, b) => b.maxCentrality - a.maxCentrality);
        
        // Add top 20 centrality notes as rule-based candidates
        for (const item of centralityScored.slice(0, 20)) {
            candidatePaths.add(item.path);
        }

        // Find max centrality and max staleness for normalization
        const now = Date.now();
        let maxCentrality = 0;
        let maxStalenessMs = 1; // avoid division by zero
        for (const path of candidatePaths) {
            const result = resultsByPath.get(path);
            if (result?.graphMetrics) {
                const mc = Math.max(
                    result.graphMetrics.betweennessCentrality ?? 0,
                    result.graphMetrics.eigenvectorCentrality ?? 0,
                    result.graphMetrics.degreeCentrality ?? 0
                );
                if (mc > maxCentrality) maxCentrality = mc;
            }
            if (result?.modified) {
                const age = now - new Date(result.modified).getTime();
                if (age > maxStalenessMs) maxStalenessMs = age;
            }
        }
        if (maxCentrality === 0) maxCentrality = 1;

        // Score each candidate
        const candidates: ReviewCandidate[] = [];
        for (const path of candidatePaths) {
            const result = resultsByPath.get(path);
            const aiAction = aiByNoteId.get(path);

            // Centrality score (normalized 0-1)
            const betweenness = result?.graphMetrics?.betweennessCentrality ?? 0;
            const eigenvector = result?.graphMetrics?.eigenvectorCentrality ?? 0;
            const degree = result?.graphMetrics?.degreeCentrality ?? 0;
            const rawCentrality = Math.max(betweenness, eigenvector, degree);
            const normalizedCentrality = rawCentrality / maxCentrality;

            // Determine centrality role
            let centralityRole: ReviewCandidate['centralityRole'] = 'normal';
            if (betweenness > 0 && betweenness >= eigenvector && betweenness >= degree) {
                centralityRole = 'bridge';
            } else if (eigenvector > 0 && eigenvector >= betweenness && eigenvector >= degree) {
                centralityRole = 'authority';
            } else if (degree > 0) {
                centralityRole = 'hub';
            }

            // Staleness score (normalized 0-1, older = higher)
            const modified = result?.modified ? new Date(result.modified).getTime() : now;
            const stalenessMs = now - modified;
            const normalizedStaleness = stalenessMs / maxStalenessMs;

            // AI priority score (0-1)
            let aiPriorityScore = 0;
            if (aiAction) {
                aiPriorityScore = aiAction.priority === 'high' ? 1.0 
                    : aiAction.priority === 'medium' ? 0.6 
                    : 0.3;
            }

            // Composite urgency score
            const urgencyScore = 
                CENTRALITY_WEIGHT * normalizedCentrality +
                STALENESS_WEIGHT * normalizedStaleness +
                AI_PRIORITY_WEIGHT * aiPriorityScore;

            const title = aiAction?.title || result?.title || path.split('/').pop()?.replace('.md', '') || path;
            const reason = aiAction?.reason || KnowledgeActionsManager.generateRuleBasedReason(centralityRole, stalenessMs, normalizedCentrality);
            const priority = aiAction?.priority || (urgencyScore > 0.65 ? 'high' : urgencyScore > 0.35 ? 'medium' : 'low');
            const action = aiAction?.action || '';

            candidates.push({
                noteId: path,
                title,
                path: result?.path || path,
                reason,
                priority,
                action,
                lastModified: result?.modified || '',
                urgencyScore,
                centralityRole,
                centralityScore: rawCentrality,
                fromAI: !!aiAction
            });
        }

        // Sort by urgency descending, take top N
        candidates.sort((a, b) => b.urgencyScore - a.urgencyScore);
        return candidates.slice(0, limit);
    }

    /**
     * Generate a human-readable reason for rule-based candidates (no AI reason available)
     */
    private static generateRuleBasedReason(
        role: ReviewCandidate['centralityRole'],
        stalenessMs: number,
        normalizedCentrality: number
    ): string {
        const days = Math.floor(stalenessMs / (1000 * 60 * 60 * 24));
        const roleLabel = role === 'bridge' ? 'a key bridge between topics'
            : role === 'authority' ? 'a highly-referenced authority note'
            : role === 'hub' ? 'a well-connected hub note'
            : 'a note in your vault';

        if (days > 180 && normalizedCentrality > 0.5) {
            return `This is ${roleLabel} that hasn't been updated in ${days} days. Its high importance makes it a priority for review.`;
        } else if (days > 180) {
            return `This note hasn't been modified in ${days} days and may need a review to stay current.`;
        } else if (normalizedCentrality > 0.5) {
            return `This is ${roleLabel} with high centrality. Consider reviewing to ensure it remains accurate.`;
        }
        return `This is ${roleLabel} that could benefit from a review.`;
    }

    /**
     * Write [[link]] connections into source notes for the given connection suggestions.
     * Appends a "Related Notes" section at the end of the source file (or after frontmatter).
     */
    public static async writeConnectionsToNotes(
        app: App,
        connections: ConnectionSuggestion[]
    ): Promise<{ written: number; failed: number }> {
        let written = 0;
        let failed = 0;

        // Group connections by source to batch writes per file
        const bySource = new Map<string, ConnectionSuggestion[]>();
        for (const conn of connections) {
            const list = bySource.get(conn.sourceId) || [];
            list.push(conn);
            bySource.set(conn.sourceId, list);
        }

        for (const [sourceId, conns] of bySource) {
            try {
                const file = NoteResolver.resolveToFile(app, sourceId);
                if (!file) {
                    // console.warn(`Source file not found: ${sourceId}`);
                    failed += conns.length;
                    continue;
                }

                // Build link lines using NoteResolver for consistent title resolution
                const linkLines = conns.map((c) => {
                    const targetName = NoteResolver.resolveToTitle(app, c.targetId);
                    return `- [[${targetName}]]`;
                });

                const newSection = `\n\n## Related Notes\n${linkLines.join('\n')}\n`;

                await app.vault.process(file, (content) => {
                    const relatedNotesRegex = /\n## Related Notes\n/;
                    if (relatedNotesRegex.test(content)) {
                        const insertPos = content.search(/\n## Related Notes\n/);
                        const afterSection = content.indexOf('\n## ', insertPos + 1);
                        if (afterSection > insertPos + 20) {
                            const existingSection = content.slice(insertPos, afterSection);
                            return content.slice(0, insertPos) + existingSection + linkLines.join('\n') + '\n' + content.slice(afterSection);
                        }
                        return content + '\n' + linkLines.join('\n') + '\n';
                    }
                    return content + newSection;
                });
                written += conns.length;
            } catch {
                // console.error(`Failed to write connections to ${sourceId}`);
                failed += conns.length;
            }
        }

        return { written, failed };
    }
}