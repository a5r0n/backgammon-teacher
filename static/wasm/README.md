# gnubg WASM Files

This directory contains the gnubg-web Emscripten build output:

- `gnubg.js` — Emscripten JS loader
- `gnubg.wasm` — WebAssembly binary
- `gnubg.data` — Preloaded data (neural network weights, bearoff database, config)

## Source

Built from [hwatheod/gnubg-web](https://github.com/hwatheod/gnubg-web).

## Building from source

1. Clone: `git clone https://github.com/hwatheod/gnubg-web`
2. Follow the Emscripten build instructions in the gnubg-web README
3. Copy `gnubg.js`, `gnubg.wasm`, and `gnubg.data` from the build directory here

## Fallback

If WASM files are not present or fail to load, the app falls back to
local heuristic-based move analysis. The computer player will still
work but won't have access to equity-based move evaluation.
