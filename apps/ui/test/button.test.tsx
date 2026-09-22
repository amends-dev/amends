import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal, type JSX } from "solid-js";
import { Button, type ButtonVariant, type ButtonTone } from "@amends/ui/primitives/button";
import { IconButton } from "@amends/ui/primitives/icon-button";

afterEach(cleanup);
const buttonCases = (["neutral", "danger"] as const).flatMap((tone) =>
  (["primary", "secondary", "ghost"] as const).map((variant) => ({ tone, variant })),
);

it("updates Button and IconButton tone independently of variant without replacing or blurring them", () => {
  const [tone, setTone] = createSignal<ButtonTone | undefined>();
  const click = vi.fn();
  render(() => (
    <>
      <Button tone={tone()} variant="secondary" onClick={click}>
        Delete thread
      </Button>
      <IconButton tone={tone()} variant="ghost" aria-label="Delete draft" onClick={click}>
        ×
      </IconButton>
    </>
  ));
  const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
  const original = buttons.map((button) => button.className);
  buttons[0]!.focus();
  setTone("danger");
  expect(screen.getAllByRole("button")).toEqual(buttons);
  expect(buttons[0]).toHaveFocus();
  buttons.forEach((button, index) => {
    expect(button.className).not.toBe(original[index]);
    expect(button).not.toHaveAttribute("tone");
    expect(button).not.toHaveAttribute("aria-live");
    button.click();
  });
  expect(click).toHaveBeenCalledTimes(2);
  setTone(undefined);
  expect(buttons.map((button) => button.className)).toEqual(original);
});

it("renders one native button, defaults to a non-submitting type, and preserves inline content", () => {
  const { container } = render(() => (
    <Button>
      Publish <span>reply</span>
    </Button>
  ));
  const button = screen.getByRole("button", { name: "Publish reply" });
  expect(container.children).toHaveLength(1);
  expect(button.tagName).toBe("BUTTON");
  expect(button).toHaveAttribute("type", "button");
  expect(button.children).toHaveLength(1);
  expect(button.firstElementChild?.tagName).toBe("SPAN");
});

it("forwards native attributes, styles, bound events, and the native element ref", () => {
  let ref: HTMLButtonElement | undefined;
  const clicked = vi.fn();
  render(() => (
    <Button
      ref={(node) => {
        ref = node;
      }}
      id="publish"
      title="Publish this reply"
      name="intent"
      value="publish"
      form="composer"
      formNoValidate
      aria-describedby="context"
      data-state="ready"
      style={{ "margin-top": "1px" }}
      onClick={[clicked, "reply"]}
    >
      Publish reply
    </Button>
  ));
  const button = screen.getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
  expect(ref).toBe(button);
  for (const [name, value] of Object.entries({
    id: "publish",
    title: "Publish this reply",
    name: "intent",
    value: "publish",
    form: "composer",
    "aria-describedby": "context",
    "data-state": "ready",
  })) {
    expect(button).toHaveAttribute(name, value);
  }
  expect(button.formNoValidate).toBe(true);
  expect(button.style.marginTop).toBe("1px");
  button.click();
  expect(clicked).toHaveBeenCalledOnce();
  expect(clicked).toHaveBeenCalledWith("reply", expect.any(MouseEvent));
});

it.each(buttonCases)(
  "prevents $tone $variant activation when disabled and resumes when enabled",
  ({ tone, variant }) => {
    const [disabled, setDisabled] = createSignal(true);
    const clicked = vi.fn();
    render(() => (
      <Button variant={variant} tone={tone} disabled={disabled()} onClick={clicked}>
        Publish reply
      </Button>
    ));
    const button = screen.getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
    button.click();
    expect(clicked).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
    setDisabled(false);
    expect(screen.getByRole("button", { name: "Publish reply" })).toBe(button);
    button.click();
    expect(clicked).toHaveBeenCalledOnce();
  },
);

