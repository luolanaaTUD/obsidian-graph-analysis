import * as ss from 'simple-statistics';
import { VaultAnalysisData } from '../ai/MasterAnalysisManager';

export interface CentralityKDEResult {
    betweenness: { x: number[]; y: number[] };
    closeness: { x: number[]; y: number[] };
    eigenvector: { x: number[]; y: number[] };
}

export interface HistogramBin {
    range: string;      // e.g., "0.0-0.1"
    min: number;
    max: number;
    betweenness: number;  // count of notes
    closeness: number;
    eigenvector: number;
}

export interface CentralityHistogramResult {
    bins: HistogramBin[];
    totals: { betweenness: number; closeness: number; eigenvector: number };
    maxValue: number; // Maximum centrality value found in the data
    upperBound: number; // Rounded upper bound for x-axis
}

export interface CentralityStats {
    name: string;  // "Betweenness", "Closeness", "Eigenvector"
    count: number;
    mean: number;
    median: number;
    range: { min: number; max: number };
    distribution: string;  // "Right-skewed", "Symmetric", etc.
    modality: string;      // "unimodal", "bimodal", etc.
    interpretation: string;  // The plain language interpretation
}

export interface StructuredCentralityStats {
    betweenness: CentralityStats | null;
    closeness: CentralityStats | null;
    eigenvector: CentralityStats | null;
}

export class KDECalculationService {
    /**
     * Calculate KDE distributions for all centrality types
     */
    public calculateKDEDistributions(analysisData: VaultAnalysisData): CentralityKDEResult {
        // Extract centrality values from results
        const betweennessValues = this.extractCentralityValues(analysisData, 'betweennessCentrality');
        const closenessValues = this.extractCentralityValues(analysisData, 'closenessCentrality');
        const eigenvectorValues = this.extractCentralityValues(analysisData, 'eigenvectorCentrality');

        // Calculate KDE for each centrality type
        const betweennessKDE = this.calculateKDE(betweennessValues);
        const closenessKDE = this.calculateKDE(closenessValues);
        const eigenvectorKDE = this.calculateKDE(eigenvectorValues);

        return {
            betweenness: betweennessKDE,
            closeness: closenessKDE,
            eigenvector: eigenvectorKDE
        };
    }

    /**
     * Extract centrality values from vault analysis data
     * Filters out zero and null values for better KDE estimation
     */
    private extractCentralityValues(
        analysisData: VaultAnalysisData,
        centralityType: 'betweennessCentrality' | 'closenessCentrality' | 'eigenvectorCentrality',
        includeZeros: boolean = false
    ): number[] {
        const values: number[] = [];

        for (const result of analysisData.results) {
            if (result.graphMetrics && result.graphMetrics[centralityType] !== undefined) {
                const value = result.graphMetrics[centralityType];
                // Include zeros if requested, otherwise filter them out for better KDE estimation
                if (value !== null && value !== undefined && (includeZeros || value > 0)) {
                    values.push(value);
                }
            }
        }

        return values;
    }

    /**
     * Count all notes that have a specific centrality metric defined (including zeros)
     */
    private countNotesWithMetric(
        analysisData: VaultAnalysisData,
        centralityType: 'betweennessCentrality' | 'closenessCentrality' | 'eigenvectorCentrality'
    ): number {
        let count = 0;
        for (const result of analysisData.results) {
            if (result.graphMetrics && result.graphMetrics[centralityType] !== undefined) {
                const value = result.graphMetrics[centralityType];
                // Count all notes with the metric defined, including zeros
                if (value !== null && value !== undefined) {
                    count++;
                }
            }
        }
        return count;
    }

    /**
     * Calculate KDE for a set of values
     */
    private calculateKDE(values: number[]): { x: number[]; y: number[] } {
        // Handle edge cases
        if (values.length === 0) {
            return { x: [], y: [] };
        }

        if (values.length === 1) {
            // Single value - return a simple point
            return { x: [values[0]], y: [1] };
        }

        // Calculate KDE using simple-statistics
        const kde = ss.kernelDensityEstimation(values);

        // Generate evaluation points across the data range
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        const padding = range * 0.1; // 10% padding on each side
        const start = Math.max(0, min - padding);
        const end = max + padding;
        const numPoints = 100;

        const x: number[] = [];
        const y: number[] = [];

        for (let i = 0; i < numPoints; i++) {
            const point = start + (end - start) * (i / (numPoints - 1));
            x.push(point);
            y.push(kde(point));
        }

        return { x, y };
    }

