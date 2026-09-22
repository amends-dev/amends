/* @refresh reload */
// The parts factory owns one context; replace the composition as a whole during HMR.
import { splitProps, type JSX } from "solid-js";
import { Button, type ButtonProps } from "../../primitives/button/index.ts";
import { createModalParts } from "../../primitives/overlay/modal.tsx";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./dialog.css.ts";

export type { RootProps, ContentProps } from "../../primitives/overlay/modal.tsx";
const parts = createModalParts("Dialog", s);
export const { Root, Trigger, Content, Title, Description, useModal: useDialog } = parts;

/** A regular Button which closes after a non-cancelled activation. */
export function Close(props: ButtonProps) {
  const state = parts.context();
  const [local, native] = splitProps(props, ["onClick"]);
  return (
    <Button
      {...native}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) state.setOpen(false);
      }}
    />
  );
}
function part(props: JSX.HTMLAttributes<HTMLDivElement>, base: string) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(base, local.class, local.classList)} />;
}
export const Header = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.header);
export const Body = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.body);
export const Footer = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.footer);
