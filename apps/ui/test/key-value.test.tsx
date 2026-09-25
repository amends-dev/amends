import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import { KeyValue } from "@amends/ui/compositions/key-value";
import preview from "../.storybook/preview.ts";
import meta, { ComposedValues } from "../src/compositions/key-value/key-value.stories.tsx";
afterEach(cleanup);
it("keeps semantic label/value pairs, native attributes, and zero-valued content", () => {
  let root: HTMLDListElement | undefined;
  const { container } = render(() => (
    <KeyValue.Root
      aria-label="Usage"
      ref={(element) => {
        root = element;
      }}
      class="consumer"
    >
      <KeyValue.Row>
        <KeyValue.Label id="tokens-label">tokens</KeyValue.Label>
        <KeyValue.Value aria-labelledby="tokens-label">{0}</KeyValue.Value>
      </KeyValue.Row>
    </KeyValue.Root>
  ));
  expect(root).toBe(container.querySelector("dl"));
  expect(root).toHaveClass("consumer");
  expect(screen.getByRole("term")).toHaveTextContent("tokens");
  expect(screen.getByRole("definition", { name: "tokens" })).toHaveTextContent("0");
  expect(root?.firstElementChild?.tagName).toBe("DIV");
});
it("preserves focus and composed controls through value and row updates", async () => {
  await definePreview(preview).meta(meta).story(ComposedValues).run();
});
