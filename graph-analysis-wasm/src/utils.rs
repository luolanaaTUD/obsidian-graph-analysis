pub fn set_panic_hook() {
    // When the `console_error_panic_hook` feature is enabled, we can call the
    // `set_panic_hook` function at least once during initialization, and then
    // we will get better error messages if our code ever panics.
    //
    // For more details see
    // https://github.com/rustwasm/console_error_panic_hook#readme
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

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
