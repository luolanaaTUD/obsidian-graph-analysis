# Obsidian Graph Analysis Plugin

A plugin for [Obsidian](https://obsidian.md) that analyzes your vault using graph theory algorithms to provide insights into note relationships and importance.

## Features

- **Degree Centrality Analysis**: Identifies the most connected notes in your vault based on incoming and outgoing links
- **Eigenvector Centrality Analysis**: Determines note importance based on connections to other important notes (coming soon)
- **Interactive Results**: View results in a sortable table and click on notes to navigate directly to them
- **Customizable Settings**: Exclude specific folders or tags from analysis and control the number of results displayed

## Installation

### From Obsidian Community Plugins

*Coming soon*

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/yourusername/obsidian-graph-analysis/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian's settings under "Community Plugins"

## Usage

### Analyzing Your Vault

1. Open the command palette (Ctrl/Cmd + P)
2. Search for "Graph Analysis" and select the algorithm you want to use:
   - "Analyze Vault (Degree Centrality)"
   - "Analyze Vault (Eigenvector Centrality)"

### Understanding the Results

The plugin will display:
- A modal window with a table of results
- A notification showing the top 3 most central notes
- Detailed results in the developer console (for debugging)

#### Degree Centrality

Degree centrality measures how many connections a note has. Notes with high degree centrality are "hubs" in your knowledge graph.

#### Eigenvector Centrality

Eigenvector centrality not only considers the number of connections but also the importance of the connected notes. A note connected to many important notes will have a high eigenvector centrality.

### Settings

Access plugin settings from the Obsidian settings panel under "Graph Analysis":

- **Exclude Folders**: Comma-separated list of folders to exclude from analysis
- **Exclude Tags**: Comma-separated list of tags to exclude from analysis
- **Result Limit**: Maximum number of results to display in the results modal

## Technical Details

This plugin combines:
- TypeScript for the Obsidian plugin interface
- Rust compiled to WebAssembly for high-performance graph analysis
- The [petgraph](https://github.com/petgraph/petgraph) Rust crate for graph algorithms

### Recent Performance Improvements

The `refactor/move-graph-calculations-to-rust` branch contains significant performance improvements:

- **Graph Construction in Rust**: Moved the graph building process from TypeScript to Rust for better performance
- **Advanced Centrality Algorithms**: Implemented proper eigenvector centrality and betweenness centrality algorithms in Rust
- **Optimized Data Flow**: Reduced data transfer between TypeScript and Rust by processing entire vault data in one operation
- **Interactive Centrality Selection**: Added ability to switch between different centrality measures in the graph view
- **Fallback Mechanisms**: Implemented graceful fallbacks to TypeScript if the Rust implementation fails

These changes provide better performance especially for larger vaults, with minimal changes to the user interface.

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