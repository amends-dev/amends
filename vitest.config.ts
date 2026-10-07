import { defineConfig } from "vitest/config";
import { onUnhandledError } from "./scripts/testing/unhandled-errors.ts";

export default defineConfig({
  test: {
    // Separate processes preserve Bun's native server APIs.
    pool: "forks",
    maxWorkers: 4,
    onUnhandledError,
    projects: [
      {
        test: {
          name: "backend",
          environment: "node",
          // Tests own fresh stores and scoped resources; reuse workers and their module cache.
          isolate: false,
          // Integration tests share CI's two CPUs with PostgreSQL; the 5 s default is too tight.
          testTimeout: 20_000,
          include: [
            "packages/*/test/**/*.test.ts",
            "adapters/storage-memory/test/**/*.test.ts",
            "adapters/sandbox-local/test/**/*.test.ts",
            "adapters/sandbox-daytona/test/**/*.test.ts",
            "adapters/harness-*/test/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "postgresql",
          environment: "node",
          // Each test still owns its database and pools; only the worker and imports are shared.
          isolate: false,
          testTimeout: 20_000,
          globalSetup: ["adapters/storage-postgresql/test/global-setup.ts"],
          include: ["adapters/storage-postgresql/test/**/*.test.ts", "hosts/*/test/**/*.test.ts"],
        },
      },
      "apps/icons/vite.config.ts",
      "apps/ui/vite.config.ts",
      "apps/client/vite.config.ts",
      "apps/web/vite.config.ts",
      "apps/desktop/vite.config.ts",
    ],
  },
});
