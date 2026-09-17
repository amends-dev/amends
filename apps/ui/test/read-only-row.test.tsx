import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { WorkItemRow } from "../src/components/index.ts";
afterEach(cleanup);
it("renders diagnostic rows without a pretend action", () => {
  render(() => (
    <WorkItemRow title="model" titleKind="code" supportingTone="danger" supportingText="No route" />
  ));
  expect(screen.getByRole("listitem")).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
});
