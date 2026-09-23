import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.ts";
import { ApplicationFrame, ApplicationPage } from "@amends/ui/compositions/application";
import meta, { CallerActions } from "../src/compositions/application/application.stories.tsx";
const stories = definePreview(preview).meta(meta);
afterEach(cleanup);
it("renders caller-owned page copy and actions without client state or routing", () => {
  render(() => (
    <ApplicationFrame>
      <ApplicationPage title="Example" message="Details">
        <a href="/next">Next</a>
      </ApplicationPage>
    </ApplicationFrame>
  ));
  expect(screen.getByRole("main")).toContainElement(
    screen.getByRole("heading", { name: "Example" }),
  );
  expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/next");
  expect(screen.queryByText("Amends")).not.toBeInTheDocument();
});
it("runs the caller-owned action story", async () => {
  await stories.story(CallerActions).run();
});
