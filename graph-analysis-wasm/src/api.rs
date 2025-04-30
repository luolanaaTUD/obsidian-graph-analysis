use wasm_bindgen::prelude::*;
use rustworkx_core::petgraph::Direction;
use rustworkx_core::petgraph::visit::EdgeRef;
use std::collections::HashMap;
use regex;

use crate::models::*;
use crate::graph_manager::{GRAPH_MANAGER, GraphManager, build_graph, check_graph_initialized};
use crate::utils;

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
pub fn initialize_graph(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Parse the input JSON
    let graph_data: GraphData = match serde_json::from_str(graph_data_json) {
        Ok(data) => data,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to parse graph data: {}", e) };
            return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
        }
    };
    
    // Build the graph
    let graph = build_graph(&graph_data);
    
    // Store the graph and node names in the manager
    let manager = GraphManager {
        graph,
        node_names: graph_data.nodes.clone(),
    };
    
    // Store in global state
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = Some(manager);
    
    // Return success message
    let result = serde_json::json!({
        "status": "success",
        "node_count": graph_data.nodes.len(),
        "edge_count": graph_data.edges.len()
    });
    
    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"status":"error","message":"Failed to serialize status"}"#.to_string())
}

#[wasm_bindgen]
pub fn clear_graph() -> String {
    let mut graph_manager = GRAPH_MANAGER.lock().unwrap();
    *graph_manager = None;
    
    let result = serde_json::json!({
        "status": "success",
        "message": "Graph cleared from memory"
    });
    
    serde_json::to_string(&result).unwrap_or_else(|_| r#"{"status":"error","message":"Failed to serialize status"}"#.to_string())
}

#[wasm_bindgen]
pub fn get_node_neighbors_cached(node_id: usize) -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get access to the graph
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    // Error handling for invalid node ID
    if node_id >= manager.graph.node_count() {
        let error = ErrorResponse { error: format!("Invalid node ID: {}", node_id) };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get node index
    let node_idx = manager.graph.node_indices().nth(node_id).unwrap();
    
    let mut neighbors = Vec::new();
    
    // Add outgoing neighbors
    for edge in manager.graph.edges_directed(node_idx, Direction::Outgoing) {
        let target_idx = manager.graph.node_indices().position(|id| id == edge.target()).unwrap();
        neighbors.push(NeighborInfo {
            base: BaseNode {
                node_id: target_idx,
                node_name: manager.node_names[target_idx].clone(),
            },
        });
    }
    
    // Add incoming neighbors
    for edge in manager.graph.edges_directed(node_idx, Direction::Incoming) {
        let source_idx = manager.graph.node_indices().position(|id| id == edge.source()).unwrap();
        neighbors.push(NeighborInfo {
            base: BaseNode {
                node_id: source_idx,
                node_name: manager.node_names[source_idx].clone(),
            },
        });
    }
    
    // Create the result structure
    let result = GraphNeighborsResult {
        base: BaseNode {
            node_id,
            node_name: manager.node_names[node_id].clone(),
        },
        neighbors,
    };
    
    // Convert to JSON
    match serde_json::to_string(&result) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_degree_centrality_cached() -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get access to the graph
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    let mut results = Vec::new();
    let node_count = manager.graph.node_count() as f64;
    
    // Calculate degree centrality for each node
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let node_idx = manager.graph.node_indices().nth(idx).unwrap();
        
        // Calculate out-degree and in-degree
        let out_degree = manager.graph.edges_directed(node_idx, Direction::Outgoing).count() as f64;
        
        // For directed graphs, we also consider in-degree
        let in_degree = manager.graph.edges_directed(node_idx, Direction::Incoming).count() as f64;
        
        // Calculate normalized degree centrality
        let degree_centrality = if node_count > 1.0 {
            (out_degree + in_degree) / (2.0 * (node_count - 1.0))
        } else {
            0.0
        };
        
        results.push(CentralityResult {
            base: BaseNode {
                node_id: idx,
                node_name: node_name.clone(),
            },
            score: degree_centrality,
        });
    }
    
    format_results(results)
}

#[wasm_bindgen]
pub fn get_graph_metadata() -> String {
    utils::set_panic_hook();
    
    // Check if graph is initialized
    if let Err(error_msg) = check_graph_initialized() {
        let error = ErrorResponse { error: error_msg };
        return serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string());
    }
    
    // Get graph info
    let graph_manager = GRAPH_MANAGER.lock().unwrap();
    let manager = graph_manager.as_ref().unwrap();
    
    let node_count = manager.graph.node_count();
    let edge_count = manager.graph.edge_count();
    
    // Calculate basic stats
    let mut max_degree = 0;
    let mut total_degree = 0;
    
    for node_idx in manager.graph.node_indices() {
        let out_degree = manager.graph.edges_directed(node_idx, Direction::Outgoing).count();
        let in_degree = manager.graph.edges_directed(node_idx, Direction::Incoming).count();
        let degree = out_degree + in_degree;
        
        max_degree = std::cmp::max(max_degree, degree);
        total_degree += degree;
    }
    
    let avg_degree = if node_count > 0 { total_degree as f64 / node_count as f64 } else { 0.0 };
    
    // Create metadata object
    let metadata = GraphMetadata {
        node_count,
        edge_count,
        max_degree,
        avg_degree,
        is_directed: true, // DiGraph is always directed
    };
    
    // Serialize
    match serde_json::to_string(&metadata) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize metadata: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_degree_centrality(graph_data_json: &str) -> String {
    utils::set_panic_hook();
    
    // Try to initialize the cached graph with the provided data
    let init_result = initialize_graph(graph_data_json);
    if !init_result.contains("success") {
        return init_result; // Return the error from initialization
    }
    
    // Use the cached version
    calculate_degree_centrality_cached()
}

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
    
    // Initialize the cached graph with this data
    initialize_graph(&serde_json::to_string(&graph_data).unwrap_or_default());
    
    // Convert to JSON
    match serde_json::to_string(&graph_data) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize graph data: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
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