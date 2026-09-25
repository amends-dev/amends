import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { Notice } from "@amends/ui/compositions/notice";
import preview from "../.storybook/preview.ts";
import meta, { ExplicitAnnouncement } from "../src/compositions/notice/notice.stories.tsx";
afterEach(cleanup);
it("renders a quiet panel with a toned label and body, forwarding native attributes", () => {
  let root: HTMLDivElement | undefined;
  render(() => (
    <Notice.Root
      tone="danger"
      aria-label="Membership"
      class="consumer"
      ref={(element) => {
        root = element;
      }}
    >
      <Notice.Label id="membership-label">No longer a member</Notice.Label>
      <Notice.Body>Your membership has ended.</Notice.Body>
    </Notice.Root>
  ));
  expect(root).toHaveAttribute("data-notice-tone", "danger");
  expect(root).toHaveClass("consumer");
  expect(root).not.toHaveAttribute("role");
  expect(root).not.toHaveAttribute("aria-live");
  const [label, body] = Array.from(root?.children ?? []);
  expect(label?.tagName).toBe("P");
  expect(label).toHaveTextContent("No longer a member");
  expect(body).toHaveTextContent("Your membership has ended.");
  expect(screen.getByText("No longer a member")).toHaveAttribute("id", "membership-label");
});
it("requires Notice.Root around its parts", () => {
  expect(() => render(() => <Notice.Label>Orphan</Notice.Label>)).toThrow(
    "Notice parts require Notice.Root",
  );
});
it("keeps one announced region while its tone and text change", async () => {
  await definePreview(preview).meta(meta).story(ExplicitAnnouncement).run();
});
