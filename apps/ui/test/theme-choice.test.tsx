import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Interaction } from "../src/features/appearance/theme-choice.stories.tsx";
afterEach(cleanup);
it("selects one theme preference without replacing the controls", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});
