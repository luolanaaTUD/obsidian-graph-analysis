import { App, TFile } from 'obsidian';
import { VaultAnalysisData, VaultAnalysisResult } from '../ai/MasterAnalysisManager';

/**
 * Connectivity statistics for a single note
 */
export interface NoteConnectivityStats {
    path: string;
    title: string;
    outboundLinks: number;
    inboundLinks: number;
    totalLinks: number;
    linkRatio: number; // outbound / inbound (or 0 if inbound is 0)
}

/**
 * Connectivity pattern categories
 */
export interface ConnectivityPatterns {
    integrationOpportunities: NoteConnectivityStats[]; // High outbound, low inbound
    isolatedNotes: NoteConnectivityStats[]; // Low both inbound and outbound
    hubNotes: NoteConnectivityStats[]; // High both inbound and outbound
    orphanNotes: NoteConnectivityStats[]; // Zero links
    bridgeTypeNotes: NoteConnectivityStats[]; // High betweenness, low eigenvector
    authorityTypeNotes: NoteConnectivityStats[]; // High eigenvector, low betweenness
    balancedNotes: NoteConnectivityStats[]; // High both betweenness and eigenvector
}

/**
 * Connectivity statistics summary
 */
export interface ConnectivityStatsSummary {
    totalNotes: number;
    notesWithLinks: number;
    totalOutboundLinks: number;
    totalInboundLinks: number;
    avgOutboundLinks: number;
    avgInboundLinks: number;
    patterns: ConnectivityPatterns;
}

/**
 * Service for analyzing connectivity patterns in the vault
 * Analogous to KDECalculationService for centrality analysis
 */
export class ConnectivityAnalysisService {
    /**
     * Get comprehensive connectivity statistics and patterns
     */
    public getConnectivityStats(app: App, analysisData: VaultAnalysisData): ConnectivityStatsSummary {
        // Compute link counts for all notes
        const linkStats = this.computeLinkStats(app, analysisData);
        
        // Identify patterns
        const patterns = this.identifyPatterns(linkStats, analysisData);
        
        // Calculate summary statistics
        const notesWithLinks = linkStats.filter(n => n.totalLinks > 0);
        const totalOutbound = linkStats.reduce((sum, n) => sum + n.outboundLinks, 0);
        const totalInbound = linkStats.reduce((sum, n) => sum + n.inboundLinks, 0);
        
        return {
            totalNotes: linkStats.length,
            notesWithLinks: notesWithLinks.length,
            totalOutboundLinks: totalOutbound,
            totalInboundLinks: totalInbound,
            avgOutboundLinks: notesWithLinks.length > 0 ? totalOutbound / notesWithLinks.length : 0,
            avgInboundLinks: notesWithLinks.length > 0 ? totalInbound / notesWithLinks.length : 0,
            patterns
        };
    }

