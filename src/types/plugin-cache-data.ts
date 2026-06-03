import type { TabAnalysisData, VaultAnalysisData } from '../ai/MasterAnalysisManager';
import type { DomainDistributionData } from '../components/domain-distribution/DomainDistributionChart';
import type {
    CentralityHistogramResult,
    StructuredCentralityStats
} from '../utils/KDECalculationService';

export interface FailedBatchEntry {
    timestamp: string;
    batchIndex: number;
    primaryModel: string;
    retryModel: string;
    error: string;
    notes: Array<{ path: string; basename: string; charCount: number }>;
}

export interface FailedBatchesData {
    remaining: {
        savedAt: string;
        retryAfter: string;
        reason: string;
        notes: Array<{ path: string; basename: string; charCount: number }>;
    } | null;
    failed: FailedBatchEntry[];
}

/** Serializable calendar day (dates stored as YYYY-MM-DD for JSON persistence). */
export interface SerializedCalendarDay {
    date: string;
    value: number;
    wordCount: number;
    fileCount: number;
}

/** Precomputed chart data derived from vault analysis (Stage 1.5 cache). */
export interface DerivedVisualizationsData {
    sourceAnalysisId: string;
    computedAt: string;
    domainDistribution: DomainDistributionData;
    centralityHistogram: CentralityHistogramResult;
    centralityStats: StructuredCentralityStats;
    calendar: SerializedCalendarDay[];
}

/** Plugin cache persisted via Plugin.loadData / saveData (no direct fs or vault.adapter). */
export interface PluginCacheData {
    vaultAnalysis?: VaultAnalysisData;
    failedBatches?: FailedBatchesData;
    tabAnalyses?: Record<string, TabAnalysisData>;
    derivedVisualizations?: DerivedVisualizationsData;
}
