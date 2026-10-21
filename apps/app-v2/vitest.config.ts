import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@amends-dev/app-v2",
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // A store's tests serve a host in process; the 5 s default is too tight beside other projects.
    testTimeout: 20_000,
    // Foldkit and its components ship ESM that the test runner transforms with the app.
    server: { deps: { inline: ["foldkit", "@foldkit/ui"] } }
  }
})
