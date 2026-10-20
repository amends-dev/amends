import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const read = (name: string): string => readFileSync(join(import.meta.dirname, name), "utf8")

const motion = read("motion.css")

const sources = readdirSync(import.meta.dirname)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => read(name))

/** The body of the CSS block that opens at `start`, to its closing brace, nested blocks included. */
const blockFrom = (css: string, start: number): string => {
  const open = css.indexOf("{", start)
  let depth = 0

  for (let index = open; index < css.length; index++) {
    depth += css[index] === "{" ? 1 : css[index] === "}" ? -1 : 0
    if (depth === 0) {
      return css.slice(open + 1, index)
    }
  }

  return css.slice(open + 1)
}

const utilities = new Map(
  Array.from(motion.matchAll(/@utility ([\w-]+) \{/g), (match) => [match[1] ?? "", blockFrom(motion, match.index)])
)

const keyframes = new Set(Array.from(motion.matchAll(/@keyframes ([\w-]+) \{/g), (match) => match[1]))

describe("motion.css", () => {
  it("writes a utility for every motion class the renderers name", () => {
    const named = new Set(
      sources.flatMap((source) =>
        Array.from(source.matchAll(/(?<![\w-])(?:logo|art|loading)-[a-z]+(?:-[a-z]+)*/g), (match) => match[0])
      )
    )

    expect(named.size).toBeGreaterThan(0)
    for (const name of named) {
      expect(utilities.has(name), `${name} has a utility`).toBe(true)
    }
  })

  it("names a keyframes rule for every animation it sets", () => {
    for (const [name, block] of utilities) {
      for (const match of block.matchAll(/animation:\s*([\w-]+)\s/g)) {
        expect(keyframes.has(match[1]), `${name} animates ${match[1]}`).toBe(true)
      }
    }
  })

  it("stills every animation and transition when the reader prefers less motion", () => {
    for (const [name, block] of utilities) {
      const stills = block.slice(block.indexOf("@media (prefers-reduced-motion: reduce)"))
      const animates = /animation:\s*(?!none)[\w-]+\s/.test(block)
      const animatesOnlyWhenAccepted = block.includes("@media (prefers-reduced-motion: no-preference)")

      if (animates && !animatesOnlyWhenAccepted) {
        expect(stills, `${name} stills its animation`).toMatch(/animation:\s*none/)
      }

      if (/transition:\s*(?!none)/.test(block)) {
        expect(stills, `${name} stills its transition`).toMatch(/transition:\s*none/)
      }
    }
  })
})
