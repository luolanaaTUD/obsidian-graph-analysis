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
- **Immersive Graph View**: Status bar is automatically hidden when viewing the graph for a distraction-free experience
- **AI-Powered Summaries**: Generate intelligent summaries of your notes using Google Gemini AI

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

### AI Summary Feature

The plugin includes an AI-powered summary feature that can generate intelligent summaries of your notes:

1. **Access**: Click the "AI Summary" button in the status bar (bottom of Obsidian)
2. **Requirements**: Configure your Google Gemini API key in plugin settings
3. **Content Processing**: The plugin automatically cleans up markdown formatting and limits content to 1000 words for optimal AI processing
4. **Fallback**: If no API key is configured, a simple extractive summary is provided instead

#### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Create a new API key
4. Copy the key and paste it into the plugin settings

#### Features

- **Smart Content Cleanup**: Removes markdown formatting, empty lines, and limits word count
- **Intelligent Summaries**: Uses Google Gemini AI for high-quality summaries
- **Secure Storage**: API keys are stored securely in Obsidian settings
- **Error Handling**: Graceful fallback to simple summaries if AI fails
- **Copy to Clipboard**: Easy copying of generated summaries

### Vault Analysis Feature

The plugin includes a comprehensive vault analysis feature that provides deep insights into your entire Obsidian vault:

1. **Access Methods**:
   - Click the "Vault Analysis" button in the status bar
   - Use the command palette: "Generate AI Analysis for Entire Vault"
   - Or view existing results: "View Vault Analysis Results"

2. **What It Analyzes**:
   - **Summary**: One-sentence summary of each note's main concept
   - **Keywords**: 3-6 key terms extracted from each note
   - **Knowledge Domains**: 2-4 academic or professional fields the note belongs to
   - **Metadata**: Creation date, modification date, word count, and file path

3. **Intelligent Processing**:
   - Respects your folder and tag exclusion settings
   - Skips notes with fewer than 10 words
   - Processes files in batches to respect API rate limits
   - Provides detailed progress updates during analysis

4. **Results Management**:
   - **Search & Filter**: Find notes by title, keywords, or knowledge domain
   - **Interactive Navigation**: Click note titles to open them directly
   - **Data Persistence**: Results saved to `data/vault-analysis.json`
   - **Tab-Specific Cache**: Each analysis tab (Structure, Evolution, Actions) has its own cache file for improved performance and modularity

#### Vault Analysis Benefits

- **Knowledge Discovery**: Identify knowledge gaps and domain coverage
- **Content Organization**: Better understand your vault's structure
- **Research Insights**: Find related topics and areas of focus
- **Second Brain Enhancement**: Get AI-powered insights into your thinking patterns

#### Usage Tips

- Run vault analysis periodically to track how your knowledge base evolves
- Use the search function to find notes related to specific topics
- Combine with exclusion settings to focus on specific areas of your vault

### Settings

Access plugin settings from the Obsidian settings panel under "Graph Analysis":

- **Exclude Folders**: Comma-separated list of folders to exclude from analysis
  - Use folder paths like "Archive", "Templates", "Private/Personal"
  - Supports nested folders and partial path matching
- **Exclude Tags**: Comma-separated list of tags to exclude from analysis
  - Use tag names without # like "private", "draft", "archive"
  - Supports both frontmatter tags and inline tags
  - Case-insensitive matching
- **Result Limit**: Maximum number of results to display
- **Gemini API Key**: Your Google Gemini API key for AI-powered summaries
- **Exclusion Statistics**: Real-time view of how many files are excluded and included
- **Visualization Options**: Customize the graph view appearance

#### Exclusion Features

The plugin provides robust exclusion capabilities:

- **Folder Exclusion**: Exclude entire folders and their subfolders from analysis
- **Tag Exclusion**: Exclude files based on tags (both frontmatter and inline tags)
- **Real-time Statistics**: See how many files are excluded vs included
- **Exclusion Preview**: View list of excluded files to verify your settings
- **Automatic Updates**: Graph refreshes automatically when exclusion settings change

## Technical Details

This plugin leverages cutting-edge technology for optimal performance:
- TypeScript for the Obsidian plugin interface
- Rust compiled to WebAssembly for high-performance graph analysis
- [rustnetworkx-core](https://github.com/rustworkx/rustworkx) for efficient graph algorithms
- Modern web technologies for interactive visualizations
- Modular cache system with tab-specific analysis files

### Performance Features

The plugin includes several optimizations for excellent performance:

- **Smart Updates**: Efficient graph refresh with debouncing
- **Memory Management**: Optimized memory usage for large vaults
- **Fast Calculations**: High-performance centrality algorithms
- **Responsive Interface**: Non-blocking operations for smooth experience
- **Modular Cache**: Tab-specific analysis files for independent updates and reduced memory usage

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