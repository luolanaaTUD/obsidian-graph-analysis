use wasm_bindgen::prelude::*;
use rustworkx_core::petgraph::Direction;
use rustworkx_core::petgraph::visit::EdgeRef;
use rustworkx_core::centrality;

use crate::models::*;
use crate::graph_manager::{GRAPH_MANAGER, check_graph_initialized, initialize_from_vault};
use crate::utils;

// Helper function to sort and format results
fn format_results(mut results: Vec<Node>, is_sorting: bool, centrality_type: Option<&str>) -> String {
    if is_sorting {
        // Sort results by the specified centrality score in descending order
        results.sort_by(|a, b| {
            let (a_score, b_score) = match centrality_type {
                Some("degree") => (a.centrality.degree, b.centrality.degree),
                Some("eigenvector") => (a.centrality.eigenvector, b.centrality.eigenvector),
                Some("betweenness") => (a.centrality.betweenness, b.centrality.betweenness),
                Some("closeness") => (a.centrality.closeness, b.centrality.closeness),
                _ => {
                    // If no specific type is provided, use the first non-null score as before
                    (
                        a.centrality.degree
                            .or(a.centrality.eigenvector)
                            .or(a.centrality.betweenness)
                            .or(a.centrality.closeness),
                        b.centrality.degree
                            .or(b.centrality.eigenvector)
                            .or(b.centrality.betweenness)
                            .or(b.centrality.closeness)
                    )
                }
            };
            
            // Compare scores, defaulting to 0.0 if None
            let a_val = a_score.unwrap_or(0.0);
            let b_val = b_score.unwrap_or(0.0);
            b_val.partial_cmp(&a_val).unwrap_or(std::cmp::Ordering::Equal)
        });
    }
    
    // Convert results to JSON
    serde_json::to_string(&results).unwrap_or_else(|e| {
        let error = ErrorResponse { error: format!("Failed to serialize results: {}", e) };
        serde_json::to_string(&error).unwrap_or_else(|_| r#"{"error":"Failed to serialize error"}"#.to_string())
    })
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
    
    // Calculate degree centrality using rustworkx-core
    let centrality_scores = centrality::degree_centrality(&manager.graph,None);
    
    let mut results = Vec::new();
    
    // Create nodes with degree centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let node_idx = manager.graph.node_indices().nth(idx).unwrap();
        let degree_centrality = centrality_scores[node_idx.index()];
        
        let mut centrality = CentralityScores::default();
        centrality.degree = Some(degree_centrality);
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    format_results(results, true, Some("degree"))
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
    
    // Calculate eigenvector centrality using rustworkx-core
    // Use unit weights (1.0) for all edges, max_iter=100, tol=1e-6
    let centrality_result = centrality::eigenvector_centrality(
        &manager.graph,
        |_| Ok::<f64, String>(1.0),
        Some(100),
        Some(1e-6)
    );

    // Create nodes with eigenvector centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        
        // Get the centrality score if available
        if let Ok(Some(centrality_scores)) = &centrality_result {
            let node_idx = manager.graph.node_indices().nth(idx).unwrap();
            centrality.eigenvector = Some(centrality_scores[node_idx.index()]);
        }
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    format_results(results, true, Some("eigenvector"))
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
    
    // Calculate betweenness centrality using rustworkx-core
    // include_endpoints: true (count paths ending at each vertex)
    // normalized: true (normalize by (n-1)(n-2) for directed graphs)
    // parallel_threshold: 1000 (default)
    let centrality_scores = centrality::betweenness_centrality(
        &manager.graph,
        true,   // include endpoints
        true,   // normalize the results
        1000    // default parallel threshold
    );
    
    // Create nodes with betweenness centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        
        // Get the centrality score if available
        let node_idx = manager.graph.node_indices().nth(idx).unwrap();
        centrality.betweenness = centrality_scores[node_idx.index()];
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    format_results(results, true, Some("betweenness"))
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
    
    // Calculate closeness centrality using rustworkx-core
    // wf_improved: true for Wasserman and Faust's improved formula
    // This handles disconnected components and directed graphs better
    let centrality_scores = centrality::closeness_centrality(
        &manager.graph,
        true  // use improved formula for better handling of directed graphs
    );
    
    // Create nodes with closeness centrality scores
    for (idx, node_name) in manager.node_names.iter().enumerate() {
        let mut centrality = CentralityScores::default();
        
        // Get the centrality score if available
        let node_idx = manager.graph.node_indices().nth(idx).unwrap();
        centrality.closeness = centrality_scores[node_idx.index()];
        
        results.push(Node {
            node_id: idx,
            node_name: node_name.clone(),
            centrality,
        });
    }
    
    format_results(results, true, Some("closeness"))
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