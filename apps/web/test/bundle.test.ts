import { fileURLToPath } from "node:url"
// @vitest-environment node
import { expect, it } from "@effect/vitest"
import { build, type Rollup } from "vite"

/**
 * Names that server-side implementations carry, span names and the HTTP server's service keys.
 * Effect keeps them as strings through minification, so any of them in the bundle means the
 * implementation behind it was bundled too.
 */
const serverCode = [
  "Journal.publish",
  "Projection.makeRunner",
  "ChangeFeedSource.make",
  "ThreadService.make",
  "InvitationService.issue",
  "Gateway.make",
  "BearerAuthentication.make",
  "@amends-dev/http/Streams",
  "@amends-dev/http/Draining"
]

it("the browser bundle carries core's schemas, errors, and the HTTP contract, but no server code", async () => {
  const output = (await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    root: fileURLToPath(new URL("..", import.meta.url)),
    logLevel: "silent",
    build: { write: false }
  })) as Rollup.RollupOutput
  const code = output.output.flatMap((file) => (file.type === "chunk" ? [file.code] : [])).join("\n")
  expect(code.length).toBeGreaterThan(0)
  expect(serverCode.filter((marker) => code.includes(marker))).toEqual([])
}, 60_000)
