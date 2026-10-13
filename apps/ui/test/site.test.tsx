import { afterEach, describe, it } from "@effect/vitest"
import { cleanup } from "@solidjs/testing-library"
import { definePreview } from "storybook-solidjs-vite/next"
import preview from "../.storybook/preview.tsx"
import siteMeta, { Home, Packages } from "../src/site/site.stories.tsx"

afterEach(() => cleanup())

describe("site sections", () => {
  const stories = definePreview(preview).meta(siteMeta)
  it("composes the home page: the headline, the app's picture, and the site's links", async () => {
    await stories.story(Home).run()
  })
  it("marks the current page and lists the adapters of each contract", async () => {
    await stories.story(Packages).run()
  })
})
