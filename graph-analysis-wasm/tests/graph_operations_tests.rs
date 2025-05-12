mod common;

use graph_analysis_wasm::*;
use graph_analysis_wasm::models::{GraphMetadata, GraphNeighborsResult};
use serde_json;

#[test]
fn test_graph_metadata() {
    common::initialize_test_graph();
    
    let result = get_graph_metadata();
    let metadata: GraphMetadata = serde_json::from_str(&result).expect("Failed to parse graph metadata");
    
    assert_eq!(metadata.node_count, 3);
    assert_eq!(metadata.edge_count, 3);
    assert_eq!(metadata.max_degree, 2); // Each node has exactly 2 connections
    assert_eq!(metadata.avg_degree, 2.0);
    assert!(!metadata.is_directed);
}

#[test]
fn test_neighbors() {
    common::initialize_test_graph();
    
    // Test note1's neighbors (should be note2 and note3 in undirected graph)
    let result = get_node_neighbors_cached(0);
    println!("Neighbors JSON: {}", result);
    
    // Parse and verify the structure
    let neighbors_result: GraphNeighborsResult = serde_json::from_str(&result).expect("Failed to parse neighbors result");
    
    // Verify the node properties
    assert_eq!(neighbors_result.node_id, 0);
    assert_eq!(neighbors_result.node_name, "note1.md");
    
    // Verify we have 2 neighbors
    assert_eq!(neighbors_result.neighbors.len(), 2);
    
    // Check that the neighbors have the right properties
    let neighbor_names: Vec<&str> = neighbors_result.neighbors.iter()
        .map(|n| n.node_name.as_str())
        .collect();
    
    assert!(neighbor_names.contains(&"note2.md"));
    assert!(neighbor_names.contains(&"note3.md"));
}

// #[test]
// fn test_build_graph_from_vault() {
//     // Initialize the test graph
//     common::initialize_test_graph();
    
//     // Verify the graph is stored in the manager with correct properties
//     let metadata_result = get_graph_metadata();
//     let metadata: GraphMetadata = serde_json::from_str(&metadata_result).unwrap_or_else(|e| {
//         panic!("Failed to parse metadata: {}. Raw metadata: {}", e, metadata_result);
//     });
    
//     assert_eq!(metadata.node_count, 3, "Expected 3 nodes, got {}", metadata.node_count);
//     assert_eq!(metadata.edge_count, 3, "Expected 3 edges, got {}", metadata.edge_count);
//     assert!(!metadata.is_directed);
    
//     // Test that we can get neighbors for each node
//     for node_id in 0..3 {
//         let neighbor_result = get_node_neighbors_cached(node_id);
//         let neighbors: GraphNeighborsResult = serde_json::from_str(&neighbor_result).unwrap_or_else(|e| {
//             panic!("Failed to parse neighbors for node {}: {}. Raw result: {}", node_id, e, neighbor_result);
//         });
        
//         // Each node should have 2 neighbors in our test graph
//         assert_eq!(neighbors.neighbors.len(), 2, 
//             "Node {} should have 2 neighbors, got {}", node_id, neighbors.neighbors.len());
//     }
// }

// #[test]
// fn test_graph_clear() {
//     common::initialize_test_graph();
    
//     // Get metadata before clearing to verify we have a graph
//     let before_result = get_graph_metadata();
//     let before_metadata: GraphMetadata = serde_json::from_str(&before_result).unwrap();
//     assert_eq!(before_metadata.node_count, 3);
//     assert!(!before_metadata.is_directed);
    
//     // Clear the graph
//     let result = clear_graph();
//     let status: serde_json::Value = serde_json::from_str(&result).unwrap();
//     assert_eq!(status["status"], "success");
    
//     // Verify graph is cleared by trying to get metadata
//     let result = get_graph_metadata();
//     assert!(result.contains("error"));
// } 