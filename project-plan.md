## Project Overview

This plugin analyzes Obsidian vault using graph algorithms to provide insights into note structure and relationships. It combines Rust's performance with TypeScript for Obsidian integration.

## Development Steps

1. **Set up the project structure**
    - Create a new Obsidian plugin project using the sample plugin template
    - Set up Rust development environment with `wasm-pack`
2. **Implement the graph construction in TypeScript**
    - Use Obsidian API to access vault notes and parse internal links
    - Build a graph representation of your vault's note connections
    - Implement filters for excluding notes based on tags/folders
    - Add event listeners to rebuild graph on vault changes
3. **Develop the Rust graph analysis module**
    - Use the `petgraph` crate for graph data structures
    - Implement centrality algorithms:
        - Degree Centrality
        - Eigenvector Centrality
        - Betweenness Centrality
        - Closeness Centrality
    - Optimize for large graph performance
    - Compile to WebAssembly using `wasm-bindgen`
4. **Create the WebAssembly interface**
    - Implement JavaScript API for WASM module interaction
    - Build serialization/deserialization functions for graph data
    - Add error handling and logging
5. **Design the Obsidian plugin UI**
    - Create settings panel with algorithm configuration options
    - Build results display table with sortable columns
    - Implement graph view highlighting based on centrality scores
6. **Test and optimize**
    - Test with various vault sizes and structures
    - Optimize performance for large vaults
    - Refine UI based on user feedback

## Technical Requirements
- Rust with `petgraph` and `wasm-bindgen` crates
- TypeScript for Obsidian integration
- `wasm-pack` for WebAssembly compilation
- Obsidian Plugin API knowledge

## Plugin Functionality

When completed, users will be able to:
- Analyze their vault structure using graph theory metrics
- Identify important/central notes in their knowledge graph
- Visualize relationships between notes with enhanced graph view
- Configure analysis parameters to suit their needs


## Instructions for our work with AI
1. check the rust project which is an empty project created based on wasm template.
- Run and build this template to see if it works fine.
- install necessary crates for our project. Do not install our version of wasm pack besides this template
- Write code to perform Degree Centrality calculation which is most simple.
- Write test code to make sure previous code works fine
- Try to rebuild this rust library as wasm

2. work on obsidian plugin side
- setup necessary work directry and files
- write code for this plugin
- try to use rust wasm library for calculation
- test this plugin before we work on more advanced analysis.