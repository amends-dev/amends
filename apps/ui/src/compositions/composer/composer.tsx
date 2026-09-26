import { createEffect, on, splitProps, type JSX } from "solid-js";
import { FormError } from "../form-error.tsx";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./composer.css.ts";

export type RootProps = Omit<JSX.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  /** Sending was asked for, by the send button or Enter in the input. */
  onSend: () => void;
  /** `comfortable` (default) for a page; `compact` for a narrow thread panel. */
  density?: "comfortable" | "compact";
};
/**
 * Writing a message: Root > Frame(Input + Actions) + an optional Note or Error. Root is a form;
 * submitting it calls `onSend`, and the caller owns the draft, sending, and its outcome.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["onSend", "density", "class", "classList"]);
  return (
    <form
      {...native}
      data-density={local.density ?? "comfortable"}
      class={classes(s.root, local.class, local.classList)}
      onSubmit={(event) => {
        event.preventDefault();
        local.onSend();
      }}
    />
  );
}
export function Frame(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.frame, local.class, local.classList)} />;
}
export type InputProps = Omit<
  JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onInput" | "rows"
> & {
  value: string;
  onInput: (value: string) => void;
} & ({ "aria-label": string } | { "aria-labelledby": string });
/**
 * The message text. Enter sends it and Shift+Enter starts a new line, except while an input
 * method is composing. It grows with its text up to about half the viewport, then scrolls.
 */
export function Input(props: InputProps) {
  const [local, native] = splitProps(props, [
    "value",
    "onInput",
    "onKeyDown",
    "class",
    "classList",
    "ref",
  ]);
  let input!: HTMLTextAreaElement;
  const fit = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  createEffect(
    on(
      () => local.value,
      () => queueMicrotask(fit),
    ),
  );
  return (
    <textarea
      {...native}
      ref={(node) => {
        input = node;
        if (typeof local.ref === "function") local.ref(node);
      }}
      rows={2}
      value={local.value}
      class={classes(s.input, local.class, local.classList)}
      onInput={(event) => {
        local.onInput(event.currentTarget.value);
        fit();
      }}
      onKeyDown={(event) => {
        if (typeof local.onKeyDown === "function") local.onKeyDown(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
/** Controls under the text, ending with the send button. */
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.actions, local.class, local.classList)} />;
}
/** What sending does, under the frame. Give it an `id` and describe the Input by it. */
export function Note(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.note, local.class, local.classList)} />;
}
/** Why sending failed; describe the Input by its `id` and mark the Input invalid. */
export function Error(props: { id: string; children: JSX.Element }) {
  return <FormError id={props.id}>{props.children}</FormError>;
}
export type DockProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** The surface the composer sits on, which scrolling content passes beneath. */
  surface?: "canvas" | "panel";
};
/** Keeps a composer at the bottom of its scrolling region, over the content behind it. */
export function Dock(props: DockProps) {
  const [local, native] = splitProps(props, ["surface", "class", "classList"]);
  return (
    <div
      {...native}
      class={classes(
        `${s.docked} ${s.dock[local.surface ?? "canvas"]}`,
        local.class,
        local.classList,
      )}
    />
  );
}
