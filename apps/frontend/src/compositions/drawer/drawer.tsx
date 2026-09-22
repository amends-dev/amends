/* @refresh reload */
// The parts factory owns one context; replace the composition as a whole during HMR.
import { splitProps, type JSX } from "solid-js";
import { type ButtonProps } from "../../primitives/button/index.ts";
import { IconButton } from "../../primitives/icon-button/index.ts";
import { IconX } from "@amends/icons";
import { createModalParts } from "../../primitives/overlay/modal.tsx";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./drawer.css.ts";
export type { RootProps, ContentProps } from "../../primitives/overlay/modal.tsx";
const parts = createModalParts("Drawer", s);
export const { Root, Trigger, Content, Title, Description, useModal: useDrawer } = parts;
export function Close(props: Omit<ButtonProps, "pending">) {
  const state = parts.context();
  const [local, native] = splitProps(props, ["onClick", "children", "aria-label"]);
  return (
    <IconButton
      {...native}
      aria-label={local["aria-label"] ?? "Close drawer"}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) state.setOpen(false);
      }}
    >
      {local.children ?? <IconX />}
    </IconButton>
  );
}
function part(props: JSX.HTMLAttributes<HTMLDivElement>, base: string) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(base, local.class, local.classList)} />;
}
export const Header = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.header);
export const Body = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.body);
export const Footer = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.footer);
