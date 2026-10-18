import { foldkit } from "@foldkit/vite-plugin"
import { defineConfig } from "vite"

/** The local host, as `bun run start` serves it. */
const host = "http://127.0.0.1:8787"

export default defineConfig({
  plugins: [foldkit()],
  server: {
    host: "127.0.0.1",
    port: 4410,
    // The app reaches the host at its own origin's /api, the sync server's WebSocket included.
    proxy: { "/api": { target: host, ws: true, rewrite: (path) => path.replace(/^\/api/, "") } }
  },
  optimizeDeps: { entries: ["src/entry.ts"] }
})
