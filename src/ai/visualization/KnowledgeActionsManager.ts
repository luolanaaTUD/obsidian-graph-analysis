import { App, TFile, Notice, setIcon } from 'obsidian';
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
            const data = JSON.parse(content);
            
            if (data?.recommendedActions) {
                this.data = data.recommendedActions;
                return this.data;
            }
            return null;
        } catch (error) {
            // console.warn('No cached knowledge actions data found:', error);
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
        this.container.innerHTML = `
            <div class="actions-placeholder">
                <div class="placeholder-content">
                    <h3>🎯 Recommended Actions</h3>
                    <p>Generate vault analysis to see personalized action recommendations.</p>
                    <div class="placeholder-features">
                        <div class="feature-item">
                            <span class="feature-icon">🔧</span>
                            <span>Knowledge Maintenance</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🔗</span>
                            <span>Connection Opportunities</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">🗺️</span>
                            <span>Learning Paths</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">📁</span>
                            <span>Organization Tips</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
        
        const totalActions = this.getTotalActionCount();
        const priorityBreakdown = this.getPriorityBreakdown();
        
        summaryContainer.innerHTML = `
            <h3>📊 Action Summary</h3>
            <div class="summary-stats">
                <div class="summary-stat">
                    <span class="stat-number">${totalActions}</span>
                    <span class="stat-label">Total Actions</span>
                </div>
                <div class="summary-stat priority-high">
                    <span class="stat-number">${priorityBreakdown.high}</span>
                    <span class="stat-label">High Priority</span>
                </div>
                <div class="summary-stat priority-medium">
                    <span class="stat-number">${priorityBreakdown.medium}</span>
                    <span class="stat-label">Medium Priority</span>
                </div>
                <div class="summary-stat priority-low">
                    <span class="stat-number">${priorityBreakdown.low}</span>
                    <span class="stat-label">Low Priority</span>
                </div>
            </div>
        `;
    }

    private createMaintenanceSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section maintenance-section' });
        
        section.innerHTML = `
            <h4>🔧 Knowledge Maintenance</h4>
            <p class="section-description">Notes that need review, updates, or improvements</p>
            <div class="actions-list">
                ${this.data!.maintenance.slice(0, 10).map(action => `
                    <div class="action-item priority-${action.priority}" data-note-id="${action.noteId}">
                        <div class="action-header">
                            <span class="action-title">${action.title}</span>
                            <span class="action-priority priority-${action.priority}">${action.priority.toUpperCase()}</span>
                        </div>
                        <div class="action-reason">${action.reason}</div>
                        <div class="action-content">${action.action}</div>
                        <div class="action-buttons">
                            <button class="action-btn primary" onclick="this.closest('.action-item').openNote()">
                                📝 Open Note
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.action-item').dismissAction()">
                                ✓ Mark Done
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            ${this.data!.maintenance.length > 10 ? `
                <div class="show-more">
                    <button class="show-more-btn">Show ${this.data!.maintenance.length - 10} More Actions</button>
                </div>
            ` : ''}
        `;

        this.attachMaintenanceHandlers(section);
    }

    private createConnectionsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section connections-section' });
        
        section.innerHTML = `
            <h4>🔗 Connection Opportunities</h4>
            <p class="section-description">Suggested links between your notes</p>
            <div class="connections-list">
                ${this.data!.connections.slice(0, 8).map(connection => `
                    <div class="connection-item" data-source="${connection.sourceId}" data-target="${connection.targetId}">
                        <div class="connection-header">
                            <div class="connection-flow">
                                <span class="source-note">${NoteResolver.resolveToTitle(this.app, connection.sourceId)}</span>
                                <span class="connection-arrow">→</span>
                                <span class="target-note">${NoteResolver.resolveToTitle(this.app, connection.targetId)}</span>
                            </div>
                            <span class="confidence-score">
                                ${Math.round(connection.confidence * 100)}% confidence
                            </span>
                        </div>
                        <div class="connection-reason">${connection.reason}</div>
                        <div class="connection-buttons">
                            <button class="action-btn primary" onclick="this.closest('.connection-item').createLink()">
                                🔗 Create Link
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.connection-item').previewConnection()">
                                👁️ Preview
                            </button>
                            <button class="action-btn tertiary" onclick="this.closest('.connection-item').dismissConnection()">
                                ✗ Dismiss
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.attachConnectionHandlers(section);
    }

    private createLearningPathsSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section learning-paths-section' });
        
        section.innerHTML = `
            <h4>🗺️ Learning Paths</h4>
            <p class="section-description">Recommended sequences for learning and exploration</p>
            <div class="learning-paths-list">
                ${this.data!.learningPaths.map(path => `
                    <div class="learning-path-item">
                        <div class="path-header">
                            <h5 class="path-title">${path.title}</h5>
                            <span class="path-length">${path.noteIds.length} notes</span>
                        </div>
                        <div class="path-description">${path.description}</div>
                        <div class="path-rationale">${path.rationale}</div>
                        <div class="path-sequence">
                            ${path.noteIds.map((noteId, index) => `
                                <div class="path-step">
                                    <span class="step-number">${index + 1}</span>
                                    <span class="step-note">${NoteResolver.resolveToTitle(this.app, noteId)}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="path-buttons">
                            <button class="action-btn primary" onclick="this.closest('.learning-path-item').startLearningPath()">
                                🚀 Start Path
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.learning-path-item').bookmarkPath()">
                                📌 Bookmark
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.attachLearningPathHandlers(section);
    }

    private createOrganizationSection(container: HTMLElement): void {
        const section = container.createEl('div', { cls: 'actions-section organization-section' });
        
        // Group suggestions by type
        const groupedSuggestions = this.groupOrganizationSuggestions();
        
        section.innerHTML = `
            <h4>📁 Organization Suggestions</h4>
            <p class="section-description">Improvements for your knowledge structure</p>
            <div class="organization-tabs">
                <div class="tab-headers">
                    <button class="org-tab-header active" data-type="tag">🏷️ Tags</button>
                    <button class="org-tab-header" data-type="folder">📁 Folders</button>
                    <button class="org-tab-header" data-type="structure">🏗️ Structure</button>
                </div>
                <div class="tab-content">
                    ${this.renderOrganizationTab('tag', groupedSuggestions.tag)}
                </div>
            </div>
        `;

        this.attachOrganizationHandlers(section, groupedSuggestions);
    }

    private renderOrganizationTab(type: string, suggestions: OrganizationSuggestion[]): string {
        const icons = { tag: '🏷️', folder: '📁', structure: '🏗️' };
        
        return `
            <div class="organization-suggestions" data-type="${type}">
                ${suggestions.map(suggestion => `
                    <div class="organization-item">
                        <div class="suggestion-header">
                            <span class="suggestion-icon">${icons[type as keyof typeof icons]}</span>
                            <span class="suggestion-text">${suggestion.suggestion}</span>
                        </div>
                        <div class="affected-notes">
                            <span class="affected-count">${suggestion.affectedNotes.length} notes affected</span>
                            <div class="affected-list">
                                ${suggestion.affectedNotes.slice(0, 3).map(noteId => 
                                    `<span class="affected-note">${NoteResolver.resolveToTitle(this.app, noteId)}</span>`
                                ).join('')}
                                ${suggestion.affectedNotes.length > 3 ? `<span class="more-notes">+${suggestion.affectedNotes.length - 3} more</span>` : ''}
                            </div>
                        </div>
                        <div class="suggestion-buttons">
                            <button class="action-btn primary" onclick="this.closest('.organization-item').applySuggestion()">
                                ✓ Apply
                            </button>
                            <button class="action-btn secondary" onclick="this.closest('.organization-item').previewSuggestion()">
                                👁️ Preview
                            </button>
                            <button class="action-btn tertiary" onclick="this.closest('.organization-item').dismissSuggestion()">
                                ✗ Dismiss
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
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
                    this.openNote(noteId || '');
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
                    const tabContent = section.querySelector('.tab-content');
                    if (tabContent) {
                        tabContent.innerHTML = this.renderOrganizationTab(type, groupedSuggestions[type]);
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
        actionItem.style.opacity = '0.5';
        actionItem.style.pointerEvents = 'none';
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
        connectionItem.style.opacity = '0.5';
        connectionItem.style.pointerEvents = 'none';
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

                const content = await app.vault.read(file);

                // Build link lines using NoteResolver for consistent title resolution
                const linkLines = conns.map((c) => {
                    const targetName = NoteResolver.resolveToTitle(app, c.targetId);
                    return `- [[${targetName}]]`;
                });

                const newSection = `\n\n## Related Notes\n${linkLines.join('\n')}\n`;
                
                // Check if there's already a "Related Notes" section
                const relatedNotesRegex = /\n## Related Notes\n/;
                let newContent: string;
                if (relatedNotesRegex.test(content)) {
                    // Append links to existing section (before the next ## heading or end of file)
                    const insertPos = content.search(/\n## Related Notes\n/);
                    const afterSection = content.indexOf('\n## ', insertPos + 1);
                    if (afterSection > insertPos + 20) {
                        // Insert before the next heading
                        const existingSection = content.slice(insertPos, afterSection);
                        newContent = content.slice(0, insertPos) + existingSection + linkLines.join('\n') + '\n' + content.slice(afterSection);
                    } else {
                        // Append at end
                        newContent = content + '\n' + linkLines.join('\n') + '\n';
                    }
                } else {
                    // Append new section at end of file
                    newContent = content + newSection;
                }

                await app.vault.modify(file, newContent);
                written += conns.length;
            } catch (error) {
                // console.error(`Failed to write connections to ${sourceId}:`, error);
                failed += conns.length;
            }
        }

        return { written, failed };
    }
}