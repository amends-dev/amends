import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: { dedupe: ["solid-js"] },
  test: {
    name: "@amends/client",
    environment: "happy-dom",
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
