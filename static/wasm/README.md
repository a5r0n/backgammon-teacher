# gnubg WASM Files

This directory should contain the gnubg-web Emscripten build output:

- `gnubg.js` — Emscripten JS loader
- `gnubg.wasm` — WebAssembly binary
- `gnubg.wd` — gnubg weights data (~0.39 MB)
- `gnubg_os0.bd` — gnubg bearoff database (~1.40 MB)

## Building from source

1. Clone: `git clone https://github.com/hwatheod/gnubg-web`
2. Follow the Emscripten build instructions in the gnubg-web README
3. Copy the output files to this directory

## Fallback

If WASM files are not present, the app falls back to pure TypeScript
move generation (without equity analysis). The computer player will
still work but won't have access to equity-based move evaluation.
