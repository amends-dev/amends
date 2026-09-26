import { createContext, createSignal, Show, splitProps, useContext, type JSX } from "solid-js";
import {
  Popover,
  type PopoverContentProps,
  type PopoverRootProps,
} from "../../compositions/popover/index.ts";
import { Avatar } from "../../primitives/avatar/index.ts";
import { IconButton } from "../../primitives/icon-button/index.ts";
import { Button, type ButtonProps } from "../../primitives/button/index.ts";
import { Column, Row } from "../../primitives/layout/index.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./account-menu.css.ts";

const Context = createContext<{
  close: () => void;
  /** The trigger, where focus returns when an action takes the reader somewhere else. */
  trigger: () => HTMLElement | undefined;
  setTrigger: (element: HTMLElement) => void;
}>();
export function Root(props: PopoverRootProps) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  let trigger: HTMLElement | undefined;
  const change = (value: boolean) => {
    setOpen(value);
    props.onOpenChange?.(value);
  };
  return (
    <Context.Provider
      value={{
        close: () => change(false),
        trigger: () => trigger,
        setTrigger: (element) => {
          trigger = element;
        },
      }}
    >
      <Popover.Root
        placement={props.placement ?? "right-start"}
        open={props.open ?? open()}
        onOpenChange={change}
      >
        {props.children}
      </Popover.Root>
    </Context.Provider>
  );
}
export function Trigger(props: { label: string; initials: string }) {
  const context = useContext(Context);
  return (
    <Popover.Trigger
      as={IconButton}
      ref={(element: HTMLElement) => context?.setTrigger(element)}
      shape="circle"
      variant="ghost"
      aria-label={props.label}
    >
      <Avatar.Root kind="human" decorative>
        <Avatar.Fallback>{props.initials}</Avatar.Fallback>
      </Avatar.Root>
    </Popover.Trigger>
  );
}
export function Content(props: PopoverContentProps) {
  return <Popover.Content size="wide" {...props} />;
}
/** Who is signed in: their name here, when they chose one, above the identity they sign in as. */
export function Identity(props: { identifier: string; initials: string; name?: string }) {
  return (
    <Row wrap={false} gap={3}>
      <Avatar.Root kind="human" decorative>
        <Avatar.Fallback>{props.initials}</Avatar.Fallback>
      </Avatar.Root>
      <Column gap={0}>
        <Popover.Title>{props.name ?? props.identifier}</Popover.Title>
        <Show when={props.name}>
          <span class={s.identifier}>{props.identifier}</span>
        </Show>
      </Column>
    </Row>
  );
}
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  return <Column gap={1} {...props} />;
}
export function Link(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const context = useContext(Context);
  if (!context) throw new Error("AccountMenu.Link requires AccountMenu.Root.");
  const [local, native] = splitProps(props, ["class", "classList", "onClick"]);
  return (
    <a
      {...native}
      class={classes(s.link, local.class, local.classList)}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !event.currentTarget.hasAttribute("download") &&
          (!event.currentTarget.target || event.currentTarget.target === "_self")
        )
          context.close();
      }}
    />
  );
}
/**
 * An action from the menu, such as changing one's name, set like its links. The menu closes and
 * focus returns to its trigger as the action starts, so a dialog it opens returns focus there.
 */
export function Action(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = useContext(Context);
  if (!context) throw new Error("AccountMenu.Action requires AccountMenu.Root.");
  const [local, native] = splitProps(props, ["class", "classList", "onClick"]);
  return (
    <button
      type="button"
      {...native}
      class={classes(s.item, local.class, local.classList)}
      onClick={(event) => {
        context.close();
        context.trigger()?.focus({ preventScroll: true });
        callHandler(local.onClick, event);
      }}
    />
  );
}
export function SignOut(props: Omit<ButtonProps, "children">) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Button
      variant="ghost"
      tone="danger"
      {...native}
      class={classes(s.action, local.class, local.classList)}
    >
      Sign out
    </Button>
  );
}
