import { it } from "@effect/vitest";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Interaction, InDialog } from "../src/primitives/combobox/combobox.stories.tsx";
it("filters, selects, clears the query, and presents no matches", async () => {
  await definePreview(preview).meta(meta).story(Interaction).run();
});

it("selects an option inside a native dialog without losing input focus", async () => {
  await definePreview(preview).meta(meta).story(InDialog).run();
});
