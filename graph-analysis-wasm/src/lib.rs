mod utils;

use wasm_bindgen::prelude::*;
use petgraph::graph::DiGraph;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[derive(Serialize, Deserialize)]
pub struct GraphData {
    nodes: Vec<String>,
    edges: Vec<(usize, usize)>,
}

#[derive(Serialize, Deserialize)]
pub struct CentralityResult {
    node_id: usize,
    node_name: String,
    score: f64,
}

// Error type for graph analysis operations
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

// Helper function to build the graph from input data
fn build_graph(graph_data: &GraphData) -> DiGraph<String, ()> {
    let mut graph = DiGraph::<String, ()>::new();
    
    // Add nodes to the graph
    let mut node_indices = Vec::new();
    for node_name in &graph_data.nodes {
        let node_idx = graph.add_node(node_name.clone());
        node_indices.push(node_idx);
    }
    
    // Add edges to the graph
    for (source, target) in &graph_data.edges {
        if *source < node_indices.len() && *target < node_indices.len() {
            graph.add_edge(node_indices[*source], node_indices[*target], ());
        }
    }
    
    graph
}

// Helper function to sort and format results
fn format_results(results: Vec<CentralityResult>) -> String {
    // Sort results by score in descending order
    let mut sorted_results = results;
    sorted_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Convert results to JSON
    match serde_json::to_string(&sorted_results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_degree_centrality(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let graph_data: GraphData = match serde_json::from_str(graph_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse graph data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Handle empty graph case
    if graph_data.nodes.is_empty() {
        return "[]".to_string();
    }
    
    // Create a directed graph
    let graph = build_graph(&graph_data);
    
    // Calculate degree centrality
    let mut results = Vec::with_capacity(graph_data.nodes.len());
    let node_count = graph_data.nodes.len();
    let normalization_factor = if node_count > 1 { (node_count - 1) as f64 } else { 1.0 };
    
    for (i, node_name) in graph_data.nodes.iter().enumerate() {
        let node_idx = graph.node_indices().nth(i).unwrap();
        
        // Count outgoing edges (out-degree)
        let out_degree = graph.edges_directed(node_idx, petgraph::Direction::Outgoing).count() as f64;
        
        // Count incoming edges (in-degree)
        let in_degree = graph.edges_directed(node_idx, petgraph::Direction::Incoming).count() as f64;
        
        // Total degree (sum of in-degree and out-degree)
        let total_degree = out_degree + in_degree;
        
        // Normalize by the maximum possible degree (n-1 where n is the number of nodes)
        let normalized_degree = total_degree / normalization_factor;
        
        results.push(CentralityResult {
            node_id: i,
            node_name: node_name.clone(),
            score: normalized_degree,
        });
    }
    
    format_results(results)
}

// Function to calculate eigenvector centrality (placeholder for future implementation)
#[wasm_bindgen]
pub fn calculate_eigenvector_centrality(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let graph_data: GraphData = match serde_json::from_str(graph_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse graph data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // TODO: Implement eigenvector centrality algorithm
    // For now, return the same as degree centrality
    calculate_degree_centrality(graph_data_json)
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, graph-analysis-wasm!");
}

// External function to show alerts (for debugging)
#[wasm_bindgen]
extern {
    fn alert(s: &str);
}
