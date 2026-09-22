import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  splitProps,
  untrack,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { Button, type ButtonProps } from "../../primitives/button/index.ts";
import { IconButton } from "../../primitives/icon-button/index.ts";
import { OverlayHostContext } from "../../primitives/overlay/scope.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./drawer.css.ts";

export interface RootProps extends ParentProps {
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  animated?: boolean;
  initialFocus?: () => HTMLElement | undefined;
  returnFocus?: () => HTMLElement | undefined;
}
interface State {
  id: Accessor<string>;
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  animated: Accessor<boolean>;
  initialFocus?: () => HTMLElement | undefined;
  returnFocus?: () => HTMLElement | undefined;
  title: Accessor<boolean>;
  setTitle: (present: boolean) => void;
  description: Accessor<boolean>;
  setDescription: (present: boolean) => void;
}
const Context = createContext<State>();
function context() {
  const state = useContext(Context);
  if (!state) throw new Error("Drawer parts require Drawer.Root");
  return state;
}
export function Root(props: RootProps) {
  const generated = createUniqueId(),
    [internal, setInternal] = createSignal(untrack(() => props.defaultOpen ?? false));
  const [title, setTitle] = createSignal(false),
    [description, setDescription] = createSignal(false);
  return (
    <Context.Provider
      value={{
        id: () => props.id ?? `drawer-${generated}`,
        open: () => props.open ?? internal(),
        setOpen: (open) => {
          if (props.open === undefined) setInternal(open);
          props.onOpenChange?.(open);
        },
        animated: () => props.animated ?? true,
        initialFocus: () => props.initialFocus?.(),
        returnFocus: () => props.returnFocus?.(),
        title,
        setTitle,
        description,
        setDescription,
      }}
    >
      {props.children}
    </Context.Provider>
  );
}
export function useDrawer() {
  const state = context();
  return { open: state.open, close: () => state.setOpen(false) };
}
export function Trigger(props: ButtonProps) {
  const state = context();
  const [local, native] = splitProps(props, ["onClick"]);
  return (
    <Button
      {...native}
      aria-haspopup="dialog"
      aria-expanded={state.open()}
      aria-controls={state.id()}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) state.setOpen(true);
      }}
    />
  );
}
export type ContentProps = Omit<JSX.DialogHtmlAttributes<HTMLDialogElement>, "open" | "id">;
export function Content(props: ContentProps) {
  const state = context();
  const [local, native] = splitProps(props, [
    "ref",
    "class",
    "classList",
    "children",
    "onCancel",
    "onClose",
    "onClick",
    "onPointerDown",
    "onAnimationEnd",
  ]);
  const [element, setElement] = createSignal<HTMLDialogElement>();
  const [phase, setPhase] = createSignal<"open" | "closing" | "closed">("closed");
  let previous: HTMLElement | undefined,
    outsideDown = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const restore = () => {
    if (!previous) return;
    const target = state.returnFocus?.() ?? previous;
    if (target?.isConnected && !target.closest("[hidden], [inert]"))
      target.focus({ preventScroll: true });
    previous = undefined;
  };
  const finish = () => {
    clear();
    const dialog = element();
    if (dialog?.open) dialog.close();
    setPhase("closed");
    restore();
  };
  createEffect(() => {
    const dialog = element(),
      open = state.open(),
      animated = state.animated();
    if (!dialog) return;
    untrack(() => {
      clear();
      if (open) {
        if (!dialog.open) {
          previous =
            dialog.ownerDocument.activeElement instanceof HTMLElement
              ? dialog.ownerDocument.activeElement
              : undefined;
          dialog.showModal();
        }
        setPhase("open");
        (
          state.initialFocus?.() ??
          dialog.querySelector<HTMLElement>("[data-drawer-title]") ??
          dialog
        ).focus({ preventScroll: true });
      } else if (dialog.open) {
        setPhase("closing");
        if (
          !animated ||
          dialog.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
          finish();
        else timer = setTimeout(finish, 220);
      }
    });
  });
  onCleanup(finish);
  const outside = (event: MouseEvent) => {
    const dialog = element();
    if (!dialog || event.target !== dialog) return false;
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };
  return (
    <OverlayHostContext.Provider value={element}>
      <dialog
        {...native}
        id={state.id()}
        tabIndex={-1}
        class={classes(s.content, local.class, local.classList)}
        data-frontend-drawer
        data-phase={phase()}
        data-animated={state.animated()}
        aria-labelledby={
          props["aria-labelledby"] ?? (state.title() ? `${state.id()}-title` : undefined)
        }
        aria-describedby={
          props["aria-describedby"] ??
          (state.description() ? `${state.id()}-description` : undefined)
        }
        ref={(node) => {
          setElement(node);
          if (typeof local.ref === "function") local.ref(node);
        }}
        onCancel={(event) => {
          callHandler(local.onCancel, event);
          if (!event.defaultPrevented) {
            event.preventDefault();
            state.setOpen(false);
          }
        }}
        onClose={(event) => {
          callHandler(local.onClose, event);
          if (!event.currentTarget.open && state.open()) {
            state.setOpen(false);
            restore();
          }
        }}
        onPointerDown={(event) => {
          callHandler(local.onPointerDown, event);
          outsideDown = !event.defaultPrevented && outside(event);
        }}
        onClick={(event) => {
          callHandler(local.onClick, event);
          if (outsideDown && outside(event) && !event.defaultPrevented) state.setOpen(false);
          outsideDown = false;
        }}
        onAnimationEnd={(event) => {
          callHandler(local.onAnimationEnd, event);
          if (event.target === element() && phase() === "closing") finish();
        }}
      >
        {local.children}
      </dialog>
    </OverlayHostContext.Provider>
  );
}
export function Title(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const state = context();
  state.setTitle(true);
  onCleanup(() => state.setTitle(false));
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <h2
      {...native}
      id={`${state.id()}-title`}
      tabIndex={-1}
      data-drawer-title
      class={classes(s.title, local.class, local.classList)}
    />
  );
}
export function Description(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const state = context();
  state.setDescription(true);
  onCleanup(() => state.setDescription(false));
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <p
      {...native}
      id={`${state.id()}-description`}
      class={classes(s.description, local.class, local.classList)}
    />
  );
}
export function Close(props: Omit<ButtonProps, "pending">) {
  const state = context();
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
      {local.children ?? (
        <svg
          viewBox="0 0 24 24"
          width="100%"
          height="100%"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )}
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
