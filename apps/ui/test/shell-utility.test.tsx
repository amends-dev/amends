import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import meta, { PreservesControl } from "../src/compositions/shell/shell-utility.stories.tsx";
afterEach(cleanup);
it("keeps the account trigger and preferences mounted across sidebar modes", async () => {
  await definePreview(preview).meta(meta).story(PreservesControl).run();
});