it.each(buttonCases)(
  "submits $tone $variant only when explicitly requested and preserves the submitter",
  ({ tone, variant }) => {
    const submitted = vi.fn();
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted(event.submitter);
        }}
      >
        <Button variant={variant} tone={tone}>
          Save draft
        </Button>
        <Button variant={variant} tone={tone} type="submit" name="intent" value="publish">
          Publish reply
        </Button>
        <Button variant={variant} tone={tone} type="submit" disabled>
          Unavailable
        </Button>
      </form>
    ));
    (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement).click();
    expect(submitted).not.toHaveBeenCalled();
    const submit = screen.getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
    submit.click();
    expect(submitted).toHaveBeenCalledOnce();
    expect(submitted).toHaveBeenCalledWith(submit);
    (screen.getByRole("button", { name: "Unavailable" }) as HTMLButtonElement).click();
    expect(submitted).toHaveBeenCalledOnce();
  },
);

it.each<ButtonVariant>(["secondary", "ghost"])(
  "switches to %s without replacing the button or losing focus, native behavior, or consumer classes",
  (nextVariant) => {
    const [variant, setVariant] = createSignal<ButtonVariant | undefined>();
    const clicked = vi.fn();
    render(() => (
      <Button variant={variant()} class="consumer" classList={{ selected: true }} onClick={clicked}>
        Save draft
      </Button>
    ));
    const button = screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement;
    const initialClass = button.className;
    setVariant("primary");
    expect(button.className).toBe(initialClass);
    button.focus();
    setVariant(nextVariant);
    expect(screen.getByRole("button", { name: "Save draft" })).toBe(button);
    expect(button.className).not.toBe(initialClass);
    expect(button).toHaveClass("consumer", "selected");
    expect(button).not.toHaveAttribute("variant");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveFocus();
    button.click();
    expect(clicked).toHaveBeenCalledOnce();
    setVariant(undefined);
    expect(button.className).toBe(initialClass);
    expect(button).toHaveFocus();
  },
);

it("lets the caller prevent default submission without suppressing the click", () => {
  const clicked = vi.fn();
  const submitted = vi.fn();
  render(() => (
    <form onSubmit={submitted}>
      <Button
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          clicked();
        }}
      >
        Review first
      </Button>
    </form>
  ));
  (screen.getByRole("button") as HTMLButtonElement).click();
  expect(clicked).toHaveBeenCalledOnce();
  expect(submitted).not.toHaveBeenCalled();
});

it("updates native props, content, classes, and handlers without replacing or blurring the button", () => {
  const [changed, setChanged] = createSignal(false);
  const [type, setType] = createSignal<JSX.ButtonHTMLAttributes<HTMLButtonElement>["type"]>();
  const first = vi.fn();
  const second = vi.fn();
  render(() => (
    <Button
      type={type()}
      name={changed() ? "updated" : "original"}
      aria-label={changed() ? "Updated action" : "Action"}
      class={changed() ? "new" : "old"}
      classList={{ selected: changed(), old: false }}
      onClick={changed() ? second : first}
    >
      {changed() ? "Updated" : "Original"}
    </Button>
  ));
  const button = screen.getByRole("button", { name: "Action" }) as HTMLButtonElement;
  const originalClass = button.className;
  expect(button).toHaveClass("old");
  button.focus();
  button.click();
  setChanged(true);
  setType("reset");
  expect(screen.getByRole("button", { name: "Updated action" })).toBe(button);
  expect(button).toHaveTextContent("Updated");
  expect(button).toHaveAttribute("name", "updated");
  expect(button).toHaveAttribute("type", "reset");
  expect(button).toHaveClass("new", "selected");
  expect(button).not.toHaveClass("old");
  expect(button).toHaveFocus();
  button.click();
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  setChanged(false);
  setType(undefined);
  expect(button.className).toBe(originalClass);
  expect(button).toHaveAttribute("type", "button");
});

