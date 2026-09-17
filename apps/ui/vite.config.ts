import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  test: { name: "@amends/ui", environment: "happy-dom", include: ["test/**/*.test.{ts,tsx}"] },
});
