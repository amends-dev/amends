import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@amends-dev/design",
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // Foldkit and its components ship ESM that the test runner transforms with the app.
    server: { deps: { inline: ["foldkit", "@foldkit/ui"] } }
  }
})
