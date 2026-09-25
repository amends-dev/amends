import { createEffect, createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import * as s from "./code-input.css.ts";

export type CodeInputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "children" | "value" | "maxlength" | "maxLength" | "pattern" | "size" | "dir"
> & {
  value?: string;
};

/** Six-digit entry. Native editing and form behavior; labels and verification belong to callers. */
export function CodeInput(props: CodeInputProps): JSX.Element {
  const [local, native] = splitProps(props, ["class", "classList", "style", "value"]);
  let input!: HTMLInputElement;
  const [atEnd, setAtEnd] = createSignal(false);
  const syncCaret = () =>
    setAtEnd(input.value.length === 6 && input.selectionStart === 6 && input.selectionEnd === 6);
  createEffect(() => {
    const value = local.value;
    // Avoid redundant writes: they can reset selection in instrumented inputs.
    if (value !== undefined && input.value !== value) input.value = value;
    syncCaret();
  });
  onMount(() => {
    // Only observe selection; the browser still owns all editing, paste, and undo.
    const events = ["input", "focus", "keyup", "pointerup", "select"] as const;
    for (const event of events) input.addEventListener(event, syncCaret);
    input.ownerDocument.addEventListener("selectionchange", syncCaret);
    syncCaret();
    onCleanup(() => {
      for (const event of events) input.removeEventListener(event, syncCaret);
      input.ownerDocument.removeEventListener("selectionchange", syncCaret);
    });
  });
  const classes = () =>
    [
      s.root,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <span class={classes()} style={local.style} data-at-end={atEnd() || undefined}>
      <span class={s.cells} aria-hidden="true">
        <span class={s.cell} />
        <span class={s.cell} />
        <span class={s.cell} />
        <span class={s.cell} />
        <span class={s.cell} />
        <span class={s.cell} />
      </span>
      <span class={s.viewport}>
        <input
          ref={(element) => {
            input = element;
          }}
          inputmode="numeric"
          autocomplete="one-time-code"
          spellcheck={false}
          {...native}
          type="text"
          dir="ltr"
          maxLength={6}
          pattern="[0-9]{6}"
          class={s.input}
        />
        <span class={s.endCaret} aria-hidden="true" />
      </span>
    </span>
  );
}
