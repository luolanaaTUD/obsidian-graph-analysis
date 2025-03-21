import { GraphData, CentralityResult } from '../types';

export class CentralityCalculator {
    private calculateDegreeCentrality?: (graphDataJson: string) => string;
    private maxCentralityScore: number = 1; // Store max centrality score

    constructor(calculateDegreeCentrality?: (graphDataJson: string) => string) {
        this.calculateDegreeCentrality = calculateDegreeCentrality;
    }

    public calculate(graphData: GraphData): CentralityResult[] {
        try {
            // Check if we have the WASM calculation function
            if (!this.calculateDegreeCentrality) {
                console.error('WASM centrality calculation function not available');
                return [];
            }
            
            // Call the WASM function to calculate degree centrality
            const graphDataJson = JSON.stringify(graphData);
            const resultsJson = this.calculateDegreeCentrality(graphDataJson);
            
            // Parse results
            const results = JSON.parse(resultsJson) as CentralityResult[];
            
            // Check for error
            if (results.length === 1 && 'error' in results[0]) {
                console.error('Error calculating centrality:', (results[0] as any).error);
                return [];
            }
            
            // Store the maximum score at calculation time
            if (results.length > 0) {
                this.maxCentralityScore = results.reduce((max, current) => 
                    current.score > max ? current.score : max, 0);
            }
            
            return results;
        } catch (error) {
            console.error('Error calculating centrality:', error);
            return [];
        }
    }
    
    public getMaxCentralityScore(): number {
        // Return the stored max score
        return this.maxCentralityScore > 0 ? this.maxCentralityScore : 1;
    }
}