it.each(buttonCases)(
  "keeps the $tone $variant button focused and named while pending, blocks clicks, and recovers",
  ({ tone, variant }) => {
    const [pending, setPending] = createSignal(false);
    const clicked = vi.fn();
    render(() => (
      <Button variant={variant} tone={tone} pending={pending()} onClick={[clicked, "publish"]}>
        Publish reply
      </Button>
    ));
    const button = screen.getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
    button.focus();
    setPending(true);
    expect(screen.getByRole("button", { name: "Publish reply" })).toBe(button);
    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("pending");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    button.click();
    expect(clicked).not.toHaveBeenCalled();
    setPending(false);
    expect(button).toHaveFocus();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button.querySelector("svg")).toBeNull();
    button.click();
    expect(clicked).toHaveBeenCalledExactlyOnceWith("publish", expect.any(MouseEvent));
  },
);

it.each(["submit", "reset"] as const)(
  "blocks the native %s action while pending and restores it afterward",
  (type) => {
    const [pending, setPending] = createSignal(true);
    const action = vi.fn();
    const clicked = vi.fn();
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          action("submit");
        }}
        onReset={() => action("reset")}
      >
        <Button type={type} pending={pending()} onClick={clicked}>
          Act
        </Button>
      </form>
    ));
    const button = screen.getByRole("button", { name: "Act" }) as HTMLButtonElement;
    button.click();
    expect(clicked).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    setPending(false);
    button.click();
    expect(clicked).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledExactlyOnceWith(type);
  },
);

it("preserves caller ARIA semantics outside pending and lets native disabled take precedence", () => {
  const [pending, setPending] = createSignal(false);
  const [disabled, setDisabled] = createSignal(false);
  const [busy, setBusy] = createSignal<"true" | "false">("false");
  const clicked = vi.fn();
  render(() => (
    <Button
      pending={pending()}
      disabled={disabled()}
      aria-busy={busy()}
      aria-disabled="true"
      onClick={clicked}
    >
      Act
    </Button>
  ));
  const button = screen.getByRole("button", { name: "Act" }) as HTMLButtonElement;
  // aria-disabled alone retains its native informational meaning.
  button.click();
  expect(clicked).toHaveBeenCalledOnce();
  setPending(true);
  expect(button).toHaveAttribute("aria-busy", "true");
  setDisabled(true);
  expect(button).toBeDisabled();
  button.click();
  expect(clicked).toHaveBeenCalledOnce();
  setPending(false);
  expect(button).toHaveAttribute("aria-busy", "false");
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(button).toBeDisabled();
  setBusy("true");
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button.querySelector("svg")).toBeNull();
  setDisabled(false);
  button.click();
  expect(clicked).toHaveBeenCalledTimes(2);
});

it("allows the initiating submission when the click handler synchronously enters pending", () => {
  const [pending, setPending] = createSignal(false);
  const submitted = vi.fn();
  render(() => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted();
      }}
    >
      <Button type="submit" pending={pending()} onClick={() => setPending(true)}>
        Publish reply
      </Button>
    </form>
  ));
  const button = screen.getByRole("button", { name: "Publish reply" }) as HTMLButtonElement;
  button.click();
  expect(submitted).toHaveBeenCalledOnce();
  expect(button).toHaveAttribute("aria-busy", "true");
  button.click();
  expect(submitted).toHaveBeenCalledOnce();
});

it("releases indicator measurements when pending ends and when the button unmounts", () => {
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = observe;
      disconnect = disconnect;
    },
  );
  try {
    const [pending, setPending] = createSignal(false);
    const view = render(() => <Button pending={pending()}>Publish reply</Button>);
    expect(observe).not.toHaveBeenCalled();
    setPending(true);
    expect(observe).toHaveBeenCalledOnce();
    setPending(false);
    expect(disconnect).toHaveBeenCalledOnce();
    setPending(true);
    expect(observe).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});
