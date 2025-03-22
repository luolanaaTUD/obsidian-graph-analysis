import { App, TFile } from 'obsidian';
import * as d3 from 'd3';

export interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    path?: string;
    centralityScore?: number;
    degree?: number;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    source: string;
    target: string;
}

export interface GraphData {
    nodes: string[];
    edges: [number, number][];
}

export interface CentralityResult {
    node_id: number;
    node_name: string;
    score: number;
}

// Type for centrality calculation function
export type CentralityCalculator = (graphDataJson: string) => string;