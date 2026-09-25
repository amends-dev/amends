import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import nameMeta, { Submission } from "../src/features/settings/workspace-name-form.stories.tsx";
afterEach(cleanup);
it("submits a controlled workspace name", async () => {
  await definePreview(preview).meta(nameMeta).story(Submission).run();
});
