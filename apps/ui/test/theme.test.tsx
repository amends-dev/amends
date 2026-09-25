import { afterEach, it } from "@effect/vitest";
import { cleanup } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import preview from "../.storybook/preview.ts";
import meta, { Reactive } from "../src/foundations/theme/theme-provider.stories.tsx";

afterEach(cleanup);
it("preserves the draft while changing the theme scope", async () => {
  await definePreview(preview).meta(meta).story(Reactive).run();
});
export function typeExamples() {
  <ThemeProvider theme="cotton">Content</ThemeProvider>;
  // @ts-expect-error Theme selection belongs to the caller.
  <ThemeProvider />;
  // @ts-expect-error Only the reviewed palette names are supported.
  <ThemeProvider theme="blue" />;
}
