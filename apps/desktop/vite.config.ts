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
  // The oldest WebKit the bundle runs on: CSS color-mix() needs Safari 16.2. esbuild lowers syntax
  // to this target but adds no API polyfills, so it must match what the code actually uses.
  build: { target: "safari16.2" },
  test: {
    name: "@amends/desktop",
    environment: "happy-dom",
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
