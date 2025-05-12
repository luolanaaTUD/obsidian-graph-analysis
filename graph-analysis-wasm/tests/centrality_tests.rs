mod common;

use approx::assert_relative_eq;
use graph_analysis_wasm::*;
use graph_analysis_wasm::models::Node;
use serde_json;

const EPSILON: f64 = 0.001;

#[test]
fn test_degree_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Expected degree centralities for our undirected test graph:
    // Each edge contributes to both nodes' degrees
    // A: connected to B and D -> 2/(4-1) ≈ 0.667
    // B: connected to A and C -> 2/(4-1) ≈ 0.667
    // C: connected to B and D -> 2/(4-1) ≈ 0.667
    // D: connected to A and C -> 2/(4-1) ≈ 0.667
    
    for node in result_value {
        assert_relative_eq!(node.centrality.degree.unwrap_or(0.0), 0.667, epsilon = EPSILON);
    }
}

#[test]
fn test_centrality_with_vault_graph() {
    // Create a simple vault with files and links
    let file1 = VaultFile {
        path: "note1.md".to_string(),
        content: "Links to [[note2]] and [[note3]]".to_string()
    };
    
    let file2 = VaultFile {
        path: "note2.md".to_string(),
        content: "Links to [[note3]]".to_string()
    };
    
    let file3 = VaultFile {
        path: "note3.md".to_string(),
        content: "No outgoing links".to_string()
    };
    
    let vault_data = VaultData {
        files: vec![file1, file2, file3]
    };
    
    // Build the graph
    let vault_json = serde_json::to_string(&vault_data).unwrap();
    build_graph_from_vault(&vault_json);
    
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
    common::create_test_graph_manager();
    
    let result = calculate_eigenvector_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 4);
    
    // In our undirected test graph:
    // All nodes have 2 connections each, forming a symmetric cycle
    // Therefore, all nodes should have equal eigenvector centrality
    
    let a = result_value.iter().find(|n| n.node_name == "A").unwrap();
    let b = result_value.iter().find(|n| n.node_name == "B").unwrap();
    let c = result_value.iter().find(|n| n.node_name == "C").unwrap();
    let d = result_value.iter().find(|n| n.node_name == "D").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(a_score), Some(b_score), Some(c_score), Some(d_score)) = (
        a.centrality.eigenvector,
        b.centrality.eigenvector,
        c.centrality.eigenvector,
        d.centrality.eigenvector,
    ) {
        // All nodes should have similar eigenvector centrality
        assert_relative_eq!(a_score, b_score, epsilon = EPSILON);
        assert_relative_eq!(b_score, c_score, epsilon = EPSILON);
        assert_relative_eq!(c_score, d_score, epsilon = EPSILON);
        
        // All values should be non-negative
        assert!(a_score >= 0.0);
        assert!(b_score >= 0.0);
        assert!(c_score >= 0.0);
        assert!(d_score >= 0.0);
    }
}

#[test]
fn test_betweenness_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_betweenness_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 4);
    
    // In our undirected test graph:
    // A --- B --- C
    // |           |
    // |           |
    // D -----------
    //
    // Path analysis:
    // A is on paths: B-A-D, C-A-D
    // B is on paths: A-B-C, D-B-C
    // C is on paths: A-C-D, B-C-D
    // D is on paths: A-D-C, B-D-C
    
    let a = result_value.iter().find(|n| n.node_name == "A").unwrap();
    let b = result_value.iter().find(|n| n.node_name == "B").unwrap();
    let c = result_value.iter().find(|n| n.node_name == "C").unwrap();
    let d = result_value.iter().find(|n| n.node_name == "D").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(a_score), Some(b_score), Some(c_score), Some(d_score)) = (
        a.centrality.betweenness,
        b.centrality.betweenness,
        c.centrality.betweenness,
        d.centrality.betweenness,
    ) {
        // All nodes should have similar betweenness in this symmetric graph
        assert_relative_eq!(a_score, b_score, epsilon = EPSILON);
        assert_relative_eq!(b_score, c_score, epsilon = EPSILON);
        assert_relative_eq!(c_score, d_score, epsilon = EPSILON);
        
        // All scores should be normalized and between 0 and 1
        assert!(a_score >= 0.0 && a_score <= 1.0);
        assert!(b_score >= 0.0 && b_score <= 1.0);
        assert!(c_score >= 0.0 && c_score <= 1.0);
        assert!(d_score >= 0.0 && d_score <= 1.0);
    }
}

#[test]
fn test_closeness_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_closeness_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 4);
    
    // In our undirected test graph:
    // A --- B --- C
    // |           |
    // |           |
    // D -----------
    //
    // All nodes have similar closeness due to the symmetric nature
    // Each node can reach all others in at most 2 steps

    let a = result_value.iter().find(|n| n.node_name == "A").unwrap();
    let b = result_value.iter().find(|n| n.node_name == "B").unwrap();
    let c = result_value.iter().find(|n| n.node_name == "C").unwrap();
    let d = result_value.iter().find(|n| n.node_name == "D").unwrap();
    
    // Check if we have valid centrality scores
    if let (Some(a_score), Some(b_score), Some(c_score), Some(d_score)) = (
        a.centrality.closeness,
        b.centrality.closeness,
        c.centrality.closeness,
        d.centrality.closeness,
    ) {
        // All nodes should have similar closeness
        assert_relative_eq!(a_score, c_score, epsilon = EPSILON);
        assert_relative_eq!(b_score, d_score, epsilon = EPSILON);
        
        // All values should be between 0 and 1
        assert!(a_score >= 0.0 && a_score <= 1.0);
        assert!(b_score >= 0.0 && b_score <= 1.0);
        assert!(c_score >= 0.0 && c_score <= 1.0);
        assert!(d_score >= 0.0 && d_score <= 1.0);
    }
} 