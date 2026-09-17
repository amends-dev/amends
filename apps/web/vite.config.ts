import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
    // Reserved for an HTTP host on port 8787; the local CLI host does not serve this API.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    name: "@amends/web",
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
});
