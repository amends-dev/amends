import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: { dedupe: ["solid-js"] },
  server: {
    host: "127.0.0.1",
    port: 4321,
    strictPort: true,
  },
});
