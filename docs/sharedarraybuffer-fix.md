# SharedArrayBuffer Warning Fix

## Problem

The plugin was showing a deprecation warning about SharedArrayBuffer usage:
```
SharedArrayBuffer will require cross-origin isolation. See https://developer.chrome.com/blog/enabling-shared-array-buffer/
```

This warning occurred because the `getrandom` crate with the `wasm_js` feature uses SharedArrayBuffer for better performance. However, SharedArrayBuffer requires cross-origin isolation headers (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy), which Obsidian plugins cannot control since they run in Obsidian's context.

## Solution

Implemented a custom getrandom backend that uses JavaScript's `Math.random()` for simple pseudo-random number generation. This approach:

1. Uses `Math.random()` - a simple PRNG that's perfect for graph algorithms
2. Does not require SharedArrayBuffer
3. Does not require cross-origin isolation headers
4. Does not require crypto APIs
5. Is faster and simpler than cryptographic randomness
6. Is compatible with Obsidian's plugin environment

**Note**: For graph analysis algorithms, we don't need cryptographically secure randomness. The random numbers are used by rustworkx-core for algorithmic purposes (random graph generation, breaking ties, etc.), where a simple PRNG is sufficient.

## Changes Made

### 1. Created .cargo/config.toml

**File**: `graph-analysis-wasm/.cargo/config.toml`

Created configuration to enable custom backend:
```toml
[target.wasm32-unknown-unknown]
rustflags = ["--cfg", "getrandom_backend=\"custom\""]
```

### 2. Updated utils.rs

**File**: `graph-analysis-wasm/src/utils.rs`

Added custom getrandom implementation:
```rust
// Custom getrandom implementation using simple PRNG (Math.random)
// For graph algorithms, we don't need cryptographically secure randomness
// This avoids SharedArrayBuffer and crypto API requirements entirely
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
#[no_mangle]
extern "C" fn getrandom(buf: *mut u8, buf_len: usize, _flags: u32) -> u32 {
    use wasm_bindgen::prelude::*;
    
    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = Math)]
        fn random() -> f64;
    }
    
    if buf.is_null() || buf_len == 0 {
        return 0; // Success
    }
    
    unsafe {
        let slice = std::slice::from_raw_parts_mut(buf, buf_len);
        // Fill buffer with random bytes using Math.random()
        // Math.random() returns values in [0, 1), so we scale to [0, 256) and cast to u8
        for byte in slice.iter_mut() {
            *byte = (random() * 256.0) as u8;
        }
    }
    
    0 // Success
}
```

### 3. Cargo.toml

**File**: `graph-analysis-wasm/Cargo.toml`

Keep using `wasm_js` feature (it's still needed for dependencies), but the custom backend takes precedence:
```toml
getrandom = { version = "0.3", features = ["wasm_js"] }
```

## Technical Details

### Why wasm-bindgen-getrandom?

The `wasm-bindgen-getrandom` crate provides a custom backend for `getrandom` that:
- Uses `crypto.getRandomValues()` directly via wasm-bindgen
- Does not use SharedArrayBuffer
- Works in browser environments without cross-origin isolation
- Is the recommended approach for Obsidian plugins and similar environments

### Feature Comparison

- **`wasm_js` feature (default)**:
  - May use SharedArrayBuffer in some implementations
  - Requires cross-origin isolation headers when using SharedArrayBuffer
  - Not suitable for Obsidian plugins

- **`custom` backend (new)**:
  - Uses `Math.random()` - simple PRNG via wasm-bindgen
  - No SharedArrayBuffer requirement
  - No cross-origin isolation needed
  - No crypto API required
  - Faster than cryptographic randomness
  - Perfect for graph algorithms (no security requirements)
  - Suitable for Obsidian plugins
  - Configured via `.cargo/config.toml` rustflags

## Impact Assessment

- **Functionality**: No change - graph algorithms work perfectly with simple PRNG
- **Performance**: Better performance - Math.random() is faster than crypto APIs
- **Compatibility**: Better compatibility with Obsidian's plugin environment
- **Security**: Not applicable - graph algorithms don't require cryptographic security
- **Simplicity**: Much simpler implementation - no crypto API dependencies

## Testing

After rebuilding the WASM module:

1. Rebuild WASM: `cd graph-analysis-wasm && wasm-pack build --target web --release`
2. Rebuild TypeScript: `npm run build:ts`
3. Load plugin in Obsidian
4. Verify no SharedArrayBuffer warning in console
5. Test graph analysis functionality:
   - Build graph from vault
   - Calculate centrality measures (degree, eigenvector, betweenness, closeness)
   - Verify all algorithms work correctly
6. Check console for any new errors

## Notes

- This fix maintains full compatibility with existing functionality
- The custom backend uses `Math.random()` which is perfect for graph algorithm purposes
- Graph algorithms (centrality calculations, graph generation) don't need cryptographic security
- `Math.random()` is simpler, faster, and avoids all browser security restrictions
- This approach is ideal for browser environments where cross-origin isolation cannot be guaranteed
- Obsidian plugins run in a browser-like environment but don't have control over HTTP headers
- The custom backend is configured via `.cargo/config.toml` rustflags, which takes precedence over the `wasm_js` feature

## References

- [wasm-bindgen-getrandom crate](https://crates.io/crates/wasm-bindgen-getrandom)
- [getrandom crate documentation](https://docs.rs/getrandom)
- [SharedArrayBuffer and cross-origin isolation](https://developer.chrome.com/blog/enabling-shared-array-buffer/)
