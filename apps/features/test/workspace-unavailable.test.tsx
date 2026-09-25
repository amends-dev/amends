import { afterEach, inject, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { Removed, Invited, NoAccess } from "../workshop/unavailable.stories.tsx";
import { closeScenarios } from "../workshop/scenario.ts";

afterEach(async () => {
  cleanup();
  await closeScenarios();
});
const stories = definePreview(preview).meta({ ...meta, args: { baseUrl: inject("workshopUrl") } });
for (const [name, story] of Object.entries({ Removed, Invited, NoAccess }))
  it(`explains ${name} access through HTTP and PostgreSQL`, async () => {
    await stories.story(story).run();
  });
