import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import {
  Button,
  IconButton,
  Field,
  TextField,
  TextArea,
  Checkbox,
} from "../src/components/index.ts";

afterEach(cleanup);

describe("buttons", () => {
  it("does not submit by default, but forwards explicit submit behavior", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(() => (
      <form onSubmit={submit}>
        <Button>Preview</Button>
        <Button type="submit">Save</Button>
      </form>
    ));
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("keeps focus and name while pending, blocking clicks and keyboard submission", async () => {
    const user = userEvent.setup();
    const [pending, setPending] = createSignal(false);
    const click = vi.fn();
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(() => (
      <form onSubmit={submit}>
        <Button type="submit" pending={pending()} onClick={click}>
          Save
        </Button>
      </form>
    ));
    const button = screen.getByRole("button", { name: "Save" });
    button.focus();
    setPending(true);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    await user.click(button);
    await user.keyboard("{Enter} ");
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    setPending(false);
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
  });

  it("supports Solid bound event handlers, native refs, and explicit disabled state", async () => {
    const user = userEvent.setup();
    const bound = vi.fn();
    let ref: HTMLButtonElement | undefined;
    render(() => (
      <>
        <Button
          ref={(node) => {
            ref = node;
          }}
          onClick={[bound, "task-1"]}
        >
          Assign
        </Button>
        <Button disabled onClick={bound}>
          Unavailable
        </Button>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(bound.mock.calls[0]?.[0]).toBe("task-1");
    expect(ref).toBe(screen.getByRole("button", { name: "Assign" }));
    await user.click(screen.getByRole("button", { name: "Unavailable" }));
    expect(bound).toHaveBeenCalledOnce();
  });

  it("enforces aria-disabled activation blocking and preserves icon labels while pending", async () => {
    const click = vi.fn();
    const user = userEvent.setup();
    render(() => (
      <>
        <Button aria-disabled="true" onClick={click}>
          Locked
        </Button>
        <IconButton label="Refresh tasks" pending>
          <svg>
            <title>Unrelated graphic</title>
          </svg>
        </IconButton>
      </>
    ));
    await user.click(screen.getByRole("button", { name: "Locked" }));
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Refresh tasks" }).getAttribute("aria-busy")).toBe(
      "true",
    );
  });
});

describe("fields", () => {
  it("associates unique labels, descriptions, errors, and caller descriptions reactively", () => {
    const [error, setError] = createSignal<string | undefined>();
    render(() => (
      <>
        <p id="extra">Additional context</p>
        <Field label="Title" description="Use a short title." error={error()} required>
          <TextField aria-describedby="extra" />
        </Field>
        <Field label="Notes">
          <TextArea />
        </Field>
      </>
    ));
    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    const notes = screen.getByLabelText("Notes");
    expect(title.id).not.toBe(notes.id);
    expect(title.required).toBe(true);
    const described = () =>
      title
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent);
    expect(described()).toEqual(["Use a short title.", "Additional context"]);
    setError("A title is required.");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(described()).toEqual([
      "Use a short title.",
      "A title is required.",
      "Additional context",
    ]);
    setError(undefined);
    expect(title.getAttribute("aria-invalid")).not.toBe("true");
    expect(described()).toEqual(["Use a short title.", "Additional context"]);
  });

  it("lets the Field own identity and disabled state and forwards native input attributes", async () => {
    const [disabled, setDisabled] = createSignal(true);
    const user = userEvent.setup();
    let ref: HTMLInputElement | undefined;
    render(() => (
      <Field id="email" label="Email" disabled={disabled()}>
        <TextField
          id="ignored"
          ref={(node) => {
            ref = node;
          }}
          type="email"
          name="email"
          autocomplete="email"
        />
      </Field>
    ));
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.id).toBe("email");
    expect(input.disabled).toBe(true);
    expect(ref).toBe(input);
    setDisabled(false);
    await user.type(input, "jo@example.test");
    expect(input.value).toBe("jo@example.test");
    expect(input.type).toBe("email");
  });

  it("preserves multiline editing, controlled updates, and form serialization", async () => {
    const user = userEvent.setup();
    const [value, setValue] = createSignal("First");
    const { container } = render(() => (
      <form>
        <Field label="Instructions">
          <TextArea
            name="instructions"
            value={value()}
            onInput={(e) => setValue(e.currentTarget.value)}
          />
        </Field>
        <TextField name="readOnly" aria-label="Fixed" value="fixed" readOnly />
      </form>
    ));
    const textarea = screen.getByLabelText("Instructions");
    await user.click(textarea);
    await user.keyboard("{End}{Enter}Second");
    expect(value()).toBe("First\nSecond");
    setValue("Replaced");
    expect((textarea as HTMLTextAreaElement).value).toBe("Replaced");
    expect(new FormData(container.querySelector("form")!).get("instructions")).toBe("Replaced");
    await user.type(screen.getByLabelText("Fixed"), "change");
    expect((screen.getByLabelText("Fixed") as HTMLInputElement).value).toBe("fixed");
  });
});

describe("checkbox", () => {
  it("supports label clicks and Space, partial selection, native refs, and form values", async () => {
    const user = userEvent.setup();
    let ref: HTMLInputElement | undefined;
    const { container } = render(() => (
      <form>
        <Checkbox
          ref={(node) => {
            ref = node;
          }}
          label="Notify me"
          description="When the work settles."
          name="notify"
          value="yes"
          indeterminate
        />
      </form>
    ));
    const input = screen.getByRole("checkbox", { name: "Notify me" }) as HTMLInputElement;
    expect(ref).toBe(input);
    expect(input.indeterminate).toBe(true);
    await user.click(screen.getByText("Notify me"));
    expect(input.checked).toBe(true);
    expect(input.indeterminate).toBe(false);
    expect(new FormData(container.querySelector("form")!).get("notify")).toBe("yes");
    input.focus();
    await user.keyboard(" ");
    expect(input.checked).toBe(false);
    expect(new FormData(container.querySelector("form")!).has("notify")).toBe(false);
  });

  it("respects required and disabled states and native form reset", async () => {
    const user = userEvent.setup();
    const { container } = render(() => (
      <form>
        <Checkbox label="Required" required />
        <Checkbox label="Disabled" disabled />
        <Button type="reset">Reset</Button>
      </form>
    ));
    const input = screen.getByRole("checkbox", { name: "Required" }) as HTMLInputElement;
    expect(input.validity.valueMissing).toBe(true);
    await user.click(input);
    expect(input.validity.valueMissing).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "Disabled" }));
    expect((screen.getByRole("checkbox", { name: "Disabled" }) as HTMLInputElement).checked).toBe(
      false,
    );
    container.querySelector("form")!.reset();
    expect(input.checked).toBe(false);
  });
});
