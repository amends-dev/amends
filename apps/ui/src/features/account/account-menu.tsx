import { createContext, createSignal, splitProps, useContext, type JSX } from "solid-js";
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

const Context = createContext<{ close: () => void }>();
export function Root(props: PopoverRootProps) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);
  const change = (value: boolean) => {
    setOpen(value);
    props.onOpenChange?.(value);
  };
  return (
    <Context.Provider value={{ close: () => change(false) }}>
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
  return (
    <Popover.Trigger as={IconButton} shape="circle" variant="ghost" aria-label={props.label}>
      <Avatar.Root kind="human" decorative>
        <Avatar.Fallback>{props.initials}</Avatar.Fallback>
      </Avatar.Root>
    </Popover.Trigger>
  );
}
export function Content(props: PopoverContentProps) {
  return <Popover.Content size="wide" {...props} />;
}
export function Identity(props: { identifier: string; initials: string }) {
  return (
    <Row wrap={false} gap={3}>
      <Avatar.Root kind="human" decorative>
        <Avatar.Fallback>{props.initials}</Avatar.Fallback>
      </Avatar.Root>
      <Popover.Title>{props.identifier}</Popover.Title>
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
