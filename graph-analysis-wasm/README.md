# Graph Analysis WASM Module

This is the Rust/WebAssembly core of the Obsidian Graph Analysis plugin, providing high-performance graph analysis capabilities with automatic updates and efficient memory management.

## Overview

This module handles all graph-related computations using Rust compiled to WebAssembly, providing:
- Efficient graph construction and manipulation
- High-performance centrality calculations
- Smart memory management
- Real-time graph updates

## Technical Stack

- **Rust**: Core implementation language
- **rustnetworkx-core**: Primary graph processing library
- **wasm-bindgen**: WebAssembly bindings
- **web-sys**: Web API integrations

## Features

### Graph Processing
- Efficient graph construction from vault data
- Automatic updates on vault changes
- Smart memory management
- Optimized refresh cycles

### Centrality Calculations
- Degree Centrality
- Eigenvector Centrality
- Betweenness Centrality
- Closeness Centrality

### Performance Optimizations
- Smart refresh debouncing
- Efficient memory usage
- Optimized algorithms
- Quick response time

## Development

### Prerequisites
- Rust (latest stable)
- wasm-pack
- Node.js (for testing)

### Building
```bash
wasm-pack build --target web
```

### Testing
```bash
cargo test
wasm-pack test --node
```

## Architecture

### Core Components
```rust
// Graph representation using rustnetworkx-core
use rustnetworkx_core::Graph;

// Main graph processing structure
pub struct GraphProcessor {
    graph: Graph,
    cache: Cache,
}

// Centrality calculations
impl GraphProcessor {
    pub fn calculate_degree_centrality(&self) -> HashMap<NodeId, f64>;
    pub fn calculate_eigenvector_centrality(&self) -> HashMap<NodeId, f64>;
    pub fn calculate_betweenness_centrality(&self) -> HashMap<NodeId, f64>;
    pub fn calculate_closeness_centrality(&self) -> HashMap<NodeId, f64>;
}
```

### Data Flow
1. JS/TS sends vault data to Rust
2. Rust constructs graph using rustnetworkx-core
3. Automatic updates handled efficiently
4. Results returned to JS/TS

## Integration

### TypeScript Interface
```typescript
interface WasmGraphAnalysis {
    createGraph(data: VaultData): Promise<void>;
    calculateCentrality(type: CentralityType): Promise<CentralityResult>;
    getGraphStats(): Promise<GraphStats>;
    handleVaultUpdate(changes: VaultChanges): Promise<void>;
}
```

### Usage Example
```typescript
const wasmModule = await import('./pkg/graph_analysis_wasm.js');
const analyzer = new wasmModule.GraphAnalyzer();

// Initial setup
await analyzer.createGraph(vaultData);

// Handle updates
analyzer.handleVaultUpdate(changes);

// Get analysis results
const results = await analyzer.calculateCentrality('degree');
```

## Performance Considerations

### Memory Management
- Smart refresh debouncing
- Efficient graph updates
- Optimized memory usage
- Quick response time

### Optimization Techniques
- Custom memory allocators
- Smart update handling
- Efficient algorithms
- Responsive calculations

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see the LICENSE file for details