import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"

const css = readFileSync(join(import.meta.dirname, "styles.css"), "utf8")

/** The body of the CSS block that opens after `selector`, to its closing brace, nested blocks included. */
const blockAfter = (selector: string): string => {
  const start = css.indexOf(selector)
  expect(start, `${selector} is in styles.css`).toBeGreaterThanOrEqual(0)

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

/** The declarations of a block, each `property: value`, with the whitespace between them gone. */
const declarationsOf = (block: string): ReadonlyArray<string> =>
  Array.from(block.matchAll(/(--amends-[\w-]+|color-scheme):\s*([^;]+);/g), (match) => `${match[1]}: ${match[2]}`)

const lightRoot = declarationsOf(blockAfter(":root {"))

const preferredDark = declarationsOf(
  blockAfter('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {')
)

const chosenDark = declarationsOf(blockAfter(':root[data-theme="dark"] {'))

describe("the theme's Appearance", () => {
  it("is dark when the browser prefers it, unless the person chose light", () => {
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {')
    expect(preferredDark).toContain("color-scheme: dark")
  })

  it("is dark when the person chose it, with the values the browser's preference gives", () => {
    expect(chosenDark.length).toBeGreaterThan(40)
    expect(chosenDark).toEqual(preferredDark)
  })

  it("is the light values of the root otherwise, whatever the browser prefers, since light leaves the media query", () => {
    expect(lightRoot).toContain("color-scheme: light")
    expect(lightRoot.length).toBeGreaterThan(40)
  })

  it("gives dark a value for every role but the status knockout, which follows the surface it is cut from", () => {
    const darkRoles = new Set(preferredDark.map((declaration) => declaration.split(":")[0]))
    const lightOnly = lightRoot
      .map((declaration) => declaration.split(":")[0] ?? "")
      .filter((property) => !darkRoles.has(property))

    expect(lightOnly).toEqual(["--amends-status-knockout"])
  })
})

describe("the theme's tooltip utilities", () => {
  it("give each trigger an anchor of its own, so that tooltips do not borrow each other's", () => {
    const anchor = blockAfter("@utility tooltip-anchor {")

    expect(anchor).toContain("anchor-scope: --tooltip")
    expect(anchor).toContain("anchor-name: --tooltip")
  })

  it("place the popover above or below its trigger by anchor where the browser can, and in the flow where it cannot", () => {
    const above = blockAfter("@utility tooltip-above {")
    const below = blockAfter("@utility tooltip-below {")

    expect(above).toContain("position: absolute")
    expect(above).toContain("@supports (position-area: top)")
    expect(above).toContain("position-area: top")
    expect(below).toContain("position: absolute")
    expect(below).toContain("@supports (position-area: bottom)")
    expect(below).toContain("position-area: bottom")
  })
})
