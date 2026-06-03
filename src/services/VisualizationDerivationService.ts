import { App } from 'obsidian';
import type { DomainDistributionData } from '../components/domain-distribution/DomainDistributionChart';
import type {
    CalendarData,
    CalendarSummaryContext
} from '../components/calendar-chart/KnowledgeCalendarChart';
import {
    VaultAnalysisData,
    VaultAnalysisResult,
    generateVaultAnalysisId
} from '../ai/MasterAnalysisManager';
import { KnowledgeDomainHelper, type KnowledgeDomain } from '../ai/KnowledgeDomainHelper';
import { HierarchicalDomain } from '../types/types';
import { KDECalculationService } from '../utils/KDECalculationService';
import { PluginDataStore } from '../utils/PluginDataStore';
import type {
    DerivedVisualizationsData,
    SerializedCalendarDay
} from '../types/plugin-cache-data';

interface DomainMapNode {
    ddcCode: string;
    name: string;
    noteCount: number;
    level: number;
    children?: DomainMapNode[];
    parent?: string;
    keywords?: string[];
}

export class VisualizationDerivationService {
    private readonly kdeService = new KDECalculationService();

    constructor(
        private readonly app: App,
        private readonly dataStore: PluginDataStore
    ) {}

    public static reviveCalendarDays(serialized: SerializedCalendarDay[]): CalendarData[] {
        return serialized.map((day) => ({
            date: new Date(day.date),
            value: day.value,
            wordCount: day.wordCount,
            fileCount: day.fileCount
        }));
    }

    public static serializeCalendarDays(calendar: CalendarData[]): SerializedCalendarDay[] {
        return calendar.map((day) => ({
            date: day.date.toISOString().split('T')[0],
            value: day.value,
            wordCount: day.wordCount,
            fileCount: day.fileCount
        }));
    }

    public static buildCalendarSummaryContext(
        analysisData: VaultAnalysisData,
        calendar: CalendarData[]
    ): CalendarSummaryContext {
        const totalNotes = analysisData.results.length;
        const totalWords = calendar.reduce((sum, day) => sum + day.wordCount, 0);
        const createdTimes = analysisData.results
            .map((r) => new Date(r.created).getTime())
            .filter((t) => !isNaN(t));
        let vaultDurationDays = 0;
        if (createdTimes.length > 0) {
            const first = Math.min(...createdTimes);
            vaultDurationDays = Math.ceil((Date.now() - first) / (1000 * 3600 * 24));
        }
        return { totalNotes, totalWords, vaultDurationDays };
    }

    public isStale(
        analysisData: VaultAnalysisData,
        cached: DerivedVisualizationsData | null | undefined
    ): boolean {
        if (!cached) {
            return true;
        }
        return cached.sourceAnalysisId !== generateVaultAnalysisId(analysisData);
    }

    public async compute(analysisData: VaultAnalysisData): Promise<DerivedVisualizationsData> {
        const domainDistribution = await this.buildDomainHierarchy(analysisData);
        const { histogram, stats } = this.kdeService.computeCentralityInsights(analysisData);
        const calendar = this.buildCalendarFromVaultAnalysis(analysisData);

        return {
            sourceAnalysisId: generateVaultAnalysisId(analysisData),
            computedAt: new Date().toISOString(),
            domainDistribution: domainDistribution ?? { domainHierarchy: [], domainConnections: [] },
            centralityHistogram: histogram,
            centralityStats: stats,
            calendar: VisualizationDerivationService.serializeCalendarDays(calendar)
        };
    }

    public async computeIfStale(
        analysisData: VaultAnalysisData,
        cached?: DerivedVisualizationsData | null
    ): Promise<DerivedVisualizationsData | null> {
        const existing = cached ?? (await this.dataStore.getDerivedVisualizations());
        if (!this.isStale(analysisData, existing)) {
            return existing;
        }
        return this.compute(analysisData);
    }

    public async computeAndPersist(analysisData: VaultAnalysisData): Promise<DerivedVisualizationsData> {
        const derived = await this.compute(analysisData);
        await this.dataStore.setDerivedVisualizations(derived);
        return derived;
    }

