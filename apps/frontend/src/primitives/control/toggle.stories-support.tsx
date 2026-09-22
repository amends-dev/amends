// Development-only fixtures; production primitives do not import this module.
import { For, Show, createSignal, onMount, onCleanup, splitProps } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { StoryObj } from "storybook-solidjs-vite";
import Color from "colorjs.io";
import { Checkbox, type CheckboxProps } from "@amends/frontend/primitives/checkbox";
import { Switch } from "@amends/frontend/primitives/switch";
import { Button } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { Field } from "@amends/frontend/compositions/field";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./toggle.stories-support.css.ts";
export type Kind = "checkbox" | "switch";
type ToggleProps = Omit<CheckboxProps, "role" | "aria-checked"> & { kind: Kind };
function Toggle(props: ToggleProps) {
  const [local, native] = splitProps(props, ["kind", "indeterminate"]);
  return local.kind === "checkbox" ? (
    <Checkbox {...native} indeterminate={local.indeterminate} />
  ) : (
    <Switch {...native} />
  );
}
export function ToggleSample(props: ToggleProps & { label: string }) {
  const [local, native] = splitProps(props, ["label"]);
  return (
    <label class={s.label}>
      <Toggle {...native} />
      <Text as="span">{local.label}</Text>
    </label>
  );
}
export function ToggleComparison(props: { kind: Kind; rtl?: boolean }) {
  return (
    <main class={s.comparison} dir={props.rtl ? "rtl" : undefined}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <article class={`${colorThemes[theme]} ${s.frame} ${s.stack}`} data-toggle-theme={theme}>
            <Text as="h2" variant="heading">
              {theme === "cotton" ? "Cotton" : "Soot"}
            </Text>
            <For each={["canvas", "panel"] as const}>
              {(surface) => (
                <section
                  class={`${s.surface} ${s.stack}`}
                  style={{ "background-color": colorVars.surface[surface] }}
                >
                  <Text as="h3">On surface.{surface}</Text>
                  <ToggleSample
                    kind={props.kind}
                    label={props.kind === "checkbox" ? "Unchecked" : "Off"}
                  />
                  <ToggleSample
                    kind={props.kind}
                    label={props.kind === "checkbox" ? "Checked" : "On"}
                    checked
                  />
                  <Show when={props.kind === "checkbox"}>
                    <ToggleSample kind="checkbox" label="Mixed" indeterminate />
                  </Show>
                  <ToggleSample kind={props.kind} label="Disabled, off" disabled />
                  <ToggleSample kind={props.kind} label="Disabled, on" disabled checked />
                  <Show when={props.kind === "checkbox"}>
                    <ToggleSample kind="checkbox" label="Disabled, mixed" indeterminate disabled />
                  </Show>
                </section>
              )}
            </For>
            <fieldset disabled class={`${s.fieldset} ${s.stack}`}>
              <legend>
                <Text as="span">Disabled fieldset</Text>
              </legend>
              <ToggleSample kind={props.kind} label="Inherited disabled, off" />
              <ToggleSample kind={props.kind} label="Inherited disabled, on" checked />
            </fieldset>
          </article>
        )}
      </For>
    </main>
  );
}
export function ToggleInteraction(props: { kind: Kind }) {
  const [checked, setChecked] = createSignal(false),
    [disabled, setDisabled] = createSignal(false),
    [mixed, setMixed] = createSignal(false),
    [changes, setChanges] = createSignal(0);
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Native toggle
      </Text>
      <ToggleSample
        kind={props.kind}
        label="Notifications"
        checked={checked()}
        disabled={disabled()}
        indeterminate={mixed()}
        onChange={(event) => {
          setChecked(event.currentTarget.checked);
          setMixed(false);
          setChanges((count) => count + 1);
        }}
      />
      <Text role="status">
        Checked: {String(checked())} · changes: {changes()}
      </Text>
      <label>
        <input
          type="checkbox"
          checked={disabled()}
          onChange={(event) => setDisabled(event.currentTarget.checked)}
        />{" "}
        Disable control
      </label>
      <div class={s.row}>
        <Button
          variant="secondary"
          onClick={() => {
            setChecked(false);
            setMixed(false);
            setChanges(0);
          }}
        >
          Reset state
        </Button>
        <Show when={props.kind === "checkbox"}>
          <Button
            variant="secondary"
            onClick={() => {
              setChecked(false);
              setMixed(true);
            }}
          >
            Set mixed
          </Button>
        </Show>
      </div>
    </main>
  );
}
export function ToggleForms(props: { kind: Kind }) {
  const [error, setError] = createSignal<string>(),
    [result, setResult] = createSignal("Ready.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame} ${s.stack}`}>
      <Text as="h1" variant="heading">
        Required toggle and native reset
      </Text>
      <form
        class={s.stack}
        onSubmit={(event) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get("notifications");
          setResult(`Submitted: ${typeof value === "string" ? value : "none"}`);
        }}
        onReset={() => {
          setError(undefined);
          setResult("Ready.");
        }}
      >
        <Field
          label="Notifications"
          required
          error={error()}
          description="Turn this on before submitting this demonstration."
        >
          {(control) => (
            <Toggle
              kind={props.kind}
              name="notifications"
              value="yes"
              ref={(input) => {
                input.defaultChecked = true;
              }}
              onInvalid={() => setError("Turn notifications on.")}
              onChange={() => setError(undefined)}
              {...control}
            />
          )}
        </Field>
        <div class={s.row}>
          <Button type="submit">Submit</Button>
          <Button type="reset" variant="secondary">
            Reset
          </Button>
        </div>
      </form>
      <Text role="status">{result()}</Text>
    </main>
  );
}
export function ToggleLongLabels(props: { kind: Kind; enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style,
      before = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (before) root.setProperty("font-size", before, priority);
      else root.removeProperty("font-size");
    });
  });
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={`${colorThemes[theme]} ${s.frame} ${s.stack}`}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <ToggleSample
              kind={props.kind}
              label="Notify me when a member replies to a conversation I follow"
              checked
            />
            <ToggleSample
              kind={props.kind}
              label="workspace_abcdefghijklmnopqrstuvwxyz_1234567890"
            />
            <ToggleSample
              kind={props.kind}
              label="This preference is currently unavailable in this workspace"
              disabled
            />
          </section>
        )}
      </For>
    </main>
  );
}
export function TogglePlayground(props: ToggleProps & { theme: ColorTheme; label: string }) {
  const [local, toggle] = splitProps(props, ["theme"]);
  return (
    <main class={`${colorThemes[local.theme]} ${s.frame}`}>
      <ToggleSample {...toggle} />
    </main>
  );
}
export const verifyToggle =
  (kind: Kind): NonNullable<StoryObj["play"]> =>
  async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await doc.fonts.ready;
    const inputs = canvasElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await expect(inputs).toHaveLength(kind === "checkbox" ? 28 : 20);
    if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
    for (const input of inputs) {
      const theme = input.closest<HTMLElement>("[data-toggle-theme]")!.dataset
        .toggleTheme as ColorTheme;
      const palette = colors[theme],
        style = getComputedStyle(input),
        disabled = input.matches(":disabled"),
        filled = input.checked || input.indeterminate;
      await expect(
        new Color(style.color).deltaEOK(
          disabled ? palette.text.disabled : filled ? palette.action.onFill : palette.text.primary,
        ),
      ).toBeLessThan(0.0001);
      const background = new Color(style.backgroundColor),
        expected = new Color(
          disabled ? palette.action.disabled : filled ? palette.action.fill : "transparent",
        );
      await expect(background.alpha).toBeCloseTo(expected.alpha, 6);
      if (expected.alpha > 0) await expect(background.deltaEOK(expected)).toBeLessThan(0.0001);
      await expect(input.getBoundingClientRect().width).toBe(kind === "checkbox" ? 24 : 44);
      await expect(input.getBoundingClientRect().height).toBe(24);
      if (kind === "checkbox")
        await expect(getComputedStyle(input, "::before").opacity).toBe(filled ? "1" : "0");
    }
  };
