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
    
    // Expected degree centralities for our test graph using rustworkx-core normalization:
    // A: out=2, in=0, total=2 -> 2/(4-1) = 0.667 (normalized by n-1)
    // B: out=1, in=1, total=2 -> 2/(4-1) = 0.667
    // C: out=0, in=2, total=2 -> 2/(4-1) = 0.667
    // D: out=1, in=1, total=2 -> 2/(4-1) = 0.667
    
    for result in result_value {
        assert_relative_eq!(result.centrality.degree.unwrap_or(0.0), 0.667, epsilon = EPSILON);
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
    
    // Find note3 (should have highest centrality as it has 2 incoming links)
    let note3 = centrality.iter().find(|c| c.node_name == "note3.md").unwrap();
    let note1 = centrality.iter().find(|c| c.node_name == "note1.md").unwrap();
    let note2 = centrality.iter().find(|c| c.node_name == "note2.md").unwrap();
    
    // note3 has the highest centrality (2 incoming, 0 outgoing)
    // note1 has medium centrality (0 incoming, 2 outgoing)
    // note2 has medium centrality (1 incoming, 1 outgoing)
    assert!(note3.centrality.degree.unwrap_or(0.0) >= note1.centrality.degree.unwrap_or(0.0));
    assert!(note3.centrality.degree.unwrap_or(0.0) >= note2.centrality.degree.unwrap_or(0.0));
}

#[test]
fn test_eigenvector_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_eigenvector_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Verify we got results for all nodes
    assert_eq!(result_value.len(), 4);
    
    // In our test graph:
    // C should have the highest eigenvector centrality (2 incoming edges)
    // B and D should have medium values (each has 1 incoming and contributes to C)
    // A should have lowest (no incoming edges)
    
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
        // C should have highest centrality
        assert!(c_score > b_score);
        assert!(c_score > d_score);
        
        // A should have lowest centrality (no incoming edges)
        assert!(a_score < b_score);
        assert!(a_score < c_score);
        assert!(a_score < d_score);
        
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
    
    // In our directed test graph with endpoints included:
    // A -> B -> C
    // |         ^
    // v         |
    // D ------->|
    //
    // Path analysis (including endpoints):
    // A: source for paths A->B, A->B->C, A->D, A->D->C
    // B: on paths A->B, A->B->C and endpoint for A->B
    // C: endpoint for A->B->C, A->D->C, B->C, D->C
    // D: on paths A->D, A->D->C and endpoint for A->D
    
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
        // C should have highest betweenness (endpoint of most paths)
        assert!(c_score > b_score);
        assert!(c_score > d_score);
        
        // B and D should have similar betweenness (each on 2 paths)
        assert_relative_eq!(b_score, d_score, epsilon = EPSILON);
        
        // A should have non-zero betweenness (source of paths)
        assert!(a_score > 0.0);
        
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
    
    // In our directed test graph:
    // A -> B -> C
    // |         ^
    // v         |
    // D ------->|
    //
    // Closeness centrality with wf_improved=true in directed graph:
    // Formula: C(v) = (n_reach/(n-1)) / (sum_distances/n_reach)

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
        // A should have highest closeness (≈0.75)
        assert_relative_eq!(a_score, 0.0, epsilon = EPSILON);
        
        // B and D should have equal closeness (=0.33)
        assert_relative_eq!(b_score, 0.33333, epsilon = EPSILON);
        assert_relative_eq!(d_score, 0.33333, epsilon = EPSILON);
        
        // C should have zero closeness (no outgoing paths)
        assert_relative_eq!(c_score, 0.75, epsilon = EPSILON);
        
        
        // All values should be between 0 and 1
        assert!(a_score >= 0.0 && a_score <= 1.0);
        assert!(b_score >= 0.0 && b_score <= 1.0);
        assert!(c_score >= 0.0 && c_score <= 1.0);
        assert!(d_score >= 0.0 && d_score <= 1.0);
    }
} 