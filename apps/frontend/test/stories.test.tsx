import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Rendering } from "../src/setup.stories.tsx";

const stories = definePreview(preview).meta(meta);
afterEach(cleanup);

it("runs the Solid rendering and interaction story", async () => {
  await stories.story(Rendering).run();
});
