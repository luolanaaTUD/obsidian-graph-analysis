mod utils;

use wasm_bindgen::prelude::*;
use petgraph::graph::{DiGraph, NodeIndex};
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

#[derive(Serialize, Deserialize)]
pub struct VaultFile {
    path: String,
    content: String,
}

#[derive(Serialize, Deserialize)]
pub struct VaultData {
    files: Vec<VaultFile>,
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

// Function to calculate eigenvector centrality using power iteration method
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
    
    // Handle empty graph case
    if graph_data.nodes.is_empty() {
        return "[]".to_string();
    }
    
    // Create a directed graph
    let graph = build_graph(&graph_data);
    
    // Number of nodes
    let n = graph.node_count();
    
    // Initialize the eigenvector centrality scores
    let mut centrality_scores = vec![1.0 / (n as f64); n];
    
    // Power iteration parameters
    const MAX_ITERATIONS: usize = 100;
    const TOLERANCE: f64 = 1e-6;
    
    // Perform power iteration to compute eigenvector centrality
    for _ in 0..MAX_ITERATIONS {
        let mut new_scores = vec![0.0; n];
        
        // Update each node's score based on its neighbors
        for (node_idx, node_id) in graph.node_indices().enumerate() {
            // Get all incoming neighbors
            for edge in graph.edges_directed(node_id, petgraph::Direction::Incoming) {
                let source_idx = graph.node_indices().position(|id| id == edge.source()).unwrap();
                new_scores[node_idx] += centrality_scores[source_idx];
            }
        }
        
        // Normalize the new scores
        let norm: f64 = new_scores.iter().map(|&x| x * x).sum::<f64>().sqrt();
        if norm > 0.0 {
            for score in &mut new_scores {
                *score /= norm;
            }
        }
        
        // Check for convergence
        let diff: f64 = centrality_scores.iter().zip(new_scores.iter())
            .map(|(&old, &new)| (old - new).abs())
            .sum();
        
        // Update the scores
        centrality_scores = new_scores;
        
        if diff < TOLERANCE {
            break;
        }
    }
    
    // Create results
    let mut results = Vec::with_capacity(n);
    for (i, node_name) in graph_data.nodes.iter().enumerate() {
        results.push(CentralityResult {
            node_id: i,
            node_name: node_name.clone(),
            score: centrality_scores[i],
        });
    }
    
    format_results(results)
}

// Build a graph from vault data (files and their content)
#[wasm_bindgen]
pub fn build_graph_from_vault(vault_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let vault_data: VaultData = match serde_json::from_str(vault_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse vault data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Extract files and create nodes
    let files = &vault_data.files;
    let mut nodes: Vec<String> = Vec::with_capacity(files.len());
    let mut node_map: HashMap<String, usize> = HashMap::with_capacity(files.len());
    let mut edges: Vec<(usize, usize)> = Vec::new();
    
    // Create nodes
    for file in files {
        let node_id = nodes.len();
        nodes.push(file.path.clone());
        node_map.insert(file.path.clone(), node_id);
    }
    
    // Extract links and create edges
    for file in files {
        let source_id = *node_map.get(&file.path).unwrap();
        
        // Use regex to extract Obsidian links [[...]]
        let link_regex = regex::Regex::new(r"\[\[([^\]]+?)\]\]").unwrap();
        
        for capture in link_regex.captures_iter(&file.content) {
            let mut link_path = capture.get(1).unwrap().as_str().to_string();
            
            // Handle aliases in links
            if link_path.contains('|') {
                link_path = link_path.split('|').next().unwrap().to_string();
            }
            
            // Try to resolve the link to a file
            // This is simplified - in the real implementation we'd need to
            // resolve paths fully like Obsidian does
            
            // Try exact path match
            if node_map.contains_key(&link_path) {
                let target_id = *node_map.get(&link_path).unwrap();
                edges.push((source_id, target_id));
            } 
            // Try with .md extension
            else if node_map.contains_key(&format!("{}.md", link_path)) {
                let target_id = *node_map.get(&format!("{}.md", link_path)).unwrap();
                edges.push((source_id, target_id));
            }
            // Try other path resolution approaches here
        }
    }
    
    // Create the graph data structure
    let graph_data = GraphData { nodes, edges };
    
    // Convert to JSON
    match serde_json::to_string(&graph_data) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize graph data: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

// Calculate betweenness centrality
#[wasm_bindgen]
pub fn calculate_betweenness_centrality(graph_data_json: &str) -> String {
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
    
    // Number of nodes
    let n = graph.node_count();
    
    // Initialize betweenness scores
    let mut betweenness_scores = vec![0.0; n];
    
    // For each node as a source
    for s in 0..n {
        let source = graph.node_indices().nth(s).unwrap();
        
        // BFS data structures
        let mut queue = std::collections::VecDeque::new();
        let mut stack = Vec::new();
        let mut dist = vec![std::f64::INFINITY; n];
        let mut sigma = vec![0.0; n];
        let mut pred: Vec<Vec<usize>> = vec![Vec::new(); n];
        
        // Initialize
        dist[s] = 0.0;
        sigma[s] = 1.0;
        queue.push_back(s);
        
        // BFS to find shortest paths
        while let Some(v) = queue.pop_front() {
            let v_node = graph.node_indices().nth(v).unwrap();
            stack.push(v);
            
            // For each neighbor of v
            for edge in graph.edges_directed(v_node, petgraph::Direction::Outgoing) {
                let w_node = edge.target();
                let w = graph.node_indices().position(|id| id == w_node).unwrap();
                
                // Path discovery
                if dist[w] == std::f64::INFINITY {
                    dist[w] = dist[v] + 1.0;
                    queue.push_back(w);
                }
                
                // Path counting
                if dist[w] == dist[v] + 1.0 {
                    sigma[w] += sigma[v];
                    pred[w].push(v);
                }
            }
        }
        
        // Dependency accumulation
        let mut delta = vec![0.0; n];
        
        // Bottom-up stack processing
        while let Some(w) = stack.pop() {
            if w != s {
                // For each predecessor
                for v in &pred[w] {
                    let coeff = (sigma[*v] / sigma[w]) * (1.0 + delta[w]);
                    delta[*v] += coeff;
                }
                betweenness_scores[w] += delta[w];
            }
        }
    }
    
    // Normalize scores
    let normalization_factor = ((n-1) * (n-2)) as f64;
    if normalization_factor > 0.0 {
        for score in &mut betweenness_scores {
            *score /= normalization_factor;
        }
    }
    
    // Create results
    let mut results = Vec::with_capacity(n);
    for (i, node_name) in graph_data.nodes.iter().enumerate() {
        results.push(CentralityResult {
            node_id: i,
            node_name: node_name.clone(),
            score: betweenness_scores[i],
        });
    }
    
    format_results(results)
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
