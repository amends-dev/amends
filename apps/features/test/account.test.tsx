import { afterEach, inject, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { AppearanceAndSignOut } from "../workshop/account.stories.tsx";
import { closeScenarios } from "../workshop/scenario.ts";
afterEach(async () => {
  cleanup();
  await closeScenarios();
});
it("changes appearance and signs out a session established through the real backend", async () => {
  await definePreview(preview)
    .meta({ ...meta, args: { baseUrl: inject("workshopUrl") } })
    .story(AppearanceAndSignOut)
    .run();
});
