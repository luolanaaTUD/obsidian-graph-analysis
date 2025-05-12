mod common;

use graph_analysis_wasm::*;
use serde_json;

#[test]
fn test_graph_metadata() {
    common::create_test_graph_manager();
    
    let result = get_graph_metadata();
    let metadata: GraphMetadata = serde_json::from_str(&result).unwrap();
    
    assert_eq!(metadata.node_count, 4);
    assert_eq!(metadata.edge_count, 4);
    assert_eq!(metadata.max_degree, 2); // Each node has exactly 2 connections
    assert_eq!(metadata.avg_degree, 2.0);
    assert!(!metadata.is_directed);
}

#[test]
fn test_neighbors() {
    common::create_test_graph_manager();
    
    // Test A's neighbors (should be B and D in undirected graph)
    let result = get_node_neighbors_cached(0);
    println!("Neighbors JSON: {}", result);
    
    // Parse and verify the structure
    let neighbors_result: GraphNeighborsResult = serde_json::from_str(&result).unwrap();
    
    // Verify the node properties
    assert_eq!(neighbors_result.node_id, 0);
    assert_eq!(neighbors_result.node_name, "A");
    
    // Verify we have 2 neighbors (B and D)
    assert_eq!(neighbors_result.neighbors.len(), 2);
    
    // Check that the neighbors have the right properties
    let neighbor_names: Vec<&str> = neighbors_result.neighbors.iter()
        .map(|n| n.node_name.as_str())
        .collect();
    
    assert!(neighbor_names.contains(&"B"));
    assert!(neighbor_names.contains(&"D"));
}

#[test]
fn test_build_graph_from_vault() {
    // Create a simple vault with two files and a link between them
    let file1 = VaultFile {
        path: "note1.md".to_string(),
        content: "This is a note with a [[note2]] link.".to_string()
    };
    
    let file2 = VaultFile {
        path: "note2.md".to_string(),
        content: "This is the second note.".to_string()
    };
    
    let vault_data = VaultData {
        files: vec![file1, file2]
    };
    
    let vault_json = serde_json::to_string(&vault_data).unwrap();
    let result = build_graph_from_vault(&vault_json);
    
    // Parse the result and check it
    let graph_data: GraphData = serde_json::from_str(&result).unwrap();
    
    assert_eq!(graph_data.nodes.len(), 2);
    assert_eq!(graph_data.edges.len(), 1);
    assert_eq!(graph_data.edges[0], (0, 1)); // note1 - note2 (undirected)
    
    // Verify the graph is stored in the manager
    let metadata_result = get_graph_metadata();
    let metadata: GraphMetadata = serde_json::from_str(&metadata_result).unwrap();
    
    assert_eq!(metadata.node_count, 2);
    assert_eq!(metadata.edge_count, 1);
    assert!(!metadata.is_directed);
}

#[test]
fn test_graph_clear() {
    common::create_test_graph_manager();
    
    // Get metadata before clearing to verify we have a graph
    let before_result = get_graph_metadata();
    let before_metadata: GraphMetadata = serde_json::from_str(&before_result).unwrap();
    assert_eq!(before_metadata.node_count, 4);
    assert!(!before_metadata.is_directed);
    
    // Clear the graph
    let result = clear_graph();
    let status: serde_json::Value = serde_json::from_str(&result).unwrap();
    assert_eq!(status["status"], "success");
    
    // Verify graph is cleared by trying to get metadata
    let result = get_graph_metadata();
    assert!(result.contains("error"));
} 