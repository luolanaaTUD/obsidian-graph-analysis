# Obsidian Graph Analysis Plugin

A plugin for [Obsidian](https://obsidian.md) that analyzes your vault using graph algorithms and AI to provide insights into note relationships, importance, and content.

![Graph View](docs/images/graph.png)

## Features

- **Interactive Graph View**: Dynamic visualization with node labels, connection arrows, and centrality-based sizing
- **AI-Powered Vault Analysis**: Semantic Analysis → Knowledge Structure → Evolution → Recommended Actions
- **Exclusion Rules**: Exclude folders and tags from analysis; graph auto-refreshes when settings change
- **AI Summaries**: Per-note summaries via Google Gemini (Flash Lite / Flash)

## Installation

### From Obsidian Community Plugins


*Coming soon*

### Manual Installation

1. Download the latest release from the [releases page](https://github.com/yourusername/obsidian-graph-analysis/releases)
2. Extract the zip file into your Obsidian vault's `.obsidian/plugins/` directory
3. Enable the plugin in Obsidian's settings under "Community Plugins"

## Interactive Graph View

The graph visualizes your vault as a network: **nodes** are notes, **edges** are links between them. Node size reflects **degree centrality** (more connections = larger node).

- **Settings panel** (top-left): Toggle node labels, connection arrows, and color strip
- **Hover**: Adjacent connections highlight; centrality measures available in the UI
- **Drag**: Reposition nodes; the layout updates dynamically



https://github.com/user-attachments/assets/b51d574b-fd36-43dc-8379-6039853ca28d



## AI-Powered Vault Analysis

Open the **Vault Analysis** modal from the status bar or via the command palette. The analysis is powered by Google Gemini and organized into **four tabs**. Semantic Analysis runs first and produces the base data; the other three tabs build on it and can be generated independently.

### Tab 1: Semantic Analysis

The foundation of vault analysis. Each note gets:

- **Summary**: One-sentence description of the main concept
- **Keywords**: 3–6 key terms
- **Knowledge Domains**: 2–4 academic or professional fields

**Details:**

- **Analysis Summary**: Total files, generation date, API provider, token usage
- **Search & Filter**: Search by title, keywords, or domain
- **Paginated Results**: Click note titles to open; each result shows summary, keywords, domains, and metadata
- **Incremental Updates**: Only re-analyzes changed or new notes

![Semantic Analysis](docs/images/semantic-analysis.png)

### Tab 2: Knowledge Structure

Explores how your knowledge is organized across domains and the graph.

- **Knowledge Domain Distribution**: Chart of domains across your vault
- **Knowledge Network Analysis**: KDE distribution chart plus AI-generated network insights
- **Knowledge Gaps**: Identified areas for further development

![Knowledge Structure](docs/images/knowledge-structure.png)

### Tab 3: Knowledge Evolution

Tracks how your vault evolves over time.

- **Knowledge Development Timeline**: Calendar heatmap of note creation; AI phases and narrative
- **Topic Introduction Patterns**: When new topics and domains first appeared
- **Focus Shift Analysis**: Recent focus vs earlier periods; notable shifts
- **Conclusions**: AI-generated summaries per section

![Knowledge Evolution](docs/images/knowledge-evolution.png)

### Tab 4: Recommended Actions

Actionable suggestions based on your vault.

- **Network Metrics Analysis**: Scatter charts—Inbound vs Outbound links, Betweenness vs Eigenvector
- **Notes Needing Review**: Priority cards (high/medium/low) for hubs, bridges, and authorities; click to open
- **Suggested Connections**: Interactive sub-graph of notes that could be linked; add connections to your vault

![Recommended Actions](docs/images/recommended-actions.png)

## AI Summary (Single Note)

For quick summaries of the current note:

1. Click **AI Summary** in the status bar
2. Requires a Gemini API key in plugin settings
3. Content is cleaned and limited by character count for API calls

**Getting a Gemini API Key:** Visit [Google AI Studio](https://aistudio.google.com/), sign in, create an API key, and paste it in plugin settings under "LLM Model Configuration".

## Settings

Under Obsidian settings → **Graph Analysis**:

- **Exclude Notes from Analysis**: Folders (e.g. `Archive`, `Templates`) and tags (e.g. `private`, `draft`). Real-time stats show excluded vs included counts.
- **LLM Model Configuration**: Gemini API key for AI summaries and vault analysis (link to get a key included).
- **Result Limit**: Maximum number of results to display.
- **Visualization**: Graph appearance options in the graph view settings panel.

## Technical Details

- **TypeScript** for the Obsidian plugin interface and UI.
- **WebAssembly (WASM)**: Graph algorithms (degree, betweenness, closeness, eigenvector centrality, layout) run in Rust compiled to WASM via [rustworkx](https://github.com/rustworkx/rustworkx), so the plugin gets native-speed graph computation in the browser.
- **Modular cache**: Tab-specific analysis files and persistent vault analysis JSON.
- **Gemini Flash Lite**: The plugin uses Google’s Gemini Flash Lite for vault analysis and note summaries. Flash Lite is sufficient for structured tasks like summaries, keywords, and domain extraction, and is cost-efficient on the free tier with lower token usage than larger models.

## Build

To build the plugin from source:

**Prerequisites:** Node.js, npm, Rust, and [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/).

```bash
git clone https://github.com/yourusername/obsidian-graph-analysis.git
cd obsidian-graph-analysis
npm install
npm run build
```

**Build process:** `npm run build` builds both the WASM module and the TypeScript plugin. It runs in order: 
(1) **typecheck** — TypeScript check; 
(2) **build-wasm** — compiles the Rust graph library to WebAssembly via `wasm-pack build --target web` in `graph-analysis-wasm/`; 
(3) **build:ts** — bundles the plugin with esbuild (`scripts/esbuild.config.mjs`), which outputs to `dist/` and copies the built WASM file and other assets from `graph-analysis-wasm/pkg/` into `dist/`. One command produces a ready-to-use plugin in `dist/`.

**Output:** Everything ends up in `dist/`. To install into a vault, copy the contents of `dist/` into your vault's `.obsidian/plugins/obsidian-graph-analysis/` (or use `npm run copy-to-vault` if you have the vault path configured).

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License — see the LICENSE file for details.

## Acknowledgments

- The Obsidian team for the knowledge management platform
- The Rust and WebAssembly communities
- The rustworkx team for the graph processing library
