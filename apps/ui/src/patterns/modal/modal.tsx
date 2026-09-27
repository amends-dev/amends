import { Show, createEffect, createSignal, onCleanup, splitProps, type JSX } from "solid-js";
import { classes } from "../../internal/props.ts";
import * as s from "./modal.css.ts";

export type RootProps = {
  open: boolean;
  /** Called on Escape, a click outside, or a close button; the caller closes it. */
  onClose: () => void;
  "aria-label": string;
  /** "compact" is 560px wide and as tall as its content, for short forms. Default "regular". */
  size?: "regular" | "compact";
  /** A Pane with variant="modal". */
  children: JSX.Element;
};

/**
 * A modal dialog holding a Pane: header, tabs or subtitle, a scrolling body, and Actions. It
 * uses the native dialog, so the page behind is inert and focus returns when it closes. On phones
 * it fills the screen.
 */
export function Root(props: RootProps) {
  const [dialog, setDialog] = createSignal<HTMLDialogElement>();
  createEffect(() => {
    const element = dialog();
    if (!element) return;
    if (props.open && !element.open) element.showModal();
    else if (!props.open && element.open) element.close();
  });
  // Closing, rather than only removing, returns focus to where it was when the dialog opened.
  onCleanup(() => {
    if (dialog()?.open) dialog()?.close();
  });
  return (
    <dialog
      ref={setDialog}
      class={s.dialog}
      data-size={props.size ?? "regular"}
      aria-label={props["aria-label"]}
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <Show when={props.open}>{props.children}</Show>
    </dialog>
  );
}

export type ActionsProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The modal's buttons, primary last. */
export function Actions(props: ActionsProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.actions, local.class)} />;
}
