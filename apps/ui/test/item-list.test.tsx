import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Activation } from "../src/compositions/item-list/item-list.stories.tsx";
afterEach(cleanup);
it("composes named native destination links", async () => {
  await definePreview(preview).meta(meta).story(Activation).run();
});
