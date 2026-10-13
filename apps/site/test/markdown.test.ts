import { describe, expect, it } from "@effect/vitest"
import {
  firstSentence,
  guideBody,
  linkTarget,
  moduleFile,
  referenceBody,
  type LinkContext
} from "../scripts/markdown.ts"

const context: LinkContext = {
  repository: "https://github.com/amends-dev/amends",
  directory: "packages/harness",
  guideFor: (file) =>
    file === "packages/sandbox" || file === "packages/sandbox/README.md" ? "/docs/packages/sandbox/" : undefined,
  isDirectory: (file) => file === "packages/connection"
}

describe("guides", () => {
  it("leads a README's links to guides, the repository, or where they already point", () => {
    expect(linkTarget("../sandbox/README.md#templates", context)).toBe("/docs/packages/sandbox/#templates")
    expect(linkTarget("../sandbox", context)).toBe("/docs/packages/sandbox/")
    expect(linkTarget("../../docs/testing.md", context)).toBe(
      "https://github.com/amends-dev/amends/blob/main/docs/testing.md"
    )
    expect(linkTarget("../connection/", context)).toBe(
      "https://github.com/amends-dev/amends/tree/main/packages/connection"
    )
    expect(linkTarget("#errors", context)).toBe("#errors")
    expect(linkTarget("https://effect.website", context)).toBe("https://effect.website")
  })

  it("drops the README's title and leaves code alone", () => {
    const readme = [
      "# @amends-dev/harness",
      "",
      "See [the sandbox](../sandbox/README.md).",
      "",
      "```md",
      "[not a link to rewrite](../sandbox/README.md)",
      "```",
      "",
      "[ref]: ../../LICENSE"
    ].join("\n")
    expect(guideBody(readme, (target) => linkTarget(target, context))).toBe(
      [
        "See [the sandbox](/docs/packages/sandbox/).",
        "",
        "```md",
        "[not a link to rewrite](../sandbox/README.md)",
        "```",
        "",
        "[ref]: https://github.com/amends-dev/amends/blob/main/LICENSE"
      ].join("\n")
    )
  })
})

describe("API reference", () => {
  it("names a module by its file, and a folder's entry point by its folder", () => {
    expect(moduleFile("Harness.ts.md")).toEqual({
      source: "Harness.ts",
      name: "Harness",
      slug: "harness"
    })
    expect(moduleFile("conformance/index.ts.md")).toEqual({
      source: "conformance/index.ts",
      name: "conformance",
      slug: "conformance"
    })
  })

  it("turns docgen's page into sections of exports, without its contents or Jekyll's matter", () => {
    const page = [
      "---",
      "title: Harness.ts",
      "nav_order: 6",
      "---",
      "",
      "## Harness.ts overview",
      "",
      "A harness runs one agent: it starts sessions.",
      "",
      "---",
      "",
      "## Exports Grouped by Category",
      "",
      "- [constructors](#constructors)",
      "",
      "---",
      "",
      "# constructors",
      "",
      "## make",
      "",
      "```ts",
      "# not a heading",
      "```"
    ].join("\n")
    const body = referenceBody(page)
    expect(body).toBe(
      [
        "A harness runs one agent: it starts sessions.",
        "",
        "## Constructors",
        "",
        "### make",
        "",
        "```ts",
        "# not a heading",
        "```"
      ].join("\n")
    )
    expect(firstSentence(body)).toBe("A harness runs one agent.")
  })
})
