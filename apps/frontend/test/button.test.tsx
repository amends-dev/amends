import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { createSignal, type JSX } from "solid-js";
import { Button, type ButtonVariant } from "@amends/frontend/primitives/button";

afterEach(cleanup);

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

it.each<ButtonVariant>(["primary", "secondary"])(
  "prevents %s activation when disabled and resumes when enabled",
  (variant) => {
    const [disabled, setDisabled] = createSignal(true);
    const clicked = vi.fn();
    render(() => (
      <Button variant={variant} disabled={disabled()} onClick={clicked}>
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

it.each<ButtonVariant>(["primary", "secondary"])(
  "submits %s only when explicitly requested and preserves the submitter",
  (variant) => {
    const submitted = vi.fn();
    render(() => (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted(event.submitter);
        }}
      >
        <Button variant={variant}>Save draft</Button>
        <Button variant={variant} type="submit" name="intent" value="publish">
          Publish reply
        </Button>
        <Button variant={variant} type="submit" disabled>
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

it("switches variants without replacing the button or losing focus, native behavior, or consumer classes", () => {
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
  setVariant("secondary");
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
});

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
