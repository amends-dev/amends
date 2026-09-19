import { Text } from "./text.tsx";
import {
  createEffect,
  createUniqueId,
  onCleanup,
  children,
  Show,
  untrack,
  type JSX,
} from "solid-js";
import { Button, IconButton } from "./button.tsx";
import * as s from "./dialog.css.ts";

export interface DialogProps {
  open: boolean;
  placement?: "center" | "start" | "end";
  showClose?: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Keep the dialog name accessible without rendering a title row. */
  hideTitle?: boolean;
  /** Fill the drawer with content that owns its padding and scrolling. */
  contentLayout?: "flow" | "fill";
  description?: string;
  children?: JSX.Element;
  actions?: JSX.Element;
  /** Escape and backdrop dismissal. Explicit actions remain owned by the caller. */
  dismissible?: boolean;
  closeOnBackdrop?: boolean;
  /** Defaults to the heading, suitable for reading before interacting. */
  initialFocus?: () => HTMLElement | undefined;
  /** Overrides the original trigger, for example when an operation removes that trigger. */
  returnFocus?: () => HTMLElement | undefined;
  role?: "dialog" | "alertdialog";
}
/** Controlled native modal. Keep it in its theme scope; the browser promotes it to the top layer. */
export function Dialog(props: DialogProps) {
  const actionsSlot = children(() => props.actions);
  const id = createUniqueId();
  let element!: HTMLDialogElement;
  let heading!: HTMLHeadingElement;
  let closeButton!: HTMLButtonElement;
  let previous: HTMLElement | undefined;
  let outsideDown = false;
  let disposed = false;
  const restore = () => {
    if (!previous) return;
    const target = props.returnFocus?.() ?? (previous.isConnected ? previous : undefined);
    target?.focus({ preventScroll: true });
    previous = undefined;
  };
  const close = () => {
    if (element.open) {
      element.close();
      restore();
    }
  };
  createEffect(() => {
    const open = props.open;
    untrack(() => {
      if (open && !element.open) {
        const active = element.ownerDocument.activeElement;
        previous = active instanceof HTMLElement ? active : undefined;
        element.showModal();
        (
          props.initialFocus?.() ??
          (props.hideTitle ? (props.showClose ? closeButton : element) : heading)
        ).focus({ preventScroll: true });
      } else if (!open) close();
    });
  });
  onCleanup(() => {
    disposed = true;
    close();
  });
  const outside = (event: MouseEvent) => {
    const rect = element.getBoundingClientRect();
    return (
      event.target === element &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  };
  return (
    <dialog
      ref={(node) => {
        element = node;
      }}
      class={s.dialog}
      data-placement={props.placement ?? "center"}
      data-content-layout={props.contentLayout ?? "flow"}
      data-amends-modal
      role={props.role ?? "dialog"}
      tabIndex={-1}
      aria-label={props.hideTitle ? props.title : undefined}
      aria-labelledby={props.hideTitle ? undefined : `${id}-title`}
      aria-describedby={props.description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (props.dismissible !== false) props.onOpenChange(false);
      }}
      onClose={() => {
        if (!disposed && !element.open && props.open) {
          restore();
          props.onOpenChange(false);
        }
      }}
      onPointerDown={(event) => {
        outsideDown = outside(event);
      }}
      onClick={(event) => {
        if (outsideDown && outside(event) && props.closeOnBackdrop && props.dismissible !== false)
          props.onOpenChange(false);
        outsideDown = false;
      }}
    >
      <div class={s.content}>
        <Show when={props.showClose}>
          <IconButton
            ref={(node) => {
              closeButton = node;
            }}
            class={s.close}
            label={`Close ${props.title.toLowerCase()}`}
            variant={props.placement === "end" ? "secondary" : "ghost"}
            size={props.placement === "end" ? "regular" : "touch"}
            onClick={() => props.onOpenChange(false)}
          >
            ×
          </IconButton>
        </Show>
        <Show when={!props.hideTitle || props.description}>
          <header class={s.header} classList={{ [s.withClose]: props.showClose }}>
            <Show when={!props.hideTitle}>
              <Text
                as="h2"
                variant="heading"
                ref={(node) => {
                  heading = node;
                }}
                tabIndex={-1}
                id={`${id}-title`}
                class={s.heading}
              >
                {props.title}
              </Text>
            </Show>
            <Show when={props.description}>
              <Text as="p" variant="body" id={`${id}-description`} class={s.description}>
                {props.description}
              </Text>
            </Show>
          </header>
        </Show>
        {props.children}
        <Show when={actionsSlot()}>
          <footer class={s.actions}>{actionsSlot()}</footer>
        </Show>
      </div>
    </dialog>
  );
}

export interface ConfirmationDialogProps extends Omit<
  DialogProps,
  | "children"
  | "actions"
  | "role"
  | "initialFocus"
  | "dismissible"
  | "closeOnBackdrop"
  | "placement"
  | "showClose"
  | "hideTitle"
  | "contentLayout"
> {
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | undefined;
  tone?: "neutral" | "danger";
}
/** Focuses the safe action first and stays open until the caller resolves the command. */
export function ConfirmationDialog(props: ConfirmationDialogProps) {
  let cancel!: HTMLButtonElement;
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      {...(props.description === undefined ? {} : { description: props.description })}
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
      role="alertdialog"
      initialFocus={() => cancel}
      dismissible={!props.pending}
      actions={
        <>
          <Button
            ref={(node) => {
              cancel = node;
            }}
            variant="secondary"
            aria-disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {props.cancelLabel ?? "Go back"}
          </Button>
          <Button
            tone={props.tone ?? "danger"}
            pending={props.pending ?? false}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <Show when={props.error}>
        <Text as="p" variant="bodySmall" class={s.error} role="alert">
          {props.error}
        </Text>
      </Show>
    </Dialog>
  );
}
