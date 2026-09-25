import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import solid from "vite-plugin-solid";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  resolve: { dedupe: ["solid-js"] },
  test: {
    name: "@amends/features",
    environment: "happy-dom",
    // Browser stories use Vite's same-origin proxy; portable stories call the ephemeral host directly.
    environmentOptions: { happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } } },
    globalSetup: [
      fileURLToPath(new URL("../../scripts/testing/features-setup.ts", import.meta.url)),
    ],
    setupFiles: [fileURLToPath(new URL("../../scripts/testing/jest-dom.ts", import.meta.url))],
    include: ["test/**/*.test.tsx"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
