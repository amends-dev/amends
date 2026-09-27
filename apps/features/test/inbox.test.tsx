import { afterEach, inject, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Inbox } from "../workshop/inbox.stories.tsx";
import { closeScenarios } from "../workshop/scenario.ts";

afterEach(async () => {
  cleanup();
  await closeScenarios();
});
const stories = definePreview(preview).meta({ ...meta, args: { baseUrl: inject("workshopUrl") } });
it("lists the inbox newest first, settles what is seen, and takes new mentions live", async () => {
  await stories.story(Inbox).run();
});
