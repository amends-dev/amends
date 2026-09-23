import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  resolve: { dedupe: ["solid-js"] },
  server: {
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    name: "@amends/web",
    environment: "happy-dom",
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
