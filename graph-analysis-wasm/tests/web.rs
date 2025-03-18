//! Test suite for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

extern crate wasm_bindgen_test;
use wasm_bindgen_test::*;
use graph_analysis_wasm::*;
use serde_json::{json, Value};

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn pass() {
    assert_eq!(1 + 1, 2);
}

#[wasm_bindgen_test]
fn test_degree_centrality() {
    // Create a simple graph for testing
    // A -> B -> C
    // |         ^
    // v         |
    // D ------->|
    let graph_data = json!({
        "nodes": ["A", "B", "C", "D"],
        "edges": [
            [0, 1], // A -> B
            [1, 2], // B -> C
            [0, 3], // A -> D
            [3, 2]  // D -> C
        ]
    });

    // Calculate degree centrality
    let result = calculate_degree_centrality(&graph_data.to_string());
    
    // Parse the result
    let result_value: Value = serde_json::from_str(&result).unwrap();
    let results = result_value.as_array().unwrap();
    
    // Check that we have the correct number of results
    assert_eq!(results.len(), 4);
    
    // Check that the results are sorted by score in descending order
    let first_score = results[0]["score"].as_f64().unwrap();
    let last_score = results[results.len() - 1]["score"].as_f64().unwrap();
    assert!(first_score >= last_score);
    
    // Check specific node scores
    // Find node A (should have 2 outgoing edges, 0 incoming)
    let node_a = results.iter().find(|r| r["node_name"] == "A").unwrap();
    assert_eq!(node_a["node_id"].as_u64().unwrap(), 0);
    assert!(node_a["score"].as_f64().unwrap() > 0.0);
    
    // Find node C (should have 0 outgoing edges, 2 incoming)
    let node_c = results.iter().find(|r| r["node_name"] == "C").unwrap();
    assert_eq!(node_c["node_id"].as_u64().unwrap(), 2);
    assert!(node_c["score"].as_f64().unwrap() > 0.0);
}
