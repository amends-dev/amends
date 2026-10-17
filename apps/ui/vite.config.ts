import { fileURLToPath } from "node:url"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import solid from "vite-plugin-solid"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  resolve: { dedupe: ["solid-js"] },
  test: {
    name: "@amends-dev/ui",
    environment: "happy-dom",
    setupFiles: [
      fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url)),
      fileURLToPath(new URL("./test/browser-defaults.ts", import.meta.url))
    ],
    include: ["test/**/*.test.{ts,tsx}"]
  }
})
