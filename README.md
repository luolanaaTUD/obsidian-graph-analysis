# Obsidian Graph Analysis Plugin

A plugin for [Obsidian](https://obsidian.md) that analyzes your vault using advanced graph theory algorithms to provide deep insights into note relationships and importance.

## Features

- **Interactive Graph View**: Dynamic visualization of your vault's note relationships
- **Real-time Analysis**: Automatic updates as you modify your vault
- **Multiple Centrality Measures**:
  - Degree Centrality: Identifies the most connected notes
  - Eigenvector Centrality: Determines note importance based on connections
  - Betweenness Centrality: Identifies bridge notes between topics
  - Closeness Centrality: Measures how central notes are to your vault
- **Smart Performance**: Efficient updates and memory management
- **Customizable Settings**: Control analysis scope and visualization

## Installation

### From Obsidian Community Plugins

*Coming soon*

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/yourusername/obsidian-graph-analysis/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian's settings under "Community Plugins"

## Usage

### Accessing the Graph Analysis View

1. Click the graph analysis icon in the ribbon (left sidebar)
2. The graph view will open, showing your vault's note relationships
3. Interact with the graph to explore relationships and centrality measures
4. The view updates automatically as you modify your vault

### Understanding the Visualization

The graph view provides multiple ways to understand your vault's structure:
- Interactive node exploration
- Visual relationship indicators
- Multiple centrality measures
- Real-time updates

#### Centrality Measures

Each centrality measure provides different insights into your notes:
- **Degree Centrality**: Shows which notes have the most direct connections
- **Eigenvector Centrality**: Reveals notes connected to other important notes
- **Betweenness Centrality**: Identifies notes that bridge different topics
- **Closeness Centrality**: Shows how easily notes can reach others

### Settings

Access plugin settings from the Obsidian settings panel under "Graph Analysis":

- **Exclude Folders**: Comma-separated list of folders to exclude from analysis
- **Exclude Tags**: Comma-separated list of tags to exclude from analysis
- **Result Limit**: Maximum number of results to display
- **Visualization Options**: Customize the graph view appearance

## Technical Details

This plugin leverages cutting-edge technology for optimal performance:
- TypeScript for the Obsidian plugin interface
- Rust compiled to WebAssembly for high-performance graph analysis
- [rustnetworkx-core](https://github.com/rustworkx/rustworkx) for efficient graph algorithms
- Modern web technologies for interactive visualizations

### Performance Features

The plugin includes several optimizations for excellent performance:

- **Smart Updates**: Efficient graph refresh with debouncing
- **Memory Management**: Optimized memory usage for large vaults
- **Fast Calculations**: High-performance centrality algorithms
- **Responsive Interface**: Non-blocking operations for smooth experience

## Development

### Prerequisites

- Node.js and npm
- Rust and wasm-pack
- Obsidian development environment

### Building

1. Clone the repository
   ```
   git clone https://github.com/yourusername/obsidian-graph-analysis.git
   cd obsidian-graph-analysis
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Build the Rust WebAssembly module
   ```
   cd graph-analysis-wasm
   wasm-pack build --target web
   cd ..
   ```

4. Build the plugin
   ```
   npm run build
   ```

5. Copy to your vault for testing
   ```
   node copy-to-vault.mjs
   ```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- The Obsidian team for creating such an amazing knowledge management tool
- The Rust and WebAssembly communities for their excellent tools and documentation
- The rustnetworkx-core team for their powerful graph processing library