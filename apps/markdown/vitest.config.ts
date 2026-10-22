import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "@amends-dev/markdown",
    environment: "node",
    include: ["test/**/*.test.ts"]
  }
})