    /**
     * Generate comprehensive connectivity summary for AI context
     * Similar to KDECalculationService.getComprehensiveStats()
     */
    public getComprehensiveConnectivitySummary(app: App, analysisData: VaultAnalysisData): string {
        const stats = this.getConnectivityStats(app, analysisData);
        const sections: string[] = [];

        // Overall statistics
        sections.push('=== CONNECTIVITY OVERVIEW ===');
        sections.push(`Total Notes: ${stats.totalNotes}`);
        sections.push(`Notes with Links: ${stats.notesWithLinks}`);
        sections.push(`Total Outbound Links: ${stats.totalOutboundLinks}`);
        sections.push(`Total Inbound Links: ${stats.totalInboundLinks}`);
        sections.push(`Average Outbound Links: ${stats.avgOutboundLinks.toFixed(2)}`);
        sections.push(`Average Inbound Links: ${stats.avgInboundLinks.toFixed(2)}`);
        sections.push('');

        // Integration opportunities (high outbound, low inbound)
        if (stats.patterns.integrationOpportunities.length > 0) {
            sections.push('=== INTEGRATION OPPORTUNITIES ===');
            sections.push(`Notes with high outbound links but low inbound links (need incoming connections): ${stats.patterns.integrationOpportunities.length}`);
            sections.push('Top integration opportunities:');
            stats.patterns.integrationOpportunities.slice(0, 15).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
                sections.push(`     Outbound: ${note.outboundLinks}, Inbound: ${note.inboundLinks}, Ratio: ${note.linkRatio.toFixed(2)}`);
            });
            if (stats.patterns.integrationOpportunities.length > 15) {
                sections.push(`  ... and ${stats.patterns.integrationOpportunities.length - 15} more`);
            }
            sections.push('');
        }

        // Isolated notes (low both inbound and outbound)
        if (stats.patterns.isolatedNotes.length > 0) {
            sections.push('=== ISOLATED NOTES ===');
            sections.push(`Notes with low connectivity (few links in both directions): ${stats.patterns.isolatedNotes.length}`);
            sections.push('Top isolated notes:');
            stats.patterns.isolatedNotes.slice(0, 10).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
                sections.push(`     Outbound: ${note.outboundLinks}, Inbound: ${note.inboundLinks}`);
            });
            if (stats.patterns.isolatedNotes.length > 10) {
                sections.push(`  ... and ${stats.patterns.isolatedNotes.length - 10} more`);
            }
            sections.push('');
        }

        // Hub notes (high both inbound and outbound)
        if (stats.patterns.hubNotes.length > 0) {
            sections.push('=== HUB NOTES ===');
            sections.push(`Well-connected notes (high both inbound and outbound): ${stats.patterns.hubNotes.length}`);
            sections.push('Top hub notes:');
            stats.patterns.hubNotes.slice(0, 10).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
                sections.push(`     Outbound: ${note.outboundLinks}, Inbound: ${note.inboundLinks}`);
            });
            if (stats.patterns.hubNotes.length > 10) {
                sections.push(`  ... and ${stats.patterns.hubNotes.length - 10} more`);
            }
            sections.push('');
        }

        // Orphan notes (zero links)
        if (stats.patterns.orphanNotes.length > 0) {
            sections.push('=== ORPHAN NOTES ===');
            sections.push(`Notes with zero links (urgent attention needed): ${stats.patterns.orphanNotes.length}`);
            sections.push('Orphan notes:');
            stats.patterns.orphanNotes.slice(0, 15).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
            });
            if (stats.patterns.orphanNotes.length > 15) {
                sections.push(`  ... and ${stats.patterns.orphanNotes.length - 15} more`);
            }
            sections.push('');
        }

        // Bridge-type notes (high betweenness, low eigenvector)
        if (stats.patterns.bridgeTypeNotes.length > 0) {
            sections.push('=== BRIDGE-TYPE NOTES ===');
            sections.push(`Notes that connect different areas (high betweenness, low eigenvector): ${stats.patterns.bridgeTypeNotes.length}`);
            sections.push('Top bridge-type notes:');
            stats.patterns.bridgeTypeNotes.slice(0, 10).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
            });
            if (stats.patterns.bridgeTypeNotes.length > 10) {
                sections.push(`  ... and ${stats.patterns.bridgeTypeNotes.length - 10} more`);
            }
            sections.push('');
        }

        // Authority-type notes (high eigenvector, low betweenness)
        if (stats.patterns.authorityTypeNotes.length > 0) {
            sections.push('=== AUTHORITY-TYPE NOTES ===');
            sections.push(`Influential notes (high eigenvector, low betweenness): ${stats.patterns.authorityTypeNotes.length}`);
            sections.push('Top authority-type notes:');
            stats.patterns.authorityTypeNotes.slice(0, 10).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
            });
            if (stats.patterns.authorityTypeNotes.length > 10) {
                sections.push(`  ... and ${stats.patterns.authorityTypeNotes.length - 10} more`);
            }
            sections.push('');
        }

        // Balanced notes (high both betweenness and eigenvector)
        if (stats.patterns.balancedNotes.length > 0) {
            sections.push('=== BALANCED KEY NOTES ===');
            sections.push(`Critical notes (high both betweenness and eigenvector): ${stats.patterns.balancedNotes.length}`);
            sections.push('Top balanced key notes:');
            stats.patterns.balancedNotes.slice(0, 10).forEach((note, index) => {
                sections.push(`  ${index + 1}. ${note.title} (${note.path})`);
            });
            if (stats.patterns.balancedNotes.length > 10) {
                sections.push(`  ... and ${stats.patterns.balancedNotes.length - 10} more`);
            }
            sections.push('');
        }

        return sections.join('\n');
    }

    /**
     * Compute link statistics for all notes in vault analysis
     */
    private computeLinkStats(app: App, analysisData: VaultAnalysisData): NoteConnectivityStats[] {
        const allFiles = app.vault.getMarkdownFiles();
        const linkStatsMap = new Map<string, NoteConnectivityStats>();

        // Build reverse index: count how many files link TO each file
        const inboundLinkCounts = new Map<string, number>();

        // First pass: count inbound links
        for (const file of allFiles) {
            try {
                const cache = app.metadataCache.getFileCache(file);
                if (!cache) continue;

                const allLinks = [
                    ...(cache.links || []),
                    ...(cache.embeds || []),
                    ...(cache.frontmatterLinks || [])
                ];

                for (const link of allLinks) {
                    const resolvedFile = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
                    if (resolvedFile) {
                        const currentCount = inboundLinkCounts.get(resolvedFile.path) || 0;
                        inboundLinkCounts.set(resolvedFile.path, currentCount + 1);
                    }
                }
            } catch (error) {
                // console.warn(`Error processing links from file ${file.path}:`, error);
            }
        }

        // Second pass: create stats for notes in vault analysis
        const vaultPaths = new Set(analysisData.results.map(r => r.path));

        for (const result of analysisData.results) {
            const file = app.vault.getAbstractFileByPath(result.path) as TFile;
            if (!file) continue;

            try {
                const cache = app.metadataCache.getFileCache(file);
                const outboundLinks = (cache?.links?.length || 0) + (cache?.embeds?.length || 0) + (cache?.frontmatterLinks?.length || 0);
                const inboundLinks = inboundLinkCounts.get(result.path) || 0;
                const totalLinks = outboundLinks + inboundLinks;
                const linkRatio = inboundLinks > 0 ? outboundLinks / inboundLinks : (outboundLinks > 0 ? Infinity : 0);

                linkStatsMap.set(result.path, {
                    path: result.path,
                    title: result.title,
                    outboundLinks,
                    inboundLinks,
                    totalLinks,
                    linkRatio
                });
            } catch (error) {
                // console.warn(`Error processing file ${result.path}:`, error);
            }
        }

        return Array.from(linkStatsMap.values());
    }

    /**
     * Identify connectivity patterns from link stats
     */
    private identifyPatterns(
        linkStats: NoteConnectivityStats[],
        analysisData: VaultAnalysisData
    ): ConnectivityPatterns {
        const patterns: ConnectivityPatterns = {
            integrationOpportunities: [],
            isolatedNotes: [],
            hubNotes: [],
            orphanNotes: [],
            bridgeTypeNotes: [],
            authorityTypeNotes: [],
            balancedNotes: []
        };

        if (linkStats.length === 0) return patterns;

        // Calculate thresholds based on percentiles
        const outboundValues = linkStats.map(n => n.outboundLinks).sort((a, b) => b - a);
        const inboundValues = linkStats.map(n => n.inboundLinks).sort((a, b) => b - a);
        
        const p75Outbound = outboundValues[Math.floor(outboundValues.length * 0.25)] || 0;
        const p75Inbound = inboundValues[Math.floor(inboundValues.length * 0.25)] || 0;
        const p25Outbound = outboundValues[Math.floor(outboundValues.length * 0.75)] || 0;
        const p25Inbound = inboundValues[Math.floor(inboundValues.length * 0.75)] || 0;

        // Create a map for quick lookup of vault results
        const vaultResultsMap = new Map<string, VaultAnalysisResult>();
        analysisData.results.forEach(r => vaultResultsMap.set(r.path, r));

        // Categorize notes
        for (const note of linkStats) {
            const vaultResult = vaultResultsMap.get(note.path);
            
            // Orphan notes (zero links)
            if (note.totalLinks === 0) {
                patterns.orphanNotes.push(note);
            }
            // Integration opportunities (high outbound, low inbound)
            else if (note.outboundLinks >= p75Outbound && note.inboundLinks <= p25Inbound) {
                patterns.integrationOpportunities.push(note);
            }
            // Hub notes (high both)
            else if (note.outboundLinks >= p75Outbound && note.inboundLinks >= p75Inbound) {
                patterns.hubNotes.push(note);
            }
            // Isolated notes (low both)
            else if (note.outboundLinks <= p25Outbound && note.inboundLinks <= p25Inbound && note.totalLinks > 0) {
                patterns.isolatedNotes.push(note);
            }

            // Centrality-based patterns (if vault result has graph metrics)
            if (vaultResult?.graphMetrics) {
                const betweenness = vaultResult.graphMetrics.betweennessCentrality || 0;
                const eigenvector = vaultResult.graphMetrics.eigenvectorCentrality || 0;

                // Calculate thresholds for centrality (top 20%)
                const allBetweenness = analysisData.results
                    .map(r => r.graphMetrics?.betweennessCentrality || 0)
                    .filter(v => v > 0)
                    .sort((a, b) => b - a);
                const allEigenvector = analysisData.results
                    .map(r => r.graphMetrics?.eigenvectorCentrality || 0)
                    .filter(v => v > 0)
                    .sort((a, b) => b - a);

                const top20Betweenness = allBetweenness[Math.floor(allBetweenness.length * 0.2)] || 0;
                const top20Eigenvector = allEigenvector[Math.floor(allEigenvector.length * 0.2)] || 0;
                const lowThreshold = Math.min(top20Betweenness, top20Eigenvector) * 0.3;

                // Bridge-type: high betweenness, low eigenvector
                if (betweenness >= top20Betweenness && eigenvector <= lowThreshold) {
                    patterns.bridgeTypeNotes.push(note);
                }
                // Authority-type: high eigenvector, low betweenness
                else if (eigenvector >= top20Eigenvector && betweenness <= lowThreshold) {
                    patterns.authorityTypeNotes.push(note);
                }
                // Balanced: high both
                else if (betweenness >= top20Betweenness && eigenvector >= top20Eigenvector) {
                    patterns.balancedNotes.push(note);
                }
            }
        }

        // Sort patterns by relevance (integration opportunities by ratio, others by total links)
        patterns.integrationOpportunities.sort((a, b) => b.linkRatio - a.linkRatio);
        patterns.isolatedNotes.sort((a, b) => a.totalLinks - b.totalLinks);
        patterns.hubNotes.sort((a, b) => b.totalLinks - a.totalLinks);
        patterns.orphanNotes.sort((a, b) => a.title.localeCompare(b.title));

        return patterns;
    }
}