    private async buildDomainHierarchy(
        analysisData: VaultAnalysisData
    ): Promise<DomainDistributionData | null> {
        if (!analysisData?.results?.length) {
            return null;
        }

        try {
            const domainHelper = KnowledgeDomainHelper.getInstance(this.app);
            await domainHelper.ensureDomainTemplateLoaded();

            const domainMap = new Map<string, DomainMapNode>();
            const subdivisionMap = new Map<string, DomainMapNode>();
            const subdivisionNotes = new Map<string, VaultAnalysisResult[]>();
            const nameToCodeMap = new Map<string, string>();
            const codeToNameMap = domainHelper.getDomainCodeToNameMap();
            const domainTemplate = domainHelper.getDomainTemplate();
            if (domainTemplate?.knowledge_domains?.domains) {
                domainTemplate.knowledge_domains.domains.forEach((domain: KnowledgeDomain) => {
                    codeToNameMap.set(domain.id, domain.name);
                });
            }
            codeToNameMap.forEach((name: string, code: string) => {
                nameToCodeMap.set(name, code);
            });

            analysisData.results.forEach((note: VaultAnalysisResult) => {
                if (!note.knowledgeDomains?.length) {
                    return;
                }
                note.knowledgeDomains.forEach((domain: string) => {
                    let subdivisionId = '';
                    if (domainHelper.isValidSubdivisionId(domain)) {
                        subdivisionId = domain;
                    } else if (nameToCodeMap.has(domain)) {
                        subdivisionId = nameToCodeMap.get(domain) || '';
                    } else {
                        return;
                    }
                    if (!subdivisionId) {
                        return;
                    }
                    const domainId = domainHelper.getDomainIdFromSubdivision(subdivisionId);
                    if (!subdivisionNotes.has(subdivisionId)) {
                        subdivisionNotes.set(subdivisionId, []);
                    }
                    subdivisionNotes.get(subdivisionId)?.push(note);
                    if (!domainMap.has(domainId)) {
                        const domainName = codeToNameMap.get(domainId) || domainId;
                        domainMap.set(domainId, {
                            ddcCode: domainId,
                            name: domainName,
                            noteCount: 0,
                            level: 1,
                            children: []
                        });
                    }
                    if (!subdivisionMap.has(subdivisionId)) {
                        const subdivisionNode: DomainMapNode = {
                            ddcCode: subdivisionId,
                            name: codeToNameMap.get(subdivisionId) || subdivisionId,
                            noteCount: 0,
                            level: 2,
                            parent: domainMap.get(domainId)?.ddcCode
                        };
                        subdivisionMap.set(subdivisionId, subdivisionNode);
                        domainMap.get(domainId)?.children?.push(subdivisionNode);
                    }
                    const subdivision = subdivisionMap.get(subdivisionId);
                    if (subdivision) {
                        subdivision.noteCount += 1;
                    }
                    const domainNode = domainMap.get(domainId);
                    if (domainNode) {
                        domainNode.noteCount += 1;
                    }
                });
            });

            subdivisionMap.forEach((subdivision, subdivisionId) => {
                const notes = subdivisionNotes.get(subdivisionId) || [];
                const keywords = new Set<string>();
                notes.forEach((note) => {
                    if (note.keywords) {
                        note.keywords.split(',').forEach((keyword: string) => {
                            const trimmed = keyword.trim();
                            if (trimmed) {
                                keywords.add(trimmed);
                            }
                        });
                    }
                });
                subdivision.keywords = Array.from(keywords);
            });

            const domainHierarchy = Array.from(domainMap.values())
                .filter((d) => d.noteCount > 0)
                .sort((a, b) => b.noteCount - a.noteCount) as HierarchicalDomain[];

            return {
                domainHierarchy,
                domainConnections: []
            };
        } catch {
            return null;
        }
    }

    private buildCalendarFromVaultAnalysis(analysisData: VaultAnalysisData): CalendarData[] {
        const dailyActivity = new Map<string, CalendarData>();

        for (const note of analysisData.results) {
            if (!note.created) {
                continue;
            }
            const createdDate = new Date(note.created);
            if (isNaN(createdDate.getTime())) {
                continue;
            }
            const dateKey = createdDate.toISOString().split('T')[0];
            const charCount = note.charCount ?? 0;

            let dayData = dailyActivity.get(dateKey);
            if (!dayData) {
                dayData = {
                    date: new Date(dateKey),
                    value: 0,
                    wordCount: 0,
                    fileCount: 0
                };
                dailyActivity.set(dateKey, dayData);
            }
            dayData.wordCount += charCount;
            dayData.fileCount += 1;
            dayData.value = dayData.wordCount;
        }

        const dailyActivities = Array.from(dailyActivity.values());
        dailyActivities.sort((a, b) => a.date.getTime() - b.date.getTime());
        return dailyActivities;
    }
}
