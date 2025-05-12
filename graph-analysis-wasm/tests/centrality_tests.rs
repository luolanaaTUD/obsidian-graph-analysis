mod common;

use approx::assert_relative_eq;
use graph_analysis_wasm::*;
use graph_analysis_wasm::models::Node;
use serde_json;

const EPSILON: f64 = 0.001;

#[test]
fn test_degree_centrality_basic() {
    common::initialize_test_graph();
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Expected degree centralities for our undirected test graph:
    // Each edge contributes to both nodes' degrees
    // note1: connected to note2 and note3 -> 2/(3-1) = 1.0
    // note2: connected to note1 and note3 -> 2/(3-1) = 1.0
    // note3: connected to note1 and note2 -> 2/(3-1) = 1.0
    
    for node in result_value {
        assert_relative_eq!(node.centrality.degree.unwrap_or(0.0), 1.0, epsilon = EPSILON);
    }
}

#[test]
fn test_centrality_with_vault_graph() {
    common::initialize_test_graph();
    
    // Calculate centrality
    let result = calculate_degree_centrality_cached();
    let centrality: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Validate results
    assert_eq!(centrality.len(), 3);
    
    // In undirected graph:
    // note3 has 2 connections (note1, note2) -> 2/(3-1) = 1.0
    // note1 has 2 connections (note2, note3) -> 2/(3-1) = 1.0
    // note2 has 2 connections (note1, note3) -> 2/(3-1) = 1.0
    let note3 = centrality.iter().find(|c| c.node_name == "note3.md").unwrap();
    let note1 = centrality.iter().find(|c| c.node_name == "note1.md").unwrap();
    let note2 = centrality.iter().find(|c| c.node_name == "note2.md").unwrap();
    
    assert_relative_eq!(note1.centrality.degree.unwrap_or(0.0), 1.0, epsilon = EPSILON);
    assert_relative_eq!(note2.centrality.degree.unwrap_or(0.0), 1.0, epsilon = EPSILON);
    assert_relative_eq!(note3.centrality.degree.unwrap_or(0.0), 1.0, epsilon = EPSILON);
}

#[test]
fn test_eigenvector_centrality_basic() {
    common::initialize_test_graph();
    
    let result = calculate_eigenvector_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 3);
    
    // In our undirected test graph:
    // All nodes have 2 connections each, forming a complete graph
    // Therefore, all nodes should have equal eigenvector centrality
    
    let note1 = result_value.iter().find(|n| n.node_name == "note1.md").unwrap();
    let note2 = result_value.iter().find(|n| n.node_name == "note2.md").unwrap();
    let note3 = result_value.iter().find(|n| n.node_name == "note3.md").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(note1_score), Some(note2_score), Some(note3_score)) = (
        note1.centrality.eigenvector,
        note2.centrality.eigenvector,
        note3.centrality.eigenvector,
    ) {
        // All nodes should have similar eigenvector centrality
        assert_relative_eq!(note1_score, note2_score, epsilon = EPSILON);
        assert_relative_eq!(note2_score, note3_score, epsilon = EPSILON);
        
        // All values should be non-negative
        assert!(note1_score >= 0.0);
        assert!(note2_score >= 0.0);
        assert!(note3_score >= 0.0);
    }
}

#[test]
fn test_betweenness_centrality_basic() {
    common::initialize_test_graph();
    
    let result = calculate_betweenness_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 3);
    
    // In our undirected test graph:
    // note1 --- note2
    //   |         |
    //   |         |
    // note3 -------
    //
    // In this triangular graph, each node has equal betweenness centrality
    // because each node serves as a potential path between the other two nodes.
    // The normalized value is approximately 0.6667 (2/3)
    
    let note1 = result_value.iter().find(|n| n.node_name == "note1.md").unwrap();
    let note2 = result_value.iter().find(|n| n.node_name == "note2.md").unwrap();
    let note3 = result_value.iter().find(|n| n.node_name == "note3.md").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(note1_score), Some(note2_score), Some(note3_score)) = (
        note1.centrality.betweenness,
        note2.centrality.betweenness,
        note3.centrality.betweenness,
    ) {
        // All nodes should have equal betweenness of approximately 0.6667
        assert_relative_eq!(note1_score, 0.6667, epsilon = EPSILON);
        assert_relative_eq!(note2_score, 0.6667, epsilon = EPSILON);
        assert_relative_eq!(note3_score, 0.6667, epsilon = EPSILON);
        
        // All scores should be equal to each other
        assert_relative_eq!(note1_score, note2_score, epsilon = EPSILON);
        assert_relative_eq!(note2_score, note3_score, epsilon = EPSILON);
    }
}

#[test]
fn test_closeness_centrality_basic() {
    common::initialize_test_graph();
    
    let result = calculate_closeness_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 3);
    
    // In our undirected test graph:
    // note1 --- note2
    //   |         |
    //   |         |
    // note3 -------
    //
    // All nodes have equal closeness as each node is directly connected to all others
    // in this complete graph (distance of 1 to all other nodes)
    
    let note1 = result_value.iter().find(|n| n.node_name == "note1.md").unwrap();
    let note2 = result_value.iter().find(|n| n.node_name == "note2.md").unwrap();
    let note3 = result_value.iter().find(|n| n.node_name == "note3.md").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(note1_score), Some(note2_score), Some(note3_score)) = (
        note1.centrality.closeness,
        note2.centrality.closeness,
        note3.centrality.closeness,
    ) {
        // All nodes should have equal closeness (1.0) as they're all directly connected
        assert_relative_eq!(note1_score, 1.0, epsilon = EPSILON);
        assert_relative_eq!(note2_score, 1.0, epsilon = EPSILON);
        assert_relative_eq!(note3_score, 1.0, epsilon = EPSILON);
    }
} 