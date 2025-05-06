mod common;

use approx::assert_relative_eq;
use graph_analysis_wasm::*;
use graph_analysis_wasm::models::Node;
use serde_json;

#[test]
fn test_degree_centrality_basic() {
    common::create_test_graph_manager();
    
    let result = calculate_degree_centrality_cached();
    let result_value: Vec<Node> = serde_json::from_str(&result).unwrap();
    
    // Expected degree centralities for our test graph:
    // A: out=2, in=0, total=2 -> 2/(2*(4-1)) = 0.333
    // B: out=1, in=1, total=2 -> 2/(2*(4-1)) = 0.333
    // C: out=0, in=2, total=2 -> 2/(2*(4-1)) = 0.333
    // D: out=1, in=1, total=2 -> 2/(2*(4-1)) = 0.333
    
    for result in result_value {
        assert_relative_eq!(result.centrality.degree.unwrap_or(0.0), 0.333, epsilon = 0.001);
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