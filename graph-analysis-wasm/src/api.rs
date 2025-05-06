use wasm_bindgen::prelude::*;
use rustworkx_core::petgraph::Direction;
use rustworkx_core::petgraph::visit::EdgeRef;

use crate::models::*;
use crate::graph_manager::{GRAPH_MANAGER, check_graph_initialized, initialize_from_vault};
use crate::utils;

// Helper function to sort and format results
fn format_results(results: Vec<Node>) -> String {
    // Sort results by centrality score in descending order
    // We need to find the non-null centrality score to use for sorting
    let mut sorted_results = results;
    sorted_results.sort_by(|a, b| {
        let a_score = a.centrality.degree
            .or(a.centrality.eigenvector)
            .or(a.centrality.betweenness)
            .or(a.centrality.closeness)
            .unwrap_or(0.0);
        let b_score = b.centrality.degree
            .or(b.centrality.eigenvector)
            .or(b.centrality.betweenness)
            .or(b.centrality.closeness)
            .unwrap_or(0.0);
        
        b_score.partial_cmp(&a_score).unwrap_or(std::cmp::Ordering::Equal)
    });
    
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
    
    // Use GraphManager to initialize from vault files
    match initialize_from_vault(&vault_data.files) {
        Ok(graph_data) => {
            // Return the graph data as JSON
            match serde_json::to_string(&graph_data) {
                Ok(json) => json,
                Err(e) => {
                    let error = ErrorResponse { error: format!("Failed to serialize graph data: {}", e) };
                    serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
                }
            }
        },
        Err(e) => {
            let error = ErrorResponse { error: e };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
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
    
    // Add outgoing and incoming neighbors
    let mut processed_neighbors = std::collections::HashSet::new();
    
    // Add outgoing neighbors
    for edge in manager.graph.edges_directed(node_idx, Direction::Outgoing) {
        let target_idx = manager.graph.node_indices().position(|id| id == edge.target()).unwrap();
        
        if !processed_neighbors.contains(&target_idx) {
            processed_neighbors.insert(target_idx);
            
            neighbors.push(Node {
                node_id: target_idx,
                node_name: manager.node_names[target_idx].clone(),
                centrality: CentralityScores::default(),
            });
        }
    }
    
    // Add incoming neighbors
    for edge in manager.graph.edges_directed(node_idx, Direction::Incoming) {
        let source_idx = manager.graph.node_indices().position(|id| id == edge.source()).unwrap();
        
        if !processed_neighbors.contains(&source_idx) {
            processed_neighbors.insert(source_idx);
            
            neighbors.push(Node {
                node_id: source_idx,
                node_name: manager.node_names[source_idx].clone(),
                centrality: CentralityScores::default(),
            });
        }
    }
    
    // Create the result structure
    let result = GraphNeighborsResult {
        node_id,
        node_name: manager.node_names[node_id].clone(),
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
        
        // Create centrality scores with degree value
        let mut centrality = CentralityScores::default();
        centrality.degree = Some(degree_centrality);
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    // Return the results directly without sorting to avoid potential issues
    match serde_json::to_string(&results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_eigenvector_centrality_cached() -> String {
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
    
    // This is a simplified implementation of eigenvector centrality
    // A full implementation would use power iteration
    // But for now we'll use a simplified calculation for demonstration
    let node_count = manager.graph.node_count();
    
    // Default score for each node (will be refined in a real implementation)
    let default_score = 1.0 / node_count as f64;
    
    // Create nodes with eigenvector centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        centrality.eigenvector = Some(default_score);
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    // Return the results directly without sorting to avoid potential issues
    match serde_json::to_string(&results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_betweenness_centrality_cached() -> String {
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
    
    // This is a simplified implementation of betweenness centrality
    // A full implementation would compute all shortest paths
    // But for now we'll use a simplified calculation for demonstration
    let node_count = manager.graph.node_count();
    
    // Default score for each node (will be refined in a real implementation)
    let default_score = 1.0 / node_count as f64;
    
    // Create nodes with betweenness centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        centrality.betweenness = Some(default_score);
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    // Return the results directly without sorting to avoid potential issues
    match serde_json::to_string(&results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
            serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
        }
    }
}

#[wasm_bindgen]
pub fn calculate_closeness_centrality_cached() -> String {
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
    
    // This is a simplified implementation of closeness centrality
    // A full implementation would compute shortest path distances
    // But for now we'll use a simplified calculation for demonstration
    let node_count = manager.graph.node_count();
    
    // Default score for each node (will be refined in a real implementation)
    let default_score = 1.0 / node_count as f64;
    
    // Create nodes with closeness centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        centrality.closeness = Some(default_score);
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    // Return the results directly without sorting to avoid potential issues
    match serde_json::to_string(&results) {
        Ok(json) => json,
        Err(e) => {
            let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
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