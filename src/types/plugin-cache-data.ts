import type { TabAnalysisData, VaultAnalysisData } from '../ai/MasterAnalysisManager';

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

/** Plugin cache persisted via Plugin.loadData / saveData (no direct fs or vault.adapter). */
export interface PluginCacheData {
    vaultAnalysis?: VaultAnalysisData;
    failedBatches?: FailedBatchesData;
    tabAnalyses?: Record<string, TabAnalysisData>;
}
