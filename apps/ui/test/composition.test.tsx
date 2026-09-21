import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal, onCleanup } from "solid-js";
import { CodeBlock, PageHeader, Tabs, WorkItemRow } from "../src/components/index.ts";
afterEach(cleanup);

it("mounts a supplied action once, including when its pending state changes", () => {
  let mounted = 0;
  let disposed = 0;
  function Action() {
    mounted++;
    onCleanup(() => disposed++);
    const [pending, setPending] = createSignal(false);
    return <button onClick={() => setPending(!pending())}>{pending() ? "pending" : "run"}</button>;
  }
  render(() => (
    <>
      <PageHeader title="Actions" actions={<Action />} />
      <WorkItemRow title="Record" actions={<Action />} />
      <CodeBlock text="example" label="Snippet" footer={<Action />} />
    </>
  ));
  expect(mounted).toBe(3);
  const buttons = screen.getAllByText("run");
  fireEvent.click(buttons[0]!);
  expect(screen.getByText("pending")).toBe(buttons[0]);
  expect(mounted).toBe(3);
  expect(disposed).toBe(0);
});

it("uses one panel instance across tab headers, tab switches, and responsive mode", () => {
  let mounted = 0;
  let disposed = 0;
  function Draft() {
    mounted++;
    onCleanup(() => disposed++);
    return <input aria-label="Draft" />;
  }
  const [tab, setTab] = createSignal("first");
  const [split, setSplit] = createSignal(false);
  render(() => (
    <Tabs
      label="Sections"
      value={tab()}
      onChange={setTab}
      split={split()}
      items={[
        { value: "first", label: "First", content: <Draft /> },
        { value: "second", label: "Second", content: <p>Details</p> },
      ]}
    />
  ));
  expect(mounted).toBe(1);
  const input = screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement;
  fireEvent.input(input, { target: { value: "keep this" } });
  setTab("second");
  setSplit(true);
  setSplit(false);
  setTab("first");
  expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
  expect(input.value).toBe("keep this");
  expect(mounted).toBe(1);
  expect(disposed).toBe(0);
});
