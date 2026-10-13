import { fileURLToPath } from "node:url"
import solid from "vite-plugin-solid"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [solid()],
  resolve: { dedupe: ["solid-js"] },
  test: {
    name: "@amends-dev/icons",
    environment: "happy-dom",
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.{ts,tsx}"]
  }
})
