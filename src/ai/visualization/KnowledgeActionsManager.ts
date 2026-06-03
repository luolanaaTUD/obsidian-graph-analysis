import { App } from 'obsidian';
import type { VaultAnalysisResult } from '../MasterAnalysisManager';
import { NoteResolver } from '../../utils/NoteResolver';
import type {
    ConnectionSuggestion,
    MaintenanceAction,
    ReviewCandidate
} from './knowledge-actions.types';

export type {
    ConnectionSuggestion,
    KnowledgeActionsData,
    LearningPath,
    MaintenanceAction,
    OrganizationSuggestion,
    ReviewCandidate
} from './knowledge-actions.types';

/**
 * Actions tab helpers (review scoring, writing suggested links).
 * UI is rendered in VaultAnalysisModals.
 */
export class KnowledgeActionsManager {
    /**
     * Compute hybrid urgency-scored review candidates by combining:
     * - Rule-based signals: centrality (hub/bridge/authority importance) + staleness (time since modified)
     * - AI signals: maintenance priority, reason, and action from AI analysis
     */
    public static computeReviewCandidates(
        maintenance: MaintenanceAction[],
        analysisResults: VaultAnalysisResult[],
        limit: number = 9
    ): ReviewCandidate[] {
        const CENTRALITY_WEIGHT = 0.4;
        const STALENESS_WEIGHT = 0.3;
        const AI_PRIORITY_WEIGHT = 0.3;

        const resultsByPath = new Map<string, VaultAnalysisResult>();
        for (const r of analysisResults) {
            resultsByPath.set(r.path, r);
            resultsByPath.set(r.id, r);
        }

        const aiByNoteId = new Map<string, MaintenanceAction>();
        for (const m of maintenance) {
            aiByNoteId.set(m.noteId, m);
        }

        const candidatePaths = new Set<string>();
        for (const m of maintenance) {
            candidatePaths.add(m.noteId);
        }

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

        for (const item of centralityScored.slice(0, 20)) {
            candidatePaths.add(item.path);
        }

        const now = Date.now();
        let maxCentrality = 0;
        let maxStalenessMs = 1;
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

        const candidates: ReviewCandidate[] = [];
        for (const path of candidatePaths) {
            const result = resultsByPath.get(path);
            const aiAction = aiByNoteId.get(path);

            const betweenness = result?.graphMetrics?.betweennessCentrality ?? 0;
            const eigenvector = result?.graphMetrics?.eigenvectorCentrality ?? 0;
            const degree = result?.graphMetrics?.degreeCentrality ?? 0;
            const rawCentrality = Math.max(betweenness, eigenvector, degree);
            const normalizedCentrality = rawCentrality / maxCentrality;

            let centralityRole: ReviewCandidate['centralityRole'] = 'normal';
            if (betweenness > 0 && betweenness >= eigenvector && betweenness >= degree) {
                centralityRole = 'bridge';
            } else if (eigenvector > 0 && eigenvector >= betweenness && eigenvector >= degree) {
                centralityRole = 'authority';
            } else if (degree > 0) {
                centralityRole = 'hub';
            }

            const modified = result?.modified ? new Date(result.modified).getTime() : now;
            const stalenessMs = now - modified;
            const normalizedStaleness = stalenessMs / maxStalenessMs;

            let aiPriorityScore = 0;
            if (aiAction) {
                aiPriorityScore = aiAction.priority === 'high' ? 1.0
                    : aiAction.priority === 'medium' ? 0.6
                    : 0.3;
            }

            const urgencyScore =
                CENTRALITY_WEIGHT * normalizedCentrality +
                STALENESS_WEIGHT * normalizedStaleness +
                AI_PRIORITY_WEIGHT * aiPriorityScore;

            const title = aiAction?.title || result?.title || path.split('/').pop()?.replace('.md', '') || path;
            const reason = aiAction?.reason || KnowledgeActionsManager.generateRuleBasedReason(
                centralityRole,
                stalenessMs,
                normalizedCentrality
            );
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

        candidates.sort((a, b) => b.urgencyScore - a.urgencyScore);
        return candidates.slice(0, limit);
    }

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
        }
        if (days > 180) {
            return `This note hasn't been modified in ${days} days and may need a review to stay current.`;
        }
        if (normalizedCentrality > 0.5) {
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
                    failed += conns.length;
                    continue;
                }

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
                failed += conns.length;
            }
        }

        return { written, failed };
    }
}