export const toggleInteractionPlay =
  (kind: Kind): NonNullable<StoryObj["play"]> =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      control = canvas.getByRole(kind, { name: "Notifications" });
    await userEvent.click(control);
    await expect(control).toBeChecked();
    await userEvent.keyboard(" ");
    await expect(control).not.toBeChecked();
    await expect(canvas.getByRole("status")).toHaveTextContent("changes: 2");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable control" }));
    await expect(control).toBeDisabled();
    await userEvent.click(control);
    await expect(canvas.getByRole("status")).toHaveTextContent("changes: 2");
    await userEvent.click(canvas.getByRole("checkbox", { name: "Disable control" }));
    if (kind === "checkbox") {
      await userEvent.click(canvas.getByRole("button", { name: "Set mixed" }));
      await expect(control).toBePartiallyChecked();
      await userEvent.click(control);
      await expect(control).not.toBePartiallyChecked();
      await expect(control).toBeChecked();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Reset state" }));
    await expect(control).not.toBeChecked();
  };
export const toggleFormPlay =
  (kind: Kind): NonNullable<StoryObj["play"]> =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      control = canvas.getByRole(kind, { name: "Notifications" });
    await userEvent.click(control);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(control);
    await userEvent.click(canvas.getByRole("button", { name: "Submit" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Submitted: yes");
    await userEvent.click(control);
    await userEvent.click(canvas.getByRole("button", { name: "Reset" }));
    await expect(control).toBeChecked();
  };
