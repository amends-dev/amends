import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  resolve: { dedupe: ["solid-js"] },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // Use a WebKit-compatible baseline for the native webview.
  build: { target: "safari13" },
  test: {
    name: "@amends/desktop",
    environment: "happy-dom",
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
