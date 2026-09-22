import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Separate processes preserve Bun's native SQLite and server APIs.
    pool: "forks",
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "backend",
          environment: "node",
          include: [
            "packages/*/test/**/*.test.ts",
            "adapters/storage-sqlite/test/**/*.test.ts",
            "hosts/*/test/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "postgresql",
          environment: "node",
          globalSetup: ["adapters/storage-postgresql/test/global-setup.ts"],
          include: ["adapters/storage-postgresql/test/**/*.test.ts"],
        },
      },
      "apps/ui/vite.config.ts",
      "apps/design-system/vite.config.ts",
      "apps/web/vite.config.ts",
    ],
  },
});