    /**
     * Generate summary statistics from KDE results for AI context
     */
    public getKDESummaryStats(kdeResult: CentralityKDEResult): string {
        const summaries: string[] = [];

        // Analyze each centrality type
        summaries.push('=== Betweenness Centrality Distribution ===');
        summaries.push(this.analyzeKDEDistribution(kdeResult.betweenness, 'betweenness'));

        summaries.push('\n=== Closeness Centrality Distribution ===');
        summaries.push(this.analyzeKDEDistribution(kdeResult.closeness, 'closeness'));

        summaries.push('\n=== Eigenvector Centrality Distribution ===');
        summaries.push(this.analyzeKDEDistribution(kdeResult.eigenvector, 'eigenvector'));

        return summaries.join('\n');
    }

    /**
     * Analyze a single KDE distribution and return descriptive statistics
     */
    private analyzeKDEDistribution(
        kdeData: { x: number[]; y: number[] },
        centralityType: string
    ): string {
        if (kdeData.x.length === 0 || kdeData.y.length === 0) {
            return `No ${centralityType} centrality data available.`;
        }

        const stats: string[] = [];

        // Find peak density location
        const maxDensityIndex = kdeData.y.indexOf(Math.max(...kdeData.y));
        const peakLocation = kdeData.x[maxDensityIndex];
        const peakDensity = kdeData.y[maxDensityIndex];

        stats.push(`Peak density location: ${peakLocation.toFixed(4)} (density: ${peakDensity.toFixed(4)})`);

        // Analyze distribution shape
        const meanX = kdeData.x.reduce((a, b) => a + b, 0) / kdeData.x.length;
        const variance = kdeData.x.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0) / kdeData.x.length;
        const stdDev = Math.sqrt(variance);

        stats.push(`Mean: ${meanX.toFixed(4)}, Standard Deviation: ${stdDev.toFixed(4)}`);

        // Detect distribution shape (simple heuristic)
        const peakCount = this.countPeaks(kdeData.y);
        if (peakCount === 1) {
            stats.push('Distribution shape: Unimodal (single peak)');
        } else if (peakCount === 2) {
            stats.push('Distribution shape: Bimodal (two peaks)');
        } else if (peakCount > 2) {
            stats.push(`Distribution shape: Multimodal (${peakCount} peaks)`);
        }

        // Concentration indicator
        const coefficientOfVariation = stdDev / meanX;
        if (coefficientOfVariation < 0.5) {
            stats.push('Concentration: High (low variance, concentrated distribution)');
        } else if (coefficientOfVariation < 1.0) {
            stats.push('Concentration: Moderate (moderate variance)');
        } else {
            stats.push('Concentration: Low (high variance, spread out distribution)');
        }

