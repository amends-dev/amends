// @vitest-environment node
import { expect, it } from "@effect/vitest";
import { fileURLToPath } from "node:url";
import { build, type Rollup } from "vite";

/**
 * Span names of server-side implementations. Effect keeps them as strings through minification,
 * so any of them in the bundle means the implementation behind it was bundled too.
 */
const serverCode = [
  "Journal.publish",
  "Projection.makeRunner",
  "ChangeFeedSource.make",
  "ThreadService.make",
  "InvitationService.issue",
  "Gateway.make",
];

it("the browser bundle carries core's schemas and errors, but none of its implementation", async () => {
  const output = (await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    root: fileURLToPath(new URL("..", import.meta.url)),
    logLevel: "silent",
    build: { write: false },
  })) as Rollup.RollupOutput;
  const code = output.output
    .flatMap((file) => (file.type === "chunk" ? [file.code] : []))
    .join("\n");
  expect(code.length).toBeGreaterThan(0);
  expect(serverCode.filter((marker) => code.includes(marker))).toEqual([]);
}, 60_000);
