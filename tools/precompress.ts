// Precompress a built site for tools/server.ts: next to every compressible file (code, JSON, fonts and the 3D models
// - .glb is mostly raw vertex data, Hollow's 15.9 MB map brotlis to 4.7 MB) write <file>.br and <file>.gz; the
// server sends whichever the browser accepts. Images and audio are already compressed and are left alone.
//   node --experimental-transform-types tools/precompress.ts <dir>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const DIR = process.argv[2] ?? "release";
const EXT = new Set([".js", ".css", ".html", ".json", ".glb", ".ttf", ".svg", ".wasm", ".txt", ".map"]);
let before = 0;
let after = 0;
let n = 0;

function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.has(extname(name).toLowerCase()) && st.size > 1024) {
      const buf = readFileSync(p);
      const br = brotliCompressSync(buf, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
      });
      const gz = gzipSync(buf, { level: 9 });
      // Only keep a variant that actually saves something.
      if (br.length < buf.length * 0.95) writeFileSync(p + ".br", br);
      if (gz.length < buf.length * 0.95) writeFileSync(p + ".gz", gz);
      before += buf.length;
      after += Math.min(br.length, buf.length);
      n++;
    }
  }
}

walk(DIR);
console.log(`precompressed ${n} files: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (brotli)`);
