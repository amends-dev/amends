import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  resolve: { dedupe: ["solid-js"] },
  test: {
    name: "@amends/ui-v2",
    environment: "happy-dom",
    setupFiles: [
      fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url)),
      fileURLToPath(new URL("./test/browser-defaults.ts", import.meta.url)),
    ],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
