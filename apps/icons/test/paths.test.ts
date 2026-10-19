// @vitest-environment node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, it } from "@effect/vitest"
import { iconCatalog } from "../src/catalog.ts"
import { filledIconNames, iconPaths } from "../src/paths.ts"

const readSvg = (name: string) => readFileSync(fileURLToPath(new URL(`../svg/${name}.svg`, import.meta.url)), "utf8")

it("has path data for every cataloged icon and no other", () => {
  expect(Object.keys(iconPaths)).toEqual(iconCatalog.map((icon) => icon.name))
})

it.each(iconCatalog.map((icon) => icon.name))("draws %s as its raw SVG does", (name) => {
  const fill = filledIconNames.includes(name) ? ' fill="currentColor"' : ""
  expect(readSvg(name)).toContain(`<path d="${iconPaths[name]}"${fill}/>`)
})
