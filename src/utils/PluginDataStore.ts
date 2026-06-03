import { App, TFile } from 'obsidian';
import type { TabAnalysisData, VaultAnalysisData } from '../ai/MasterAnalysisManager';
import type { FailedBatchesData, PluginCacheData } from '../types/plugin-cache-data';

export interface PluginDataHost {
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
}

const PLUGIN_ID = 'knowledge-graph-analysis';

const LEGACY_PATHS = {
    vaultAnalysis: 'vault-analysis.json',
    failedBatches: 'vault-analysis-failed-batches.json',
    structure: 'structure-analysis.json',
    evolution: 'evolution-analysis.json',
    actions: 'actions-analysis.json',
} as const;

export class PluginDataStore {
    constructor(private readonly host: PluginDataHost) {}

    async read(): Promise<PluginCacheData> {
        const data = await this.host.loadData();
        if (data && typeof data === 'object') {
            return data as PluginCacheData;
        }
        return {};
    }

    async write(data: PluginCacheData): Promise<void> {
        await this.host.saveData(data);
    }

    async getVaultAnalysis(): Promise<VaultAnalysisData | null> {
        return (await this.read()).vaultAnalysis ?? null;
    }

    async setVaultAnalysis(data: VaultAnalysisData): Promise<void> {
        const cache = await this.read();
        cache.vaultAnalysis = data;
        await this.write(cache);
    }

    async getFailedBatches(): Promise<FailedBatchesData | null> {
        return (await this.read()).failedBatches ?? null;
    }

    async setFailedBatches(data: FailedBatchesData): Promise<void> {
        const cache = await this.read();
        cache.failedBatches = data;
        await this.write(cache);
    }

    async getTabAnalysis<T extends TabAnalysisData>(tabName: string): Promise<T | null> {
        const tab = (await this.read()).tabAnalyses?.[tabName];
        return (tab as T | undefined) ?? null;
    }

    async setTabAnalysis(tabName: string, data: TabAnalysisData): Promise<void> {
        const cache = await this.read();
        if (!cache.tabAnalyses) {
            cache.tabAnalyses = {};
        }
        cache.tabAnalyses[tabName] = data;
        await this.write(cache);
    }

    /**
     * One-time import from legacy per-file cache under .obsidian/plugins/.../responses/
     * using Vault API (getAbstractFileByPath + read), not Node fs or vault.adapter.
     */
    async migrateLegacyCacheFromVaultFiles(app: App): Promise<void> {
        const cache = await this.read();

        const base = `${app.vault.configDir}/plugins/${PLUGIN_ID}/responses`;
        let changed = false;

        if (!cache.vaultAnalysis) {
            const parsed = await this.readLegacyJsonFile(app, `${base}/${LEGACY_PATHS.vaultAnalysis}`);
            if (parsed) {
                cache.vaultAnalysis = parsed as VaultAnalysisData;
                changed = true;
            }
        }

        if (!cache.failedBatches) {
            const parsed = await this.readLegacyJsonFile(app, `${base}/${LEGACY_PATHS.failedBatches}`);
            if (parsed) {
                cache.failedBatches = parsed as FailedBatchesData;
                changed = true;
            }
        }

        if (!cache.tabAnalyses) {
            cache.tabAnalyses = {};
        }

        const tabKeys: Array<{ tab: string; file: string }> = [
            { tab: 'structure', file: LEGACY_PATHS.structure },
            { tab: 'evolution', file: LEGACY_PATHS.evolution },
            { tab: 'actions', file: LEGACY_PATHS.actions },
        ];

        for (const { tab, file } of tabKeys) {
            if (cache.tabAnalyses[tab]) {
                continue;
            }
            const parsed = await this.readLegacyJsonFile(app, `${base}/${file}`);
            if (parsed) {
                cache.tabAnalyses[tab] = parsed as TabAnalysisData;
                changed = true;
            }
        }

        if (changed) {
            await this.write(cache);
        }
    }

    private async readLegacyJsonFile(app: App, vaultPath: string): Promise<unknown> {
        const file = app.vault.getAbstractFileByPath(vaultPath);
        if (!(file instanceof TFile)) {
            return null;
        }
        try {
            return JSON.parse(await app.vault.read(file)) as unknown;
        } catch {
            return null;
        }
    }
}
