import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Recovery } from "../src/features/workspaces/create-workspace-form.stories.tsx";
afterEach(cleanup);
it("validates workspace names, guards pending submissions, and preserves the retry draft", async () => {
  await definePreview(preview).meta(meta).story(Recovery).run();
});
