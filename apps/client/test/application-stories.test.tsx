import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { SignOut } from "../src/application.stories.tsx";
const stories = definePreview(preview).meta(meta);
afterEach(cleanup);
it("runs the shared application sign-out story", async () => {
  await stories.story(SignOut).run();
});
