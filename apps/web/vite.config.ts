import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  // Shared source packages and primitives must use the same reactive owner tree.
  resolve: { dedupe: ["solid-js"] },
  server: {
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
    // The local Bun host serves the shared HTTP contract on port 8787.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    name: "@amends/web",
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
