# Security and privacy

This document supports community plugin review and explains automated scanner findings for the release bundle (`main.js`).

## What the plugin does with your data

- **Local by default:** Graph metrics (Rust/WebAssembly), vault analysis caches, and derived chart data are stored via Obsidian `loadData` / `saveData` on your device.
- **Optional cloud AI:** If you configure a Gemini API key and run Vault Analysis, note content and prompts are sent to Google’s Generative Language API using **your** key. Nothing is sent on plugin load.
- **No plugin backend:** There is no first-party server; the plugin does not collect analytics.

## Network access

| Trigger | Endpoint | Mechanism |
|---------|----------|-----------|
| User runs Vault Analysis / tab AI | `generativelanguage.googleapis.com` | Obsidian [`requestUrl`](https://docs.obsidian.md/Reference/TypeScript+API/requestUrl) only ([`src/services/GeminiRestClient.ts`](../src/services/GeminiRestClient.ts)) |

See also the **Privacy and network** section in [README.md](../README.md) and the disclosure in plugin settings.

## Automated scan: `fetch()` / `request()`

Community scanners often count substrings in the minified `main.js` bundle.

- **`fetch(`** — Release builds do not bundle `@google/genai`; Gemini calls use `requestUrl` only. Any remaining `fetch(` matches are unrelated (e.g. minified helper names) and should be zero or minimal after `npm run audit:bundle`.
- **`request`** — Most matches are **not** HTTP calls, for example:
  - `requestAnimationFrame` (graph view rendering)
  - `requestUrl` (Obsidian API name in strings or types)
  - Error text such as `GenerateRequestsPerDay…` (quota messages)

Run `node scripts/audit-release-bundle.mjs` after `npm run build` for a categorized report to attach to your obsidian-releases PR.

## Automated scan: `atob()` / `btoa()`

Earlier builds embedded the WASM file using runtime `atob()` on a base64 string. **Current builds** embed the `.wasm` file with esbuild’s **binary loader** ([`src/wasm/embedded.ts`](../src/wasm/embedded.ts)), which emits a `Uint8Array` literal and does **not** use `atob`/`btoa` in `dist/main.js`.

## WebAssembly and exported linear memory

The graph engine is compiled with **wasm-bindgen** (`wasm-pack build --target web`) and embedded in `main.js` at build time ([`docs/publishing.md`](publishing.md)). This matches Obsidian’s release layout (single `main.js` asset).

- The `.wasm` module **exports linear memory** as required by wasm-bindgen for JavaScript↔Rust FFI. This is standard for Rust WASM plugins and is **not** used to expose arbitrary host access to vault data.
- Plugin TypeScript only calls exported functions defined in [`graph-analysis-wasm/src/api.rs`](../graph-analysis-wasm/src/api.rs) (e.g. `build_graph_from_vault`, centrality helpers). The host does not read or write the WASM memory buffer directly.
- WASM runs inside the browser/Electron sandbox like other Obsidian webviews.

We do **not** strip the memory export from the binary; doing so would break wasm-bindgen initialization.

## PR appendix (copy-paste for reviewers)

```
Network: Gemini API only when the user runs Vault Analysis (user API key, requestUrl only).
fetch/atob/btoa: not present in release main.js (Gemini REST client + embedded WASM bytes).
request substring counts include false positives (requestAnimationFrame, requestUrl identifier).
WASM memory export: standard wasm-bindgen; no direct host memory access in plugin code.
```

## Gemini client implementation

The plugin uses a thin REST client ([`GeminiRestClient.ts`](../src/services/GeminiRestClient.ts)) instead of `@google/genai`, so the release bundle avoids SDK `fetch`/`atob` helpers used for inline media encoding.
