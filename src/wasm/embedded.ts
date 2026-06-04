import embeddedWasmBytesImport from '../../graph-analysis-wasm/pkg/graph_analysis_wasm_bg.wasm';

/** Populated at build time by esbuild binary loader (Uint8Array, not base64/atob). */
export const embeddedWasmBytes = embeddedWasmBytesImport as unknown as Uint8Array;
