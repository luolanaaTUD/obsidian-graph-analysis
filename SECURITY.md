---
version: 0.6.3
---

# Security disclosure

Report security issues privately via GitHub Security Advisories on the plugin repository.

## Data collection

| Data type | Scope | Purpose |
| --- | --- | --- |
| Markdown file paths | All markdown notes in the vault, minus folders/tags excluded in plugin settings | Build the note graph, centrality metrics, connectivity charts, and calendar activity |
| Note metadata (links, tags, frontmatter) | Same scope as paths | Resolve wikilinks and apply tag/folder exclusions without reading full note bodies for graph features |
| Note body text | Only notes selected for AI analysis, calendar word counts, or graph tooltips on hover | Semantic vault analysis, activity metrics, and preview snippets |
| Plugin data files | `.obsidian/plugins/knowledge-graph-analysis/` only | Cached AI responses and analysis JSON |

The plugin enumerates markdown files through Obsidian’s `vault.getMarkdownFiles()` API once per operation via a centralized helper, then filters paths using user-configured `excludeFolders` and `excludeTags`.

## Network activity

| Host | Direction | Purpose |
| --- | --- | --- |
| `generativelanguage.googleapis.com` | Outbound (HTTPS) | Optional Google Gemini API calls when the user configures an API key for AI vault analysis and summaries |

No analytics or telemetry endpoints are used.

## Permissions

| Capability | Used | Notes |
| --- | --- | --- |
| Read vault markdown | Yes | Required for graph and analysis features |
| Write plugin data | Yes | Analysis caches via `Plugin.loadData` / `saveData` (Obsidian-managed `data.json`) |
| Execute shell commands | No | |
| Arbitrary filesystem access | No | No Node `fs` or `vault.adapter` in shipped `main.js`; legacy JSON under `.obsidian/plugins/.../responses/` is imported once via `vault.read` if present |

## Third-party code

- Rust graph algorithms compiled to WebAssembly (`graph-analysis-wasm`), embedded in `main.js` at build time
- D3 and other npm dependencies bundled into `main.js`
- Optional Gemini AI uses a thin REST client ([`src/services/GeminiRestClient.ts`](src/services/GeminiRestClient.ts)) with Obsidian `requestUrl` only (no `@google/genai` in the release bundle)

Run `npm run audit:prod` locally before tagging a release.
