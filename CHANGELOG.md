# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0]

### Added

- **Gemini 3.1 Flash Lite** — Semantic analysis now uses `gemini-3.1-flash-lite-preview` with 250K requests/day on the free tier, replacing the previous dual-model setup
- **Language matching** — Strengthened prompt instructs the AI to match each note's language in batch analysis; responses for Chinese notes are in Chinese, English in English, etc.

### Changed

- **Single model for semantic analysis** — Removed dual-model logic (gemini-2.5-flash-lite + gemini-2.5-flash) that alternated between models for quota limits. All semantic analysis now uses a single model
- **Network card UI** — Added 20px padding between outer card and main content in Bridge/Foundation/Authority domain cards
- **Theme-aware centrality palettes** — Default color palettes for betweenness, closeness, and eigenvector now switch automatically between light theme (BuGn, Warm, PuRd) and dark theme (Viridis, Plasma, Viridis) for better node visibility
- **Centrality gradient defaults** — Increased default steps from 6 to 12; palettes re-apply when switching themes


### Fixed

- Bridge/Foundation/Authority section not showing on fix branch due to `this.container.ownerDocument` being undefined when `renderNetworkAnalysis` was called without `renderStructureAnalysis`

### Removed

- `getSemanticModelForBatch` and alternate-model retry logic from VaultSemanticAnalysisManager
- `semanticModelCounter` and alternate-model retry from AISummaryManager

---

## [0.5.8]

*(Previous release — see git history for details)*
