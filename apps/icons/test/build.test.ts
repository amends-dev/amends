// @vitest-environment node
import { expect, it } from "@effect/vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";

it("checks generated artifacts on Bun and exits without writing", () => {
  const output = execFileSync(process.execPath, ["run", "scripts/generate.ts", "--check"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(output).toContain("Verified 50 icons");
});

it.each(["one-icon", "catalog"])(
  "bundles the %s entry without unrelated runtime code",
  async (entry) => {
    const result = await build({
      configFile: false,
      root: fileURLToPath(new URL("../", import.meta.url)),
      plugins: [solid()],
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(new URL(`./fixtures/${entry}.ts`, import.meta.url)),
          formats: ["es"],
        },
        rollupOptions: { external: [/^solid-js(?:\/|$)/] },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    if (!output || !("output" in output)) throw new Error("Expected a library build");
    const code = output.output
      .filter((output) => output.type === "chunk")
      .map((chunk) => chunk.code)
      .join("\n");
    expect(code).not.toContain("M4 6L20 6M4 12L20 12M4 18L20 18");
    if (entry === "one-icon") {
      expect(code).toContain("M4 12L7.59 15.59A2 2 0 0 0 10.41 15.59L20 6");
      expect(code).not.toContain("iconCatalog");
      expect(code).not.toContain("IconSearch");
      expect(code.length).toBeLessThan(5000);
    } else {
      expect(code).toContain("iconCatalog");
      expect(code).not.toContain("solid-js");
      expect(code).not.toContain("<svg");
    }
  },
);