        return stats.join('\n');
    }

    /**
     * Count the number of peaks in a density distribution
     */
    private countPeaks(y: number[]): number {
        if (y.length < 3) return y.length;

        let peakCount = 0;
        const threshold = Math.max(...y) * 0.3; // Peaks must be at least 30% of max

        for (let i = 1; i < y.length - 1; i++) {
            if (y[i] > y[i - 1] && y[i] > y[i + 1] && y[i] > threshold) {
                peakCount++;
            }
        }

        return Math.max(1, peakCount); // At least one peak
    }

    /**
     * Calculate histogram distributions with 0.05 interval bins
     * Dynamically adjusts x-axis range based on actual data maximum
     */
    public calculateHistogramDistributions(analysisData: VaultAnalysisData): CentralityHistogramResult {
        // Extract centrality values
        const betweennessValues = this.extractCentralityValues(analysisData, 'betweennessCentrality');
        const closenessValues = this.extractCentralityValues(analysisData, 'closenessCentrality');
        const eigenvectorValues = this.extractCentralityValues(analysisData, 'eigenvectorCentrality');

        // Find maximum value across all centrality types
        const allValues = [...betweennessValues, ...closenessValues, ...eigenvectorValues];
        const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0;

        // Calculate a "nice" upper bound (round up to nearest 0.05 or 0.1)
        // Examples: 0.45 -> 0.50, 0.67 -> 0.70, 0.23 -> 0.25
        const calculateUpperBound = (max: number): number => {
            if (max <= 0) return 0.1; // Default minimum range
            if (max >= 1.0) return 1.0; // Cap at 1.0
            
            // Round up to nearest 0.05, but prefer 0.1 increments for cleaner labels
            const roundedTo05 = Math.ceil(max * 20) / 20; // Round to nearest 0.05
            const roundedTo10 = Math.ceil(max * 10) / 10; // Round to nearest 0.1
            
            // Prefer 0.1 increments if close, otherwise use 0.05
            if (roundedTo10 - max <= 0.05) {
                return roundedTo10;
            }
            return roundedTo05;
        };

        const upperBound = calculateUpperBound(maxValue);
        const binSize = 0.01; // Increased from 0.01 to 0.05 for wider bins
        const numBins = Math.ceil(upperBound / binSize);

        // Create bins up to the calculated upper bound
        const bins: HistogramBin[] = [];
        for (let i = 0; i < numBins; i++) {
            const min = i * binSize;
            const max = Math.min((i + 1) * binSize, upperBound);
            bins.push({
                range: `${min.toFixed(2)}-${max.toFixed(2)}`,
                min,
                max,
                betweenness: 0,
                closeness: 0,
                eigenvector: 0
            });
        }

        // Count values in each bin
        const countInBin = (value: number): number => {
            if (value < 0) return 0;
            if (value >= upperBound) return numBins - 1;
            return Math.min(Math.floor(value / binSize), numBins - 1);
        };

        betweennessValues.forEach(value => {
            const binIndex = countInBin(value);
            bins[binIndex].betweenness++;
        });

        closenessValues.forEach(value => {
            const binIndex = countInBin(value);
            bins[binIndex].closeness++;
        });

        eigenvectorValues.forEach(value => {
            const binIndex = countInBin(value);
            bins[binIndex].eigenvector++;
        });

        return {
            bins,
            totals: {
                betweenness: betweennessValues.length,
                closeness: closenessValues.length,
                eigenvector: eigenvectorValues.length
            },
            maxValue,
            upperBound
        };
    }

    /**
     * Generate comprehensive statistics for AI context
     * Includes basic stats, percentiles, distribution shape, KDE insights, and interpretation
     */
    public getComprehensiveStats(analysisData: VaultAnalysisData): string {
        const summaries: string[] = [];

        // Calculate KDE for peak detection
        const kdeResults = this.calculateKDEDistributions(analysisData);

        // Process each centrality type
        const centralityTypes = [
            { name: 'Betweenness', key: 'betweennessCentrality' as const, kdeData: kdeResults.betweenness },
            { name: 'Closeness', key: 'closenessCentrality' as const, kdeData: kdeResults.closeness },
            { name: 'Eigenvector', key: 'eigenvectorCentrality' as const, kdeData: kdeResults.eigenvector }
        ];

        for (const { name, key, kdeData } of centralityTypes) {
            summaries.push(`\n=== ${name} Centrality Analysis ===`);

            const values = this.extractCentralityValues(analysisData, key);

            if (values.length === 0) {
                summaries.push(`No ${name.toLowerCase()} centrality data available.`);
                continue;
            }

            // Basic Statistics
            const count = values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const mean = ss.mean(values);
            const median = ss.median(values);
            const stdDev = ss.standardDeviation(values);

            summaries.push(`Basic Stats: N=${count}, Mean=${mean.toFixed(4)}, Median=${median.toFixed(4)}, StdDev=${stdDev.toFixed(4)}`);
            summaries.push(`Range: Min=${min.toFixed(4)}, Max=${max.toFixed(4)}`);

            // Percentiles
            const percentiles = [10, 25, 50, 75, 90, 95];
            const sortedValues = values.slice().sort((a, b) => a - b);
            const percentileValues = percentiles.map(p => {
                try {
                    return ss.quantileSorted(sortedValues, p / 100);
                } catch {
                    return ss.quantile(values, p / 100);
                }
            });

            summaries.push(`Percentiles: P10=${percentileValues[0].toFixed(4)}, P25=${percentileValues[1].toFixed(4)}, P50=${percentileValues[2].toFixed(4)}, P75=${percentileValues[3].toFixed(4)}, P90=${percentileValues[4].toFixed(4)}, P95=${percentileValues[5].toFixed(4)}`);

            // Distribution Shape (Skewness and Kurtosis)
            let skewness: number;
            let kurtosis: number;
            try {
                skewness = ss.sampleSkewness(values);
                kurtosis = ss.sampleKurtosis(values);
            } catch {
                // Fallback calculation if simple-statistics doesn't support
                skewness = this.calculateSkewness(values, mean, stdDev);
                kurtosis = this.calculateKurtosis(values, mean, stdDev);
            }

            const skewnessDesc = skewness > 0.5 ? 'Right-skewed' : skewness < -0.5 ? 'Left-skewed' : 'Symmetric';
            const kurtosisDesc = kurtosis > 3 ? 'Heavy-tailed' : kurtosis < 3 ? 'Light-tailed' : 'Normal-tailed';

            summaries.push(`Distribution: ${skewnessDesc} (skewness=${skewness.toFixed(2)}), ${kurtosisDesc} (kurtosis=${kurtosis.toFixed(2)})`);

            // KDE Insights
            if (kdeData.x.length > 0 && kdeData.y.length > 0) {
                const maxDensityIndex = kdeData.y.indexOf(Math.max(...kdeData.y));
                const peakLocation = kdeData.x[maxDensityIndex];
                const peakCount = this.countPeaks(kdeData.y);
                const modality = peakCount === 1 ? 'unimodal' : peakCount === 2 ? 'bimodal' : `multimodal (${peakCount} peaks)`;
                summaries.push(`KDE Peak: ${peakLocation.toFixed(4)} (${modality})`);
            }

            // Interpretation
            const interpretation = this.generateInterpretation(name, mean, median, stdDev, skewness, percentileValues);
            summaries.push(`Interpretation: ${interpretation}`);
        }

        return summaries.join('\n');
    }

    /**
     * Calculate skewness manually
     */
    private calculateSkewness(values: number[], mean: number, stdDev: number): number {
        if (values.length < 3 || stdDev === 0) return 0;
        const n = values.length;
        const sum = values.reduce((acc, val) => {
            const diff = (val - mean) / stdDev;
            return acc + diff * diff * diff;
        }, 0);
        return (n / ((n - 1) * (n - 2))) * sum;
    }

    /**
     * Calculate kurtosis manually
     */
    private calculateKurtosis(values: number[], mean: number, stdDev: number): number {
        if (values.length < 4 || stdDev === 0) return 0;
        const n = values.length;
        const sum = values.reduce((acc, val) => {
            const diff = (val - mean) / stdDev;
            return acc + diff * diff * diff * diff;
        }, 0);
        return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    }

    /**
     * Generate plain language interpretation of centrality distribution
     * Always generates exactly 3 sentences for consistent length
     */
    private generateInterpretation(
        centralityName: string,
        mean: number,
        median: number,
        stdDev: number,
        skewness: number,
        percentiles: number[]
    ): string {
        const interpretations: string[] = [];

        // Centrality-specific context
        const centralityContext = {
            'Betweenness': 'bridges',
            'Closeness': 'foundations',
            'Eigenvector': 'authorities'
        };

        const context = centralityContext[centralityName as keyof typeof centralityContext] || 'nodes';

        // 1. Distribution concentration (always included)
        const coefficientOfVariation = stdDev / mean;
        if (coefficientOfVariation < 0.3) {
            interpretations.push(`Most notes have similar ${centralityName.toLowerCase()} scores (highly concentrated)`);
        } else if (coefficientOfVariation < 0.7) {
            interpretations.push(`Moderate variation in ${centralityName.toLowerCase()} scores`);
        } else {
            interpretations.push(`Wide variation in ${centralityName.toLowerCase()} scores (highly dispersed)`);
        }

        // 2. Skewness interpretation (always included with fallback)
        if (skewness > 1) {
            interpretations.push(`Most notes have low ${centralityName.toLowerCase()} (few high-value ${context})`);
        } else if (skewness < -1) {
            interpretations.push(`Most notes have high ${centralityName.toLowerCase()} (few low-value ${context})`);
        } else {
            // Fallback for balanced skewness
            interpretations.push(`Distribution shows balanced spread across score ranges`);
        }

        // 3. Percentile insights (always included with fallback)
        const p75 = percentiles[3];
        const p25 = percentiles[1];
        const iqr = p75 - p25;
        if (iqr < mean * 0.2) {
            interpretations.push(`Scores are tightly clustered around the median`);
        } else if (iqr > mean * 0.8) {
            interpretations.push(`Significant spread in scores, indicating diverse network roles`);
        } else {
            // Fallback for moderate IQR
            interpretations.push(`Score distribution shows moderate variability`);
        }

        return interpretations.join('. ') + '.';
    }

    /**
     * Generate structured statistics for UI display
     * Returns structured data instead of text string
     */
    public getStructuredStats(analysisData: VaultAnalysisData): StructuredCentralityStats {
        // Calculate KDE for peak detection
        const kdeResults = this.calculateKDEDistributions(analysisData);

        // Process each centrality type
        const centralityTypes = [
            { name: 'Betweenness', key: 'betweennessCentrality' as const, kdeData: kdeResults.betweenness, resultKey: 'betweenness' as const },
            { name: 'Closeness', key: 'closenessCentrality' as const, kdeData: kdeResults.closeness, resultKey: 'closeness' as const },
            { name: 'Eigenvector', key: 'eigenvectorCentrality' as const, kdeData: kdeResults.eigenvector, resultKey: 'eigenvector' as const }
        ];

        const result: StructuredCentralityStats = {
            betweenness: null,
            closeness: null,
            eigenvector: null
        };

        for (const { name, key, kdeData, resultKey } of centralityTypes) {
            // Count all notes with this metric (including zeros)
            const totalCount = this.countNotesWithMetric(analysisData, key);
            
            if (totalCount === 0) {
                continue; // Leave as null
            }

            // Extract all values (including zeros) for range calculation
            const allValues = this.extractCentralityValues(analysisData, key, true);
            
            // Extract filtered values (excluding zeros) for mean/median/stdDev calculations
            const values = this.extractCentralityValues(analysisData, key, false);

            // Basic Statistics
            // Use totalCount for N (all notes with metric)
            const count = totalCount;
            
            // Range should include zeros
            const min = allValues.length > 0 ? Math.min(...allValues) : 0;
            const max = allValues.length > 0 ? Math.max(...allValues) : 0;
            
            // Mean/Median/StdDev use filtered values (excluding zeros) for better statistical analysis
            const mean = values.length > 0 ? ss.mean(values) : 0;
            const median = values.length > 0 ? ss.median(values) : 0;
            const stdDev = values.length > 0 ? ss.standardDeviation(values) : 0;

            // Distribution Shape (Skewness)
            // Use filtered values for skewness calculation
            let skewness: number = 0;
            let skewnessDesc = 'Symmetric';
            if (values.length > 0) {
                try {
                    skewness = ss.sampleSkewness(values);
                } catch {
                    skewness = this.calculateSkewness(values, mean, stdDev);
                }
                skewnessDesc = skewness > 0.5 ? 'Right-skewed' : skewness < -0.5 ? 'Left-skewed' : 'Symmetric';
            }

            // KDE Modality
            let modality = 'unimodal';
            if (kdeData.x.length > 0 && kdeData.y.length > 0) {
                const peakCount = this.countPeaks(kdeData.y);
                modality = peakCount === 1 ? 'unimodal' : peakCount === 2 ? 'bimodal' : `multimodal (${peakCount} peaks)`;
            }

            // Percentiles for interpretation
            // Use filtered values for percentile calculation
            const percentiles = [10, 25, 50, 75, 90, 95];
            const percentileValues: number[] = [];
            if (values.length > 0) {
                const sortedValues = values.slice().sort((a, b) => a - b);
                percentileValues.push(...percentiles.map(p => {
                    try {
                        return ss.quantileSorted(sortedValues, p / 100);
                    } catch {
                        return ss.quantile(values, p / 100);
                    }
                }));
            } else {
                // If all values are zero, percentiles are all zero
                percentileValues.push(...percentiles.map(() => 0));
            }

            // Interpretation
            const interpretation = this.generateInterpretation(name, mean, median, stdDev, skewness, percentileValues);

            result[resultKey] = {
                name,
                count,
                mean,
                median,
                range: { min, max },
                distribution: skewnessDesc,
                modality,
                interpretation
            };
        }

        return result;
    }
}
