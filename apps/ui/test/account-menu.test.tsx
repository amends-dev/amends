import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Interaction, NamedAction } from "../src/features/account/account-menu.stories.tsx";
afterEach(cleanup);
it("composes account actions with appearance controls and restores trigger focus", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});
it("leads with the reader's name and closes the menu as an action starts", async () => {
  await definePreview(preview).meta(meta).story(NamedAction).run();
});
