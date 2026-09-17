import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { CodeBlock, FollowLatest, LogDisclosure, LogList } from "../src/components/index.ts";
afterEach(cleanup);
it("opens tool data by keyboard and keeps code whitespace", async () => {
  render(() => (
    <LogList>
      <LogDisclosure time="+1s" title="read_file" outcome="ok">
        <CodeBlock label="Tool input" text={'{\n  "path": "file.ts"\n}'} />
      </LogDisclosure>
    </LogList>
  ));
  const user = userEvent.setup();
  await user.tab();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByLabelText("Tool input").textContent).toBe('{\n  "path": "file.ts"\n}');
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
});
it("follows new rows from the bottom without a footer or follow controls", () => {
  const [count, setCount] = createSignal(2);
  const { container } = render(() => (
    <FollowLatest count={count()}>
      <p>Entries</p>
    </FollowLatest>
  ));
  const viewport = screen.getByLabelText("Scrollable session log");
  Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 200 });
  viewport.scrollTop = 800;
  fireEvent.scroll(viewport);
  setCount(5);
  expect(viewport.scrollTop).toBe(1000);
  expect(container.querySelector("footer")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText("The session has ended.")).toBeNull();
});
