import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  root: "workshop",
  plugins: [tailwindcss(), foldkit()],
  server: { host: "127.0.0.1", port: 4420 },
  build: { outDir: "../dist", emptyOutDir: true }
})